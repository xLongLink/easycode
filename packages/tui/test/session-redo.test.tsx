import { expect, test } from "bun:test"
import { TextRenderable, type Renderable } from "@opentui/core"
import { createAppFixture } from "./fixture/app"
import { directory, json } from "./fixture/tui-client"

test.each([
  { adapter: "command", failure: false },
  { adapter: "command", failure: true },
  { adapter: "banner", failure: false },
  { adapter: "banner", failure: true },
  { adapter: "selection", failure: false },
])("redo through $adapter (failure: $failure)", async ({ adapter, failure }) => {
  const response = Promise.withResolvers<Response>()
  const requests: { path: string; method: string }[] = []
  const session = {
    id: "ses_redo",
    title: "Redo fixture",
    projectID: "proj_test",
    location: { directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 2 },
    revert: { messageID: "msg_reverted", files: [] },
  }
  await using setup = await createAppFixture({
    config: {
      animations: false,
      session: { sidebar: "hide" },
      keybinds: { "session.redo": "f6" },
    },
    args: { sessionID: session.id },
    fetch: (url, request) => {
      if (/^\/api\/session\/[^/]+\/revert$/.test(url.pathname)) {
        requests.push({ path: url.pathname, method: request.method })
        return response.promise
      }
      if (url.pathname === "/api/session") return json({ data: [session], cursor: {} })
      if (url.pathname === `/api/session/${session.id}`) return json({ data: session })
      if (url.pathname === `/api/session/${session.id}/message`)
        return json({
          data: [{ id: "msg_reverted", type: "user", text: "Reverted input", time: { created: 1 } }],
          cursor: {},
        })
      if (url.pathname === `/api/session/${session.id}/inbox`) return json({ data: [] })
      return undefined
    },
  })
  try {
    const initial = await setup.waitForFrame((frame) => frame.includes("1 message reverted"))
    expect(initial).toContain("f6 or /redo to restore")
    const lines = initial.split("\n")
    const row = lines.findIndex((line) => line.includes("1 message reverted"))
    const column = lines[row].indexOf("1 message reverted")
    if (adapter === "selection") {
      const find = (root: Renderable): TextRenderable | undefined =>
        root instanceof TextRenderable && root.plainText === "1 message reverted"
          ? root
          : root.getChildren().map(find).find(Boolean)
      const text = find(setup.renderer.root)
      if (!text) throw new Error("Revert banner text was not mounted")
      await setup.mockMouse.pressDown(column, row)
      setup.renderer.startSelection(text, column, row)
      setup.renderer.updateSelection(text, column + 8, row)
      expect(setup.renderer.getSelection()?.getSelectedText()).toBeTruthy()
      await setup.mockMouse.release(column + 8, row)
      await setup.renderOnce()
      expect(requests).toEqual([])
      expect(setup.captureCharFrame()).not.toContain("Redo denied")
      return
    }
    if (adapter === "command") setup.mockInput.pressKey("F6")
    if (adapter === "banner") await setup.mockMouse.click(column, row)
    await setup.waitFor(() => requests.length === 1)

    // Opening a dialog while the request is pending exposes each adapter's
    // dismissal policy without the command palette's own immediate dismissal.
    setup.mockInput.pressKey("o", { ctrl: true })
    await setup.waitForFrame((frame) => frame.includes("Search sessions"))
    expect(setup.captureCharFrame()).not.toContain("Redo denied")
    expect(requests).toEqual([{ path: `/api/session/${session.id}/revert`, method: "DELETE" }])
    response.resolve(failure ? json({ message: "Redo denied" }, { status: 409 }) : new Response(null, { status: 204 }))
    if (adapter === "command") {
      await setup.waitForFrame((frame) => !frame.includes("Search sessions"))
    }
    if (failure) await setup.waitForFrame((frame) => frame.includes("Redo denied"))
    await setup.waitForVisualIdle({ quietFrames: 3 })
    const completed = setup.captureCharFrame()
    expect(completed.includes("Search sessions")).toBe(adapter === "banner")
    expect(completed.match(/Redo denied/g) ?? []).toHaveLength(failure ? 1 : 0)
    expect(requests).toEqual([{ path: `/api/session/${session.id}/revert`, method: "DELETE" }])
  } finally {
    response.resolve(new Response(null, { status: 204 }))
  }
})
