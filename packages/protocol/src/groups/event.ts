import { Event } from "@opencode/schema/event"
import { EventManifest } from "@opencode/schema/event-manifest"
import { Location } from "@opencode/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"

const fields = {
  id: Event.ID,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  location: Schema.optional(Location.PublicRef),
}

const rpcEvent = Schema.Struct({
  id: Event.ID,
  created: Schema.Finite,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  type: Schema.TemplateLiteral(["rpc.", Schema.String]),
  location: Location.PublicRef,
  data: Schema.Record(Schema.String, Schema.Unknown),
}).annotate({ identifier: "V2Event.rpc" })

export const OpenCodeEvent = Schema.Union([
  ...EventManifest.ServerDefinitions,
  rpcEvent,
  Schema.Struct({
    ...fields,
    type: Schema.Literal("server.connected"),
    data: Schema.Struct({}),
  }).annotate({ identifier: "V2Event.server.connected" }),
]).annotate({ identifier: "V2Event" })

export const EventGroup = HttpApiGroup.make("server.event")
  .add(
    HttpApiEndpoint.get("event.subscribe", "/api/event", {
      success: HttpApiSchema.StreamSse({ data: OpenCodeEvent }),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "event.subscribe",
        summary: "Subscribe to events",
        description:
          "Subscribe to native events and plugin RPC events across all server locations. Volatile by contract: a slow consumer overflows and fails the stream, and events during disconnection are missed.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "event", description: "Experimental event stream routes." }))

export type OpenCodeEvent = typeof OpenCodeEvent.Type
export type OpenCodeEventEncoded = typeof OpenCodeEvent.Encoded
export const isOpenCodeEvent = (event: { readonly type: string }): event is OpenCodeEvent =>
  event.type === "server.connected" || EventManifest.isServer(event) || event.type.startsWith("rpc.")
