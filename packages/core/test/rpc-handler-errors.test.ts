import { expect } from "bun:test"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Location } from "@opencode/core/location"
import { Rpc } from "@opencode/core/rpc"
import { AbsolutePath } from "@opencode/core/schema"
import { Effect, Fiber, Layer, Logger, Option, Schema, Stream } from "effect"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(Rpc.node, [
    Location.node.replace(Layer.succeed(Location.Service, location({ directory: AbsolutePath.make("/rpc-project") }))),
  ]),
)
const Broken = Rpc.define({
  id: "broken",
  methods: {
    dies: { input: Schema.Undefined, output: Schema.String },
    throws: { input: Schema.Undefined, output: Schema.String },
    raw: { input: Schema.Undefined, output: Schema.String },
    undeclared: { input: Schema.Undefined, output: Schema.String },
    invalidError: {
      input: Schema.Undefined,
      output: Schema.String,
      errors: { known: Schema.Struct({ count: Schema.Int }) },
    },
  },
  events: {},
})

it.effect("Standard Schema input, output, and declared error transforms run exactly once", () =>
  Effect.gen(function* () {
    const rpc = yield* Rpc.Service
    const calls: unknown[] = []
    const schema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: (value: unknown) => {
          calls.push(value)
          return { value: `${String(value)}:parsed` }
        },
      },
    }
    const definition = Rpc.define({
      id: "transformed",
      methods: {
        success: { input: schema, output: schema },
        failure: { input: schema, output: schema, errors: { known: schema } },
      },
      events: {},
    })
    yield* rpc.register(definition, {
      success: (input) => Effect.succeed(input),
      failure: (input, context) => Effect.fail(context.error("known", "Known", input)),
    })
    expect(yield* rpc.client(definition).success("input")).toBe("input:parsed:parsed")
    expect(calls).toEqual(["input", "input:parsed"])
    calls.length = 0
    expect(yield* rpc.client(definition).failure("error").pipe(Effect.flip)).toEqual({
      type: "known",
      message: "Known",
      data: "error:parsed:parsed",
    })
    expect(calls).toEqual(["error", "error:parsed"])
  }),
)

it.effect("Standard Schema event transforms run once before subscriber reads", () =>
  Effect.gen(function* () {
    const rpc = yield* Rpc.Service
    const calls: unknown[] = []
    const definition = Rpc.define({
      id: "transformed-event",
      methods: {},
      events: {
        changed: {
          schema: {
            "~standard": {
              version: 1,
              vendor: "test",
              validate: (value: unknown) => {
                calls.push(value)
                return { value: { parsed: value } }
              },
            },
          },
        },
      },
    })
    const registration = yield* rpc.register(definition, {})
    const subscriber = yield* rpc
      .client(definition)
      .events.subscribe("changed")
      .pipe(Stream.runHead, Effect.forkChild({ startImmediately: true }))
    yield* registration.events.emit("changed", { raw: true })
    expect(Option.getOrThrow(yield* Fiber.join(subscriber)).data).toEqual({ parsed: { raw: true } })
    expect(calls).toEqual([{ raw: true }])
  }),
)

for (const mode of ["throw", "reject", "issues"] as const) {
  it.effect(`Standard Schema ${mode} preserves RPC input and output failures`, () =>
    Effect.gen(function* () {
      const rpc = yield* Rpc.Service
      const schema = {
        "~standard": {
          version: 1 as const,
          vendor: "test",
          validate: () => {
            if (mode === "issues") return { issues: [{ message: "first" }, { message: "second" }] }
            if (mode === "reject") return Promise.reject(new Error("validator failed"))
            throw new Error("validator failed")
          },
        },
      }
      const definition = Rpc.define({
        id: `validator-${mode}`,
        methods: {
          input: { input: schema, output: Schema.String },
          output: { input: Schema.String, output: schema },
        },
        events: {},
      })
      yield* rpc.register(definition, {
        input: () => Effect.die("invalid input must not execute"),
        output: (input) => Effect.succeed(input),
      })
      expect(yield* rpc.call(definition.id, "input", "raw").pipe(Effect.flip)).toEqual({
        type: "rpc.invalid_input",
        message: mode === "issues" ? "first\nsecond" : "validator failed",
      })
      expect(yield* rpc.call(definition.id, "output", "raw").pipe(Effect.flip)).toEqual({
        type: "rpc.invalid_output",
        message: mode === "issues" ? "first\nsecond" : "validator failed",
      })
    }),
  )
}

for (const method of ["dies", "throws", "raw", "undeclared", "invalidError"] as const) {
  it.effect(`recovers from ${method} through the typed rpc.internal failure`, () =>
    Effect.gen(function* () {
      const rpc = yield* Rpc.Service
      yield* rpc.register(Broken, {
        dies: () => Effect.die(new Error("handler defect")),
        throws: () => {
          throw new Error("handler threw")
        },
        // Raw Promise rejections reach this boundary as failed Effects.
        // @ts-expect-error intentionally exercise an undeclared failure
        raw: () => Effect.fail(new Error("raw failure")),
        // @ts-expect-error intentionally exercise an undeclared error name
        undeclared: (_input, context) => Effect.fail(context.error("unknown", "Unknown")),
        invalidError: (_input, context) => Effect.fail(context.error("known", "Invalid count", { count: 1.5 })),
      })
      const logged: unknown[] = []
      const result = yield* rpc
        .client(Broken)
        [method]()
        .pipe(
          Effect.catchIf(
            (error) => "type" in error && error.type === "rpc.internal",
            (error) => Effect.succeed(error),
          ),
          Effect.provideService(Logger.CurrentLoggers, new Set([Logger.make((entry) => logged.push(entry.message))])),
        )
      expect(result).toEqual({ type: "rpc.internal", message: "RPC call failed" })
      expect(logged).toHaveLength(1)
    }),
  )
}
