import { expect, test } from "bun:test"
import type { StandardSchemaV1 } from "@standard-schema/spec"
import { Cause, Effect, Exit, Fiber } from "effect"
import { invokeStandardValidator } from "../src/util/standard-schema"

test("standard validator invocation is lazy and preserves synchronous results", () => {
  const calls: unknown[] = []
  const result = { value: "parsed" }
  const schema: StandardSchemaV1 = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => {
        calls.push(value)
        return result
      },
    },
  }
  const validation = invokeStandardValidator(schema, "raw")
  expect(calls).toEqual([])
  expect(Effect.runSync(validation)).toBe(result)
  expect(calls).toEqual(["raw"])
})

test.each([new Error("validator failed"), "foreign failure", undefined])(
  "standard validator preserves synchronous throws and native Promise rejections: %p",
  async (error) => {
    for (const validate of [
      () => {
        throw error
      },
      () => Promise.reject(error),
    ]) {
      expect(
        await Effect.runPromise(
          Effect.flip(invokeStandardValidator({ "~standard": { version: 1, vendor: "test", validate } }, null)),
        ),
      ).toBe(error)
    }
  },
)

test("standard validator awaits native Promises without altering issues", async () => {
  const result = { issues: [{ message: "invalid", path: ["field"] }] }
  expect(
    await Effect.runPromise(
      invokeStandardValidator(
        { "~standard": { version: 1, vendor: "test", validate: () => Promise.resolve(result) } },
        null,
      ),
    ),
  ).toBe(result)
})

test("standard validator does not assimilate non-Promise thenables", () => {
  const result = {
    value: "parsed",
    then: () => {
      throw new Error("must not await a thenable")
    },
  }
  expect(
    Effect.runSync(
      invokeStandardValidator({ "~standard": { version: 1, vendor: "test", validate: () => result } }, null),
    ),
  ).toBe(result)
})

test("pending native Promise validation remains interruptible", async () => {
  const started = Promise.withResolvers<void>()
  const pending = Promise.withResolvers<StandardSchemaV1.Result<unknown>>()
  const fiber = Effect.runFork(
    invokeStandardValidator(
      {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: () => {
            started.resolve()
            return pending.promise
          },
        },
      },
      null,
    ),
  )
  await started.promise
  await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.timeout("1 second")))
  const exit = await Effect.runPromise(Fiber.await(fiber))
  expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  pending.resolve({ value: "late" })
  expect(await Effect.runPromise(Fiber.await(fiber))).toBe(exit)
})
