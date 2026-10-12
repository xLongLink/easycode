export * as EventLogger from "./event-logger.js"

import { Effect, Layer } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Bus } from "./bus.js"
import { Agent } from "@opencode/schema/agent"
import { Provider } from "@opencode/schema/provider"
import { Model } from "@opencode/schema/model"
import { Command } from "@opencode/schema/command"
import { Config } from "@opencode/schema/config"

const EVENT_TYPES = new Set<string>([
  Agent.Event.Updated.type,
  Provider.Event.Updated.type,
  Model.Event.Updated.type,
  Command.Event.Updated.type,
  Config.Event.Updated.type,
])

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const unsubscribe = yield* bus.listen((event) =>
      EVENT_TYPES.has(event.type) ? Effect.logInfo("event", { event }) : Effect.void,
    )
    yield* Effect.addFinalizer(() => unsubscribe)
  }),
)

export const node = makeGlobalNode({ name: "event-logger", layer, deps: [Bus.node] })
