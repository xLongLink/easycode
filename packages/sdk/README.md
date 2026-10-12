# @opencode/sdk

In-process OpenCode host for Promise and Effect applications. The SDK executes Server's assembled HTTP router in memory, opening no listener and adding no network hop.

```ts
import { OpenCode } from "@opencode/sdk"

await using opencode = await OpenCode.create()
const session = await opencode.sessions.create({
  location: { directory: "/workspace" },
})
```

Pass imported Promise plugins in `plugins`, or register one later with `await opencode.plugin(plugin)`.

The Promise API uses the same values, errors, request options, and `AsyncIterable` streams as `@opencode/client`.

Embedded hosts are silent by default. Set `log` to receive structured log entries:

```ts
await using opencode = await OpenCode.create({
  log: {
    level: "warn",
    emit: (entry) => console.error(entry.message, entry.attributes, entry.cause),
  },
})
```

`close()` and `Symbol.asyncDispose` release router resources, Location services, fibers, and scoped plugin registrations.

## Session-Selected Plugins

Use `instances` when Sessions in the same directory need different application plugins. The application selects a stable key from Session metadata; the SDK constructs and caches an instance for that key and the Session's current Location.

```ts
import { OpenCode } from "@opencode/sdk"
import { threads } from "./threads"
import { slackPlugin } from "./slack-plugin"

await using opencode = await OpenCode.create({
  database: { path: "./sessions.db" },
  instances: {
    key(session) {
      const threadID = session.metadata?.threadID
      if (typeof threadID !== "string") throw new Error("Session has no thread ID")
      return threadID
    },
    configure: async (threadID) => ({
      plugins: [slackPlugin(await threads.get(threadID))],
    }),
  },
})

const session = await opencode.sessions.create({
  location: { directory: "/workspace" },
  metadata: { threadID: "thread-42" },
})
await opencode.sessions.prompt({ sessionID: session.id, text: "Review the changes" })
```

`threads` and `slackPlugin` are application-owned modules. `key` is synchronous and should only select identity, not initialize plugins. `configure` returns plugin definitions; their setup receives the selected instance's `ctx.location`.

- The same key and Location share one live instance. Different directories or workspace IDs always select separate instances, even with the same application key.
- `configure` runs on a cache miss, not on each prompt. Loaded instances live until the host closes; change the application key or restart the host to reconstruct their birth configuration. Plugin transforms and reloads remain available within that lifetime.
- Session metadata, message, inbox, and context reads do not initialize plugins; permission and form lists read instance services and therefore acquire the Session's instance. Configuration failure or a supplied plugin reported as failed after activation, including initial setup failure or an ID that collides with a host `plugins` entry (the host plugin keeps the ID), prevents capability acquisition, without falling back to another instance. A subsequent request can retry a failed construction.
- Existing HTTP prompt middleware also acquires capabilities for an idempotent retry. After restart, that retry can reconstruct plugins before returning the original admission; prompt preparation and hooks do not rerun. Configuration failure can therefore block the retry even when its input was already saved.
- Instance selection is not an authorization or storage-isolation boundary. Plugin Session APIs and the existing plugin-ID-based durable storage retain their normal scope.
- Omitting `instances` preserves default Location sharing. Host-wide plugins remain separate from Session-selected configuration; retain host-wide catalog policy when locationless generation needs it.

### Restart and Lifetime

The selector is installed before automatic recovery starts. Its callbacks must be able to load application data without depending on the returned `opencode` handle or a later registration call. Functions are reconstructed, not serialized.

Use a persistent `database.path` to recover Sessions after restart; the default database is in memory. After restart, the next capability-dependent operation or recovery drain rebuilds the selected instance from saved Session metadata and application data.

Promise plugin resources should be acquired in `setup` and released by its cleanup function. Effect configuration can acquire resources in its supplied instance Scope and require services provided to the SDK entrypoint (see the Effect section).

## Supported Runtimes

This fork supports local Bun and Node runtimes. The former `@opencode/sdk/workerd` and `@opencode/sdk/workerd/effect` entrypoints and Durable Object storage adapter have been removed. Existing Cloudflare deployments must remain on a compatible version or migrate their application and data separately; there is no automatic storage migration.

## Effect

The Effect-native API remains available from `@opencode/sdk/effect`:

```ts
import { OpenCode } from "@opencode/sdk/effect"

const opencode = yield * OpenCode.create()
const session = yield * opencode.sessions.get({ sessionID })
```

Effect configuration uses the same keys and lifetime rules, with canonical `Session.Info` values and an Effect-returning factory. `configure` may require services; `OpenCode.create` and `OpenCode.layer` carry those requirements, so the application satisfies them where it builds the SDK, as with any other Effect callback:

```ts
import { OpenCode } from "@opencode/sdk/effect"
import { Effect, Layer, Schema } from "effect"
import { Threads } from "./threads-effect"
import { slackPlugin } from "./slack-plugin-effect"

const threadMetadata = Schema.decodeUnknownSync(Schema.Struct({ threadID: Schema.String }))
const opencode = OpenCode.layer({
  database: { path: "./sessions.db" },
  instances: {
    key: (session) => threadMetadata(session.metadata).threadID,
    configure: (threadID) =>
      Effect.gen(function* () {
        const threads = yield* Threads
        return { plugins: [slackPlugin(yield* threads.get(threadID))] }
      }),
  },
}).pipe(Layer.provide(Threads.layer))
```

Resources acquired in `configure` still belong to the instance, not to the Scope the SDK was built in. The public `OpenCode.InstanceOptions` and `OpenCode.InstanceConfiguration` types describe the corresponding Promise or Effect callbacks.
