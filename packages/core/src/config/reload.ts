export * as ConfigReload from "./reload.js"

import { Effect, PubSub, Stream } from "effect"

export function schedule<E, R, A, E2, R2>(
  triggers: readonly Stream.Stream<unknown, E, R>[],
  reload: Effect.Effect<A, E2, R2>,
) {
  return Effect.gen(function* () {
    // Each call owns one feed and debounce window, serializing its reloads.
    // Subscribe sources eagerly before the caller's initial scan: merge and
    // debounce open upstream a fiber hop later and can miss startup updates.
    const changes = yield* PubSub.sliding<void>(1)
    yield* Effect.forEach(
      triggers,
      (trigger) =>
        trigger.pipe(
          Stream.runForEach(() => PubSub.publish(changes, undefined)),
          Effect.forkScoped({ startImmediately: true }),
        ),
      { discard: true },
    )
    const updates = yield* PubSub.subscribe(changes)
    yield* Stream.fromSubscription(updates).pipe(
      Stream.debounce("100 millis"),
      Stream.runForEach(() => reload),
      Effect.forkScoped({ startImmediately: true }),
    )
  })
}
