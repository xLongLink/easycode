/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import type { OpenCodeClient, OpenCodeEvent } from "@opencode/client"
import { testRender } from "@opentui/solid"
import { onMount } from "solid-js"
import { ClientProvider, useClient } from "../../../src/context/client"
import { createApi, createEventStream, createFetch } from "../../fixture/tui-client"
import { TestTuiContexts } from "../../fixture/tui-environment"
import type { LogLevel, LogSink } from "../../../src/context/log"

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

function event(payload: OpenCodeEvent, input: { directory: string }): OpenCodeEvent {
  return {
    ...payload,
    location: { directory: input.directory },
  }
}

function vcs(branch: string): OpenCodeEvent {
  return {
    id: `evt_vcs_${branch}`,
    created: 0,
    type: "vcs.branch.updated",
    data: {
      branch,
    },
  }
}

async function mount(reconnect?: (signal: AbortSignal) => Promise<{ api: OpenCodeClient }>, log?: LogSink) {
  const events = createEventStream()
  const calls = createFetch(undefined, events)
  const seen: OpenCodeEvent[] = []
  const directories: Array<string | undefined> = []
  let client!: ReturnType<typeof useClient>
  let done!: () => void
  const ready = new Promise<void>((resolve) => {
    done = resolve
  })
  const service = reconnect ? { reconnect, restart: () => Promise.resolve() } : undefined

  const app = await testRender(() => (
    <TestTuiContexts log={log}>
      <ClientProvider api={createApi(calls.fetch)} service={service}>
        <Probe
          onReady={(ctx) => {
            client = ctx.client
            done()
          }}
          seen={seen}
          directories={directories}
        />
      </ClientProvider>
    </TestTuiContexts>
  ))

  await ready
  return { app, events, emit: events.emit, client, seen, directories }
}

function Probe(props: {
  seen: OpenCodeEvent[]
  directories: Array<string | undefined>
  onReady: (ctx: { client: ReturnType<typeof useClient> }) => void
}) {
  const client = useClient()

  onMount(() => {
    client.event.listen(({ details }) => {
      if (details.type === "server.connected") return
      props.seen.push(details)
      props.directories.push(details.location?.directory)
    })
    props.onReady({ client })
  })

  return <box />
}

describe("client events", () => {
  test("typed listeners exclude other event types and stop after unsubscribe", async () => {
    const { app, emit, client, seen, directories } = await mount()
    const branches: Array<string | undefined> = []
    const unsubscribe = client.event.on("vcs.branch.updated", (evt) => branches.push(evt.data.branch))

    try {
      await wait(() => client.connection.status() === "connected")
      emit(vcs("main"))
      emit({ id: "evt_toast", created: 0, type: "tui.toast.show", data: { message: "Hello", variant: "info" } })
      await wait(() => seen.length === 2)

      expect(seen.map((evt) => evt.type)).toEqual(["vcs.branch.updated", "tui.toast.show"])
      expect(directories).toEqual([undefined, undefined])
      expect(branches).toEqual(["main"])

      unsubscribe()
      emit(event(vcs("next"), { directory: "/tmp/other" }))
      await wait(() => seen.length === 3)
      expect(branches).toEqual(["main"])
      expect(directories).toEqual([undefined, undefined, "/tmp/other"])
    } finally {
      unsubscribe()
      app.renderer.destroy()
    }
  })

  test("logs only durable events", async () => {
    const logs: Array<{ level: LogLevel; message: string; tags: Readonly<Record<string, unknown>> }> = []
    const { app, emit, seen } = await mount(undefined, (level, message, tags) => {
      if (message === "event") logs.push({ level, message, tags })
    })
    const durable = event(
      {
        id: "evt_renamed",
        created: 1,
        type: "session.renamed",
        durable: { aggregateID: "ses_test", seq: 1, version: 1 },
        data: { sessionID: "ses_test", title: "Renamed" },
      },
      { directory: "/tmp/project" },
    )

    try {
      emit(vcs("main"))
      emit(durable)
      await wait(() => seen.length === 2 && logs.length === 1)

      expect(logs).toEqual([
        {
          level: "debug",
          message: "event",
          tags: { component: "client", type: "session.renamed", aggregateID: "ses_test", seq: 1 },
        },
      ])
    } finally {
      app.renderer.destroy()
    }
  })

  test("delivers events for the current project", async () => {
    const { app, emit, seen, directories } = await mount()

    try {
      emit(event(vcs("main"), { directory: "/tmp/other" }))

      await wait(() => seen.length === 1)

      expect(seen).toEqual([event(vcs("main"), { directory: "/tmp/other" })])
      expect(directories).toEqual(["/tmp/other"])
    } finally {
      app.renderer.destroy()
    }
  })

  test("delivers current project events regardless of active directory", async () => {
    const { app, emit, seen } = await mount()

    try {
      emit(event(vcs("ws"), { directory: "/tmp/other" }))

      await wait(() => seen.length === 1)

      expect(seen).toEqual([event(vcs("ws"), { directory: "/tmp/other" })])
    } finally {
      app.renderer.destroy()
    }
  })

  test("delivers truly global events", async () => {
    const { app, emit, seen } = await mount()

    try {
      emit(event(vcs("global"), { directory: "global" }))

      await wait(() => seen.length === 1)

      expect(seen).toEqual([event(vcs("global"), { directory: "global" })])
    } finally {
      app.renderer.destroy()
    }
  })

  test("reconnects to the server after the event stream drops", async () => {
    const attempts: number[] = []
    const replacementEvents = createEventStream()
    const replacementCalls = createFetch(undefined, replacementEvents)
    const replacement = { api: createApi(replacementCalls.fetch) }
    const { app, events, client, seen } = await mount(async () => {
      attempts.push(attempts.length + 1)
      return replacement
    })

    try {
      await wait(() => client.connection.status() === "connected")
      // Reconnection only runs when the stream is down, never while connected.
      expect(attempts).toEqual([])
      events.disconnect()
      await wait(() => client.connection.status() === "connected" && attempts.length > 0)
      replacementEvents.emit(event(vcs("rediscovered"), { directory: "/tmp/rediscovered" }))
      await wait(() => seen.some((item) => item.type === "vcs.branch.updated" && item.data.branch === "rediscovered"))

      expect(client.api).toBe(replacement.api)
      expect(attempts).toEqual([1])
      const history = client.connection.internal.history()
      expect(history.map((event) => [event.data.status, event.data.attempt])).toEqual([
        ["connecting", 0],
        ["connected", 0],
        ["disconnected", 1],
        ["reconnecting", 1],
        ["connected", 1],
      ])
      expect(history.every((event) => Number.isFinite(event.created))).toBe(true)
    } finally {
      app.renderer.destroy()
    }
  })

  test("keeps the current client when reconnection fails", async () => {
    let calls = 0
    const { app, events, client, seen } = await mount(async () => {
      calls += 1
      throw new Error("no server")
    })

    try {
      await wait(() => client.connection.status() === "connected")
      const original = client.api
      events.disconnect()
      // Reconnection rejects; the loop retries against the last known transport,
      // which succeeds once the fixture accepts the reconnect.
      await wait(() => calls > 0 && client.connection.status() === "connected")
      events.emit(event(vcs("recovered"), { directory: "/tmp/recovered" }))
      await wait(() => seen.some((item) => item.type === "vcs.branch.updated" && item.data.branch === "recovered"))

      expect(client.api).toBe(original)
    } finally {
      app.renderer.destroy()
    }
  })

  test("backs off when a resolved event stream keeps failing", async () => {
    let calls = 0
    const encoder = new TextEncoder()
    const replacementCalls = createFetch((url) => {
      if (url.pathname !== "/api/event") return undefined
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"id":"evt_connected","type":"server.connected","data":{}}\n\n'))
            controller.close()
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      )
    })
    const replacement = {
      api: createApi(replacementCalls.fetch),
    }
    const { app, events, client } = await mount(async () => {
      calls += 1
      return replacement
    })

    try {
      await wait(() => client.connection.status() === "connected")
      events.disconnect()
      await Promise.race([
        wait(() => calls === 2),
        Bun.sleep(500).then(() => {
          throw new Error("resolved event stream did not retry immediately")
        }),
      ])
      await Bun.sleep(200)
      expect(calls).toBe(2)
    } finally {
      app.renderer.destroy()
    }
  })

  test("cancels pending endpoint resolution on cleanup", async () => {
    let aborted = false
    const { app, events, client } = await mount(
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true
              reject(signal.reason)
            },
            { once: true },
          )
        }),
    )

    await wait(() => client.connection.status() === "connected")
    events.disconnect()
    await wait(() => client.connection.status() === "reconnecting")
    app.renderer.destroy()
    await wait(() => aborted)
  })
})
