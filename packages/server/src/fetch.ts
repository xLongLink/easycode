export * as ServerFetch from "./fetch"

import { Context, Effect, Layer } from "effect"
import { HttpEffect, HttpMiddleware, HttpRouter, HttpServer } from "effect/http"
import { SessionRestart } from "@opencode/core/session/execution/restart"
import type { LayerNode } from "@opencode/util/effect/layer-node"
import { isAllowedCorsOrigin } from "./cors"
import { createRoutes } from "./routes"
import type { ServerOptions } from "./options"

export interface BootOptions {
  /**
   * Service replacements, applied after the standard set so later entries win.
   */
  readonly overrides?: LayerNode.Replacements
}

/**
 * Builds a web-standard fetch handler — `(request: Request) => Promise<Response>` — serving the
 * same HttpApi routes as the Node server process without binding a port, owning a listener, or
 * installing signal handlers. This is the entry for runtimes that hand requests to the embedder
 * instead of letting it listen, such as Bun.serve or a test harness.
 *
 * The application layer builds EAGERLY, inside the caller's `Scope`, before the handler is
 * returned. Request cancellation must not own application construction. The embedder owns
 * the lifecycle — closing the scope releases the application layer.
 *
 * Auth follows `createRoutes` semantics: `options.password` enforces Basic auth; omitting it
 * serves unauthenticated, so an embedder without a password must front the handler with its own
 * access control.
 *
 * Sessions whose execution claim was never released resume once the layer is built, exactly as
 * the Node server process does. A killed process replays orphaned executions on the next
 * boot, and the sweep is a no-op when nothing is suspended.
 */
export const make = Effect.fn("ServerFetch.make")(function* (options: ServerOptions = {}, boot: BootOptions = {}) {
  const context = yield* Layer.build(
    createRoutes(options, () => [], boot.overrides ?? []).pipe(Layer.provide(HttpServer.layerServices)),
  )
  // Forked so the returned handler is never delayed; resumed drains are already
  // logged and durably recorded by the execution layer.
  yield* Effect.forkDetach(Context.get(context, SessionRestart.Service).resumeSuspendedSessions)
  return Context.get(context, HttpRouter.HttpRouter)
    .asHttpEffect()
    .pipe(
      HttpMiddleware.cors({ allowedOrigins: (origin) => isAllowedCorsOrigin(origin, options), maxAge: 86_400 }),
      HttpEffect.toWebHandlerWith(context),
    )
})
