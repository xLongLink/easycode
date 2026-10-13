import { expect } from "bun:test"
import { Global } from "@opencode/util/global"
import { Effect } from "effect"
import { tempGlobalLayer } from "../../core/test/fixture/global"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { ServerFetch } from "../src/fetch"

it.live("PTY REST endpoints preserve missing-terminal errors and ticket guard precedence", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const handler = yield* ServerFetch.make(
      {
        app: { version: "test" },
        database: { path: ":memory:" },
        config: { project: false },
        fs: { filewatcher: false },
        models: { fetch: false },
      },
      { overrides: [Global.node.replace(tempGlobalLayer)] },
    )
    const ptyID = "pty_missing"
    for (const method of ["GET", "PUT", "DELETE", "POST"]) {
      const response = yield* Effect.promise(() =>
        handler(
          new Request(`http://opencode.local/api/pty/${ptyID}${method === "POST" ? "/connect-token" : ""}`, {
            method,
            headers: {
              "content-type": "application/json",
              "x-opencode-directory": encodeURIComponent(directory.path),
              "x-opencode-ticket": "1",
            },
            body: method === "PUT" ? JSON.stringify({ title: "Changed" }) : undefined,
          }),
        ),
      )
      expect({ method, status: response.status }).toEqual({ method, status: 404 })
      expect(yield* Effect.promise(() => response.json())).toEqual({
        _tag: "PtyNotFoundError",
        ptyID,
        message: `PTY session not found: ${ptyID}`,
      })
    }
    const forbidden = yield* Effect.promise(() =>
      handler(
        new Request(`http://opencode.local/api/pty/${ptyID}/connect-token`, {
          method: "POST",
          headers: { "x-opencode-directory": encodeURIComponent(directory.path) },
        }),
      ),
    )
    expect(forbidden.status).toBe(403)
    expect(yield* Effect.promise(() => forbidden.json())).toEqual({
      _tag: "ForbiddenError",
      message: "Invalid PTY connect token request",
    })
  }).pipe(Effect.scoped),
)
