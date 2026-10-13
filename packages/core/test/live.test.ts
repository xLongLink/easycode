import { expect } from "bun:test"
import { Effect } from "effect"
import Live from "@opencode/live"
import { GptLive } from "@opencode/live/rpc"
import { Plugin } from "@opencode/core/plugin"
import { PluginPromise } from "@opencode/core/plugin/promise"
import { Rpc } from "@opencode/core/rpc"
import { Credential } from "@opencode/core/credential"
import { Integration } from "@opencode/core/integration"
import { testEffect } from "./lib/effect"
import { PluginTestLayer } from "./plugin/fixture"

const it = testEffect(PluginTestLayer)
const registerOpenAI = Effect.gen(function* () {
  const integrations = yield* Integration.Service
  yield* integrations.transform((editor) =>
    editor.update(Integration.ID.make("openai"), (integration) => {
      integration.name = "OpenAI"
    }),
  )
})

it.live("activates the live server plugin and its RPC without audio devices or credentials", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const rpc = yield* Rpc.Service
    yield* plugins.activate([{ ...PluginPromise.fromPromise(Live), revision: "test" }])
    expect((yield* plugins.list()).find((plugin) => plugin.id === Live.id)?.state.status).toBe("active")
    const client = rpc.client(GptLive)
    expect((yield* client.status({})).signedIn).toBe(false)
    expect(yield* client.stop({ callID: "missing" })).toEqual({ stopped: false })
    expect(yield* client.alive({ callID: "missing" })).toEqual({ active: false })
  }),
)

for (const scenario of [
  { name: "legacy Codex metadata", metadata: { accountID: "account" }, token: "opaque-codex-token", plan: undefined },
  {
    name: "legacy Codex JWT",
    metadata: {},
    token: `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "account", chatgpt_plan_type: "plus" } })).toString("base64url")}.signature`,
    plan: "plus",
  },
]) {
  it.live(`recognizes ${scenario.name} through the real credential resolver`, () =>
    Effect.gen(function* () {
      yield* registerOpenAI
      const plugins = yield* Plugin.Service
      const rpc = yield* Rpc.Service
      const credentials = yield* Credential.Service
      yield* credentials.create({
        integrationID: Integration.ID.make("openai"),
        value: Credential.OAuth.make({
          type: "oauth",
          methodID: Integration.MethodID.make("chatgpt-browser"),
          access: scenario.token,
          refresh: "test-refresh",
          expires: Date.now() + 3_600_000,
          metadata: scenario.metadata,
        }),
      })
      yield* plugins.activate([{ ...PluginPromise.fromPromise(Live), revision: "test" }])
      const status = yield* rpc.client(GptLive).status({})
      expect(status.signedIn).toBe(true)
      expect(status.plan).toBe(scenario.plan)
    }),
  )
}

it.live("reports token sharing as connected but incompatible with the Codex voice backend", () =>
  Effect.gen(function* () {
    yield* registerOpenAI
    const plugins = yield* Plugin.Service
    const rpc = yield* Rpc.Service
    const credentials = yield* Credential.Service
    yield* credentials.create({
      integrationID: Integration.ID.make("openai"),
      value: Credential.OAuth.make({
        type: "oauth",
        methodID: Integration.MethodID.make("chatgpt-token-sharing"),
        access: "opaque-sharing-token",
        refresh: "test-refresh",
        expires: Date.now() + 3_600_000,
        metadata: { clientID: "client", scopes: ["chatgpt.tokens.use.direct"] },
      }),
    })
    yield* plugins.activate([{ ...PluginPromise.fromPromise(Live), revision: "test" }])
    expect((yield* rpc.client(GptLive).status({})).signedIn).toBe(false)
    const error = yield* rpc.call(GptLive.id, "start", { sessionID: "session", sdp: "offer" }).pipe(Effect.flip)
    expect(error.message).toContain("token-sharing sign-in is connected")
    expect(error.message).toContain("Codex browser (legacy)")
    expect(error.message).not.toContain("opaque-sharing-token")
  }),
)

it.live("uses saved legacy voice credentials without changing the selected token-sharing connection", () =>
  Effect.gen(function* () {
    yield* registerOpenAI
    const plugins = yield* Plugin.Service
    const rpc = yield* Rpc.Service
    const credentials = yield* Credential.Service
    const integrations = yield* Integration.Service
    yield* credentials.create({
      integrationID: Integration.ID.make("openai"),
      value: Credential.OAuth.make({
        type: "oauth",
        methodID: Integration.MethodID.make("chatgpt-headless"),
        access: "legacy-token",
        refresh: "test-refresh",
        expires: Date.now() + 3_600_000,
        metadata: { accountID: "account" },
      }),
    })
    const selected = yield* credentials.create({
      integrationID: Integration.ID.make("openai"),
      value: Credential.OAuth.make({
        type: "oauth",
        methodID: Integration.MethodID.make("chatgpt-token-sharing"),
        access: "sharing-token",
        refresh: "test-refresh",
        expires: Date.now() + 3_600_000,
        metadata: { clientID: "client" },
      }),
    })
    yield* plugins.activate([{ ...PluginPromise.fromPromise(Live), revision: "test" }])
    expect((yield* rpc.client(GptLive).status({})).signedIn).toBe(true)
    expect(yield* integrations.connection.active(Integration.ID.make("openai"))).toMatchObject({ type: "credential", id: selected.id })
  }),
)
