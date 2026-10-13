import { Deferred, Effect } from "effect"
import type { ServerResponse } from "node:http"
import { OauthCallbackPage } from "./page.js"

// The Integration attempt owns the scope; each invocation owns its listener and admission.
export const oauthLoopback = Effect.fn(function* (input: {
  provider: string
  validate: (params: URLSearchParams) => string | undefined
}) {
  const callback = yield* Deferred.make<{ code: string; response: ServerResponse }, Error>()
  const { createServer } = yield* Effect.promise(() => import("node:http"))
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (request.method !== "GET" || url.pathname !== "/callback") {
      response.writeHead(404).end()
      return
    }
    const error = input.validate(url.searchParams)
    if (error) {
      response
        .writeHead(400, { "Content-Type": "text/html" })
        .end(OauthCallbackPage.error(error, { provider: input.provider }))
      Effect.runSync(Deferred.fail(callback, new Error(error)))
      return
    }
    if (!Effect.runSync(Deferred.succeed(callback, { code: url.searchParams.get("code") ?? "", response })))
      response.writeHead(409).end("OAuth callback already received")
  })
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      server.close()
      server.closeAllConnections()
    }),
  )
  return {
    server,
    complete: <A, R>(exchange: (code: string) => Effect.Effect<A, Error, R>) =>
      Effect.gen(function* () {
        const request = yield* Deferred.await(callback)
        const respond = (error?: string) =>
          Effect.sync(() =>
            request.response
              .writeHead(error ? 400 : 200, { "Content-Type": "text/html" })
              .end(
                error
                  ? OauthCallbackPage.error(error, { provider: input.provider })
                  : OauthCallbackPage.success({ provider: input.provider }),
              ),
          )
        return yield* exchange(request.code).pipe(
          Effect.tap(() => respond()),
          Effect.tapError((error) => respond(error.message)),
          // Bun's server.closeAllConnections() leaves an unanswered callback response pending.
          Effect.onInterrupt(() => Effect.sync(() => request.response.destroy())),
        )
      }),
  }
})
