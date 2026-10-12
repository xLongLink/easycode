import { expect, test } from "bun:test"
import { EventManifest } from "@opencode/schema/event-manifest"
import { Schema } from "effect"
import { isOpenCodeEvent, OpenCodeEvent, type OpenCodeEventEncoded } from "../src/groups/event.js"

type JsonShape<Value> = Value extends string | number | boolean | null
  ? Value
  : Value extends undefined
    ? never
    : Value extends ReadonlyArray<infer Item>
      ? ReadonlyArray<JsonShape<Item>>
      : Value extends object
        ? {
            readonly [Key in keyof Value as undefined extends Value[Key] ? never : Key]: JsonShape<Value[Key]>
          } & {
            readonly [Key in keyof Value as undefined extends Value[Key] ? Key : never]?: JsonShape<
              Exclude<Value[Key], undefined>
            >
          }
        : Value

// JSON.stringify omits undefined object properties, so normalize them before
// requiring every runtime event shape to fit its encoded wire contract.
const wireReady: [JsonShape<OpenCodeEvent>] extends [JsonShape<OpenCodeEventEncoded>] ? true : false = true

test("classifies public events by type", () => {
  expect(isOpenCodeEvent({ type: "server.connected" })).toBe(true)
  expect(isOpenCodeEvent({ type: "mcp.status.changed" })).toBe(true)
  expect(isOpenCodeEvent({ type: "mcp.resources.changed" })).toBe(true)
  expect(isOpenCodeEvent({ type: "mcp.tools.changed" })).toBe(false)
  expect(isOpenCodeEvent({ type: "rpc.acme.updated" })).toBe(true)
  expect(isOpenCodeEvent({ type: "file.edited" })).toBe(false)
  expect(isOpenCodeEvent({ type: "command.executed" })).toBe(false)
  expect(isOpenCodeEvent({ type: "acme.updated" })).toBe(false)
})

test("uses canonical server schemas and preserves connection and RPC wire payloads", () => {
  expect(OpenCodeEvent.members.slice(0, EventManifest.ServerDefinitions.length)).toEqual([
    ...EventManifest.ServerDefinitions,
  ])
  for (const event of [
    { id: "evt_test", type: "server.connected", data: {} },
    {
      id: "evt_test",
      created: 123,
      type: "rpc.acme.updated",
      location: { directory: "/test" },
      data: { value: "test" },
    },
  ] as const) {
    expect(Schema.encodeSync(OpenCodeEvent)(Schema.decodeUnknownSync(OpenCodeEvent)(event))).toEqual(event)
  }
})

test("keeps public event runtime values within the encoded contract", () => {
  expect(wireReady).toBe(true)
})
