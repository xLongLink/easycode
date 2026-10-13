import type { StandardSchemaV1 } from "@standard-schema/spec"
import { Effect } from "effect"

export const invokeStandardValidator = Effect.fnUntraced(function* (schema: StandardSchemaV1, value: unknown) {
  const result = yield* Effect.try({ try: () => schema["~standard"].validate(value), catch: (error) => error })
  return result instanceof Promise ? yield* Effect.tryPromise({ try: () => result, catch: (error) => error }) : result
})
