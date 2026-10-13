import { expect, test } from "bun:test"
import { createAppFixture } from "./fixture/app"
import { directory, json } from "./fixture/tui-client"
import { tmpdir } from "./fixture/fixture"

const location = { directory, project: { id: "project", directory, canonical: directory } }
const session = {
  id: "ses_clear",
  title: "Session to clear",
  projectID: "project",
  location: { directory },
  agent: "build",
  model: { providerID: "provider", id: "model" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 0, updated: 0 },
}

function render(state: string) {
  return createAppFixture({
    state,
    args: { sessionID: session.id },
    config: { animations: false },
    fetch: (url) => {
      if (url.pathname === "/api/fs/list") return json({ location, data: [] })
      if (url.pathname === "/api/location") return json(location)
      if (url.pathname === "/api/session") return json({ data: [session], cursor: {} })
      if (url.pathname === `/api/session/${session.id}`) return json({ data: session })
      if (/^\/api\/session\/[^/]+\/(message|inbox|permission)$/.test(url.pathname))
        return json({
          data: url.pathname.endsWith("/message")
            ? [{ type: "user", id: "msg_clear", text: "Content to clear", time: { created: 0 } }]
            : [],
          cursor: {},
        })
      if (url.pathname === "/api/agent")
        return json({ location, data: [{ id: "build", mode: "primary", hidden: false, permissions: [] }] })
      if (url.pathname === "/api/provider") return json({ location, data: [{ id: "provider", name: "Provider" }] })
      if (url.pathname === "/api/model")
        return json({
          location,
          data: [{ id: "model", providerID: "provider", name: "Model", variants: [] }],
        })
    },
  })
}

test("/clear opens a fresh prompt", async () => {
  await using state = await tmpdir()
  await using setup = await render(state.path)

  await setup.waitForFrame((frame) => frame.includes("Content to clear"))
  await setup.mockInput.typeText("/clear")
  setup.mockInput.pressEnter()
  const frame = await setup.waitForFrame((frame) => !frame.includes("Content to clear"))

  expect(frame).not.toContain("Content to clear")
})

test("/new opens a fresh prompt without deleting the previous session", async () => {
  await using state = await tmpdir()
  await using setup = await render(state.path)

  await setup.waitForFrame((frame) => frame.includes("Content to clear"))
  await setup.mockInput.typeText("/new")
  setup.mockInput.pressEnter()
  const frame = await setup.waitForFrame((frame) => !frame.includes("Content to clear"))
  expect(frame).not.toContain("Content to clear")
  await setup.mockInput.typeText("/sessions")
  setup.mockInput.pressEnter()
  await setup.waitForFrame((frame) => frame.includes("Session to clear"))
})
