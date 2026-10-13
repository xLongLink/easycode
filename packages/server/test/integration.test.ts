import { expect } from "bun:test"
import { Integration } from "@opencode/schema/integration"
import { Effect } from "effect"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { startServer } from "./fixture/server"

it.live("integration routes preserve lookup errors and command method validation", () =>
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped("opencode-integration-endpoints-")
    const server = yield* startServer(tmp.path)
    const request = (method: "GET" | "POST" | "DELETE", route: string, payload?: object) =>
      Effect.promise((signal) => {
        const url = new URL(route, server.base)
        url.searchParams.set("location[directory]", tmp.path)
        return fetch(url, {
          method,
          headers: { ...server.headers, "content-type": "application/json" },
          body: payload === undefined ? undefined : JSON.stringify(payload),
          signal,
        })
      })
    // Listing waits for plugin activation; individual lookups read the current snapshot.
    expect((yield* request("GET", "/api/integration")).status).toBe(200)
    const attemptID = Integration.AttemptID.create()
    const base = "/api/integration/missing-integration"
    yield* Effect.forEach(
      [
        { method: "GET", route: base },
        { method: "POST", route: `${base}/connect/key`, payload: { key: "secret" } },
        { method: "POST", route: `${base}/connect/external`, payload: { methodID: "missing-method" } },
        { method: "GET", route: `${base}/connect/oauth/${attemptID}` },
        { method: "POST", route: `${base}/connect/oauth/${attemptID}/complete`, payload: {} },
        { method: "POST", route: `${base}/connect/command`, payload: { methodID: "missing-method" } },
        { method: "GET", route: `${base}/connect/command/${attemptID}` },
      ] as const,
      Effect.fn(function* (endpoint) {
        const response = yield* request(
          endpoint.method,
          endpoint.route,
          "payload" in endpoint ? endpoint.payload : undefined,
        )
        expect(response.status).toBe(404)
        expect(yield* Effect.promise(() => response.json())).toEqual({
          _tag: "IntegrationNotFoundError",
          integrationID: "missing-integration",
          message: "Integration not found: missing-integration",
        })
      }),
    )

    const get = yield* request("GET", "/api/integration/opencode")
    expect(get.status).toBe(200)
    expect(yield* Effect.promise(() => get.json())).toMatchObject({
      location: { directory: tmp.path },
      data: { id: "opencode", methods: expect.any(Array) },
    })
    const command = yield* request("POST", "/api/integration/opencode/connect/command", { methodID: "missing-method" })
    expect(command.status).toBe(404)
    expect(yield* Effect.promise(() => command.json())).toEqual({
      _tag: "IntegrationMethodNotFoundError",
      integrationID: "opencode",
      methodID: "missing-method",
      message: "Integration method not found: missing-method",
    })

    // Cancellation remains a no-op for unknown integrations and attempts.
    expect((yield* request("DELETE", `${base}/connect/oauth/${attemptID}`)).status).toBe(204)
    expect((yield* request("DELETE", `${base}/connect/command/${attemptID}`)).status).toBe(204)
  }),
)
