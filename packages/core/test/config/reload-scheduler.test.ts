import { describe, expect } from "bun:test"
import { ConfigReload } from "@opencode/core/config/reload"
import { Deferred, Effect, Fiber, PubSub, Stream } from "effect"
import { advance, drain } from "../lib/clock"
import { it } from "../lib/effect"

describe("ConfigReload.schedule", () => {
  it.effect("eagerly subscribes both sources and coalesces them independently for each caller", () =>
    Effect.gen(function* () {
      const files = yield* PubSub.unbounded<void>()
      const config = yield* PubSub.unbounded<void>()
      const reloads = { agent: 0, command: 0 }
      const triggers = [Stream.fromPubSub(files), Stream.fromPubSub(config)]
      yield* ConfigReload.schedule(
        triggers,
        Effect.sync(() => reloads.agent++),
      )
      yield* ConfigReload.schedule(
        triggers,
        Effect.sync(() => reloads.command++),
      )

      // No yield after startup: both sources must already have subscribers.
      yield* PubSub.publish(files, undefined)
      yield* PubSub.publish(config, undefined)
      yield* advance(() => reloads.agent === 1 && reloads.command === 1)
      yield* drain
      expect(reloads).toEqual({ agent: 1, command: 1 })
    }),
  )

  it.effect("serializes reloads while retaining triggers arriving during a reload", () =>
    Effect.gen(function* () {
      const changes = yield* PubSub.unbounded<void>()
      const release = yield* Deferred.make<void>()
      const reloads: number[] = []
      yield* ConfigReload.schedule(
        [Stream.fromPubSub(changes)],
        Effect.gen(function* () {
          reloads.push(reloads.length + 1)
          if (reloads.length === 1) yield* Deferred.await(release)
        }),
      )
      yield* PubSub.publish(changes, undefined)
      yield* advance(() => reloads.length === 1)
      yield* PubSub.publish(changes, undefined)
      yield* PubSub.publish(changes, undefined)
      yield* drain
      expect(reloads).toEqual([1])

      yield* Deferred.succeed(release, undefined)
      yield* advance(() => reloads.length === 2)
      yield* drain
      expect(reloads).toEqual([1, 2])
    }),
  )

  it.effect("cancels source subscriptions and an active reload when its scope closes", () =>
    Effect.gen(function* () {
      const changes = yield* PubSub.unbounded<void>()
      const ready = yield* Deferred.make<void>()
      const state = { started: 0, cancelled: false, unsubscribed: false }
      const owner = yield* Effect.gen(function* () {
        yield* ConfigReload.schedule(
          [Stream.fromPubSub(changes).pipe(Stream.ensuring(Effect.sync(() => (state.unsubscribed = true))))],
          Effect.sync(() => state.started++).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Effect.sync(() => (state.cancelled = true))),
          ),
        )
        yield* Deferred.succeed(ready, undefined)
        yield* Effect.never
      }).pipe(Effect.scoped, Effect.forkScoped)
      yield* Deferred.await(ready)
      yield* PubSub.publish(changes, undefined)
      yield* advance(() => state.started === 1)
      yield* Fiber.interrupt(owner)
      yield* PubSub.publish(changes, undefined)
      yield* drain
      expect(state).toEqual({ started: 1, cancelled: true, unsubscribed: true })
    }),
  )
})
