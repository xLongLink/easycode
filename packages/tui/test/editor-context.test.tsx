import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { EditorContextProvider, useEditorContext } from "../src/context/editor"
import { TuiPathsProvider } from "../src/context/runtime"

const renderers: Awaited<ReturnType<typeof testRender>>["renderer"][] = []

afterEach(() => {
  renderers.splice(0).forEach((renderer) => renderer.destroy())
})

async function setup() {
  const sockets: Socket[] = []
  class Socket extends EventTarget {
    readyState = 0
    sent: { jsonrpc: string; id?: number; method: string; params?: unknown }[] = []

    constructor(readonly url: string) {
      super()
      sockets.push(this)
    }

    open() {
      this.readyState = 1
      this.dispatchEvent(new Event("open"))
    }

    send(data: string) {
      this.sent.push(JSON.parse(data))
    }

    message(data: Record<string, unknown>) {
      this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ jsonrpc: "2.0", ...data }) }))
    }

    close() {
      this.readyState = 3
      this.dispatchEvent(new Event("close"))
    }
  }

  let editor: ReturnType<typeof useEditorContext>
  const directories: string[] = []
  function Capture() {
    editor = useEditorContext()
    return <text>editor</text>
  }

  const app = await testRender(() => (
    <TuiPathsProvider value={{ cwd: "/work", home: "/home/test", state: "/state", worktree: "/work" }}>
      <EditorContextProvider
        WebSocketImpl={Socket as unknown as typeof WebSocket}
        integration={{
          connection(directory) {
            directories.push(directory)
            return { url: "ws://editor", source: "test" }
          },
        }}
      >
        <Capture />
      </EditorContextProvider>
    </TuiPathsProvider>
  ))
  renderers.push(app.renderer)
  await app.renderOnce()
  expect(sockets).toHaveLength(1)
  return { editor: editor!, sockets, directories }
}

test.each([
  {
    name: "valid",
    response: { result: { protocolVersion: "2025-11-25", serverInfo: { name: "editor", version: "1" } } },
    initialized: true,
  },
  {
    name: "error",
    response: { error: { code: -32603, message: "initialization failed" }, result: {} },
    initialized: false,
  },
  { name: "invalid", response: { result: { protocolVersion: 123 } }, initialized: false },
])("editor handshake gates initialized notification for $name responses", async ({ response, initialized }) => {
  const context = await setup()
  expect(context.editor.connected()).toBe(false)
  context.sockets[0]!.open()
  expect(context.editor.connected()).toBe(true)
  expect(context.sockets[0]!.sent).toEqual([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "opencode", version: "0.0.0" } },
    },
  ])
  context.sockets[0]!.message({ id: 999, result: {} })
  expect(context.sockets[0]!.sent).toHaveLength(1)
  context.sockets[0]!.message({ id: 1, ...response })
  expect(context.sockets[0]!.sent.slice(1)).toEqual(
    initialized ? [{ jsonrpc: "2.0", method: "notifications/initialized" }] : [],
  )
  // A response consumes its request even when it fails validation or reports an error.
  context.sockets[0]!.message({ id: 1, result: {} })
  expect(context.sockets[0]!.sent).toHaveLength(initialized ? 2 : 1)
})

test("editor selection and fresh initialization survive directory reconnects", async () => {
  const context = await setup()
  context.sockets[0]!.open()
  context.sockets[0]!.message({ id: 1, result: {} })
  const selection = {
    filePath: "/work/file.ts",
    text: "selected",
    selection: { start: { line: 1, character: 0 }, end: { line: 1, character: 8 } },
  }
  context.sockets[0]!.message({ method: "selection_changed", params: selection })
  expect(context.editor.selection()).toEqual({
    filePath: selection.filePath,
    ranges: [{ text: selection.text, selection: selection.selection }],
    source: "websocket",
  })
  expect(context.editor.labelState()).toBe("pending")
  context.editor.markSelectionSent()
  expect(context.editor.labelState()).toBe("sent")
  context.editor.preserveSelectionFromNewSession()
  context.editor.reconnect("/other")
  expect(context.sockets[0]!.readyState).toBe(3)
  expect(context.sockets).toHaveLength(2)
  expect(context.directories).toEqual(["/work", "/other"])
  expect(context.editor.connected()).toBe(false)
  expect(context.editor.labelState()).toBe("sent")
  context.sockets[1]!.open()
  expect(context.sockets[1]!.sent[0]!.method).toBe("initialize")
  expect(context.sockets[1]!.sent[0]!.id).toBe(2)
  context.sockets[1]!.message({ id: 2, result: {} })
  expect(context.sockets[1]!.sent[1]).toEqual({ jsonrpc: "2.0", method: "notifications/initialized" })
  expect(context.editor.connected()).toBe(true)
  context.editor.reconnect("/other")
  expect(context.sockets).toHaveLength(2)
  expect(context.editor.selection()).toBeUndefined()
  expect(context.editor.labelState()).toBe("none")
})
