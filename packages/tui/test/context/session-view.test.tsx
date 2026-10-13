/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ClientProvider, useClient } from "../../src/context/client"
import { DataProvider, useData } from "../../src/context/data"
import { RouteProvider, useRoute } from "../../src/context/route"
import { SessionViewProvider, useSessionView } from "../../src/context/session-view"
import { createApi, createEventStream, createFetch, directory, json } from "../fixture/tui-client"
import { TestTuiContexts } from "../fixture/tui-environment"

async function wait(fn: () => boolean) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > 2_000) throw new Error("timed out waiting for session view")
    await Bun.sleep(10)
  }
}

async function renderSessionView(options?: { viewFailures?: number }) {
  const events = createEventStream()
  const views: { sessionID: string; idle: number }[] = []
  const viewedAt: Record<string, number> = {}
  const calls = createFetch(async (url, request) => {
    const viewed = url.pathname.match(/^\/api\/session\/([^/]+)\/view$/)?.[1]
    if (viewed && request.method === "POST") {
      views.push({ sessionID: viewed, idle: (await request.json()).idle })
      if (views.length <= (options?.viewFailures ?? 0)) return new Response(null, { status: 503 })
      viewedAt[viewed] = 2
      return new Response(null, { status: 204 })
    }
    const sessionID = url.pathname.match(/^\/api\/session\/([^/]+)$/)?.[1]
    if (!sessionID) return undefined
    return json({
      data: {
        id: sessionID,
        parentID: sessionID === "child" ? "root" : undefined,
        projectID: "project",
        location: { directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: 0, updated: 0, idle: 2, viewed: viewedAt[sessionID] },
      },
    })
  }, events)
  let view!: ReturnType<typeof useSessionView>
  let route!: ReturnType<typeof useRoute>
  let client!: ReturnType<typeof useClient>
  let data!: ReturnType<typeof useData>
  function Probe() {
    view = useSessionView()
    route = useRoute()
    client = useClient()
    data = useData()
    return <box />
  }
  const app = await testRender(() => (
    <TestTuiContexts>
      <RouteProvider initialRoute={{ type: "home" }}>
        <ClientProvider api={createApi(calls.fetch)}>
          <DataProvider directory={directory}>
            <SessionViewProvider>
              <Probe />
            </SessionViewProvider>
          </DataProvider>
        </ClientProvider>
      </RouteProvider>
    </TestTuiContexts>
  ))
  await wait(() => client.connection.status() === "connected")
  await data.session.sync("root")
  await data.session.sync("child")
  return {
    view,
    route,
    data,
    views,
    events,
    renderer: app.renderer,
    [Symbol.dispose]: () => app.renderer.destroy(),
  }
}

test("acknowledges the selected session only after focus is confirmed", async () => {
  using setup = await renderSessionView()
  setup.route.navigate({ type: "session", sessionID: "root" })
  await Bun.sleep(20)
  expect(setup.views).toEqual([])
  setup.renderer.emit("blur")
  await Bun.sleep(20)
  expect(setup.views).toEqual([])
  setup.renderer.emit("focus")
  await wait(() => setup.views.length === 1)
  expect(setup.views).toEqual([{ sessionID: "root", idle: 2 }])
  setup.events.emit({
    id: "evt_viewed_root",
    created: 3,
    type: "session.viewed",
    durable: { aggregateID: "root", seq: 2, version: 1 },
    data: { sessionID: "root", idle: 2 },
    location: { directory },
  })
  await wait(() => setup.data.session.get("root")?.time.viewed === 2)
  expect(setup.views).toHaveLength(1)
})

test("retries a failed view acknowledgement and acknowledges the root for subagents", async () => {
  using setup = await renderSessionView({ viewFailures: 1 })
  setup.route.navigate({ type: "session", sessionID: "child" })
  setup.renderer.emit("focus")
  await wait(() => setup.views.length === 2)
  expect(setup.views).toEqual([
    { sessionID: "root", idle: 2 },
    { sessionID: "root", idle: 2 },
  ])
})

test("preserves scroll anchors and expanded groups when switching sessions", async () => {
  using setup = await renderSessionView()
  const anchor = { target: { type: "part" as const, ref: { messageID: "msg_root", partID: "message" } }, screenY: 3 }
  setup.view.setScrollAnchor("root", anchor)
  setup.view.setGroupExpanded("root", "group", true)
  setup.route.navigate({ type: "session", sessionID: "child" })
  setup.route.navigate({ type: "session", sessionID: "root" })
  expect(setup.view.scrollAnchor("root")).toEqual(anchor)
  expect(setup.view.groupExpanded("root", "group")).toBe(true)
  setup.view.setScrollAnchor("root", undefined)
  expect(setup.view.scrollAnchor("root")).toBeUndefined()
})

test("keeps family questions and permissions visible after selection", async () => {
  using setup = await renderSessionView()
  expect(setup.view.attention("root")).toBe(false)
  setup.events.emit({
    id: "evt_question",
    created: 1,
    type: "form.created",
    data: {
      form: {
        id: "frm_question",
        sessionID: "child",
        title: "Choose an approach",
        fields: [{ key: "approach", type: "string", title: "Approach" }],
      },
    },
    location: { directory },
  })
  await wait(() => setup.view.attention("root") === "question")
  setup.route.navigate({ type: "session", sessionID: "root" })
  expect(setup.view.attention("root")).toBe("question")
  setup.events.emit({
    id: "evt_permission",
    created: 2,
    type: "permission.asked",
    data: { id: "per_command", sessionID: "root", action: "shell", resources: ["bun run test"] },
    location: { directory },
  })
  await wait(() => setup.view.attention("root") === "permission")
  expect(setup.view.attention("child")).toBe("permission")
})
