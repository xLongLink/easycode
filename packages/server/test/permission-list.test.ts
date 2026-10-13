import { expect } from "bun:test"
import { Session } from "@opencode/schema/session"
import { Global } from "@opencode/util/global"
import { Effect, Schema } from "effect"
import path from "node:path"
import { tempGlobalLayer } from "../../core/test/fixture/global"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { ServerFetch } from "../src/fetch"

it.live("permission listing preserves missing Session and Location errors", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const handler = yield* ServerFetch.make(
      {
        app: { version: "test" },
        database: { path: ":memory:" },
        fs: { filewatcher: false },
        models: { fetch: false },
      },
      { overrides: [Global.node.replace(tempGlobalLayer)] },
    )
    const sessionID = Session.ID.create()
    const missingSession = yield* Effect.promise(() =>
      handler(new Request(`http://opencode.local/api/session/${sessionID}/permission`)),
    )
    expect(missingSession.status).toBe(404)
    expect(yield* Effect.promise(() => missingSession.json())).toMatchObject({
      _tag: "SessionNotFoundError",
      sessionID,
    })

    const missingDirectory = path.join(directory.path, "missing")
    const created = yield* Effect.promise(() =>
      handler(
        new Request("http://opencode.local/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ location: { directory: missingDirectory } }),
        }),
      ),
    )
    expect(created.status).toBe(200)
    const session = Schema.decodeUnknownSync(Schema.Struct({ data: Schema.toEncoded(Session.Info) }))(
      yield* Effect.promise(() => created.json()),
    )
    const missingLocation = yield* Effect.promise(() =>
      handler(new Request(`http://opencode.local/api/session/${session.data.id}/permission`)),
    )
    expect(missingLocation.status).toBe(404)
    expect(yield* Effect.promise(() => missingLocation.json())).toMatchObject({
      _tag: "LocationNotFoundError",
      location: { directory: missingDirectory },
    })
  }).pipe(Effect.scoped),
)
