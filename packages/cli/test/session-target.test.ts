import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { OpenCode, type LocationGetOutput, type ModelRef, type SessionInfo } from "@opencode/client/promise"
import { resolveSessionTarget, SessionTargetMutationError } from "../src/session-target"

function location(directory: string): LocationGetOutput {
  return { directory, project: { id: "project", directory, canonical: directory } }
}

function session(id: string, directory: string, model?: ModelRef): SessionInfo {
  return {
    id,
    projectID: "project",
    title: id,
    location: { directory },
    model,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
}

const prepare = async (input: { model: ModelRef | undefined; agent: string | undefined }) => ({
  model: input.model,
  agent: input.agent,
})

afterEach(() => mock.restore())

describe("session target resolver", () => {
  test("adopts an explicit Session location and model", async () => {
    const client = OpenCode.make({ baseUrl: "https://opencode.test" })
    const selected = session("ses_resume", "/session", { providerID: "openai", id: "gpt-5" })
    spyOn(client.session, "get").mockResolvedValue(selected)
    spyOn(client.location, "get").mockResolvedValue(location("/session"))

    const target = await resolveSessionTarget({ client, session: selected.id, prepare })
    expect(target).toMatchObject({
      session: { id: "ses_resume" },
      location: { directory: "/session" },
      model: { providerID: "openai", id: "gpt-5" },
      resume: true,
    })
  })

  test("creates a missing explicit Session with its ID", async () => {
    const client = OpenCode.make({ baseUrl: "https://opencode.test" })
    spyOn(client.session, "get").mockRejectedValue({ _tag: "SessionNotFoundError" })
    spyOn(client.location, "get").mockResolvedValue(location("/project"))
    const create = spyOn(client.session, "create").mockResolvedValue(session("ses_chosen", "/project"))
    const list = spyOn(client.session, "list")

    const target = await resolveSessionTarget({ client, session: "ses_chosen", continue: true, prepare })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: "ses_chosen" }))
    expect(target).toMatchObject({ session: { id: "ses_chosen" }, resume: false })
    expect(list).not.toHaveBeenCalled()
  })

  test("does not create a missing explicit Session to fork", async () => {
    const client = OpenCode.make({ baseUrl: "https://opencode.test" })
    spyOn(client.session, "get").mockRejectedValue({ _tag: "SessionNotFoundError" })
    const create = spyOn(client.session, "create")
    const list = spyOn(client.session, "list")

    await expect(
      resolveSessionTarget({ client, session: "ses_chosen", continue: true, fork: true, prepare }),
    ).rejects.toThrow("Session not found")
    expect(create).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })

  test.each(
    ["explicit", "continue"].flatMap((selection) =>
      ["success", "failure", "cancelled"].map((outcome) => ({ selection, outcome })),
    ),
  )("forks a $selection Session ($outcome)", async ({ selection, outcome }) => {
    const selected = session("ses_source", "/project", { providerID: "openai", id: "gpt-5" })
    const forked = { ...selected, id: "ses_forked", agent: "review" }
    const requests: string[] = []
    const started = Promise.withResolvers<void>()
    const response = Promise.withResolvers<Response>()
    using server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname
        requests.push(`${request.method} ${path}`)
        if (path === "/api/location") return Response.json(location("/project"))
        if (path === `/api/session/${selected.id}`) return Response.json({ data: selected })
        if (path === "/api/session") return Response.json({ data: [selected], cursor: {} })
        if (path === `/api/session/${selected.id}/fork`) {
          started.resolve()
          return response.promise
        }
        return new Response("Not found", { status: 404 })
      },
    })
    const controller = new AbortController()
    const task = resolveSessionTarget({
      client: OpenCode.make({ baseUrl: server.url.toString() }),
      session: selection === "explicit" ? selected.id : undefined,
      continue: selection === "continue",
      location: { directory: "/project" },
      fork: true,
      signal: controller.signal,
      prepare,
    })
    try {
      await started.promise
      if (outcome === "cancelled") controller.abort()
      if (outcome !== "cancelled")
        response.resolve(
          outcome === "failure"
            ? Response.json(
                { _tag: "SessionNotFoundError", sessionID: selected.id, message: "Session not found" },
                { status: 404 },
              )
            : Response.json({ data: forked }),
        )

      if (outcome === "success") {
        expect(await task).toMatchObject({
          session: forked,
          location: { directory: "/project" },
          model: selected.model,
          agent: "review",
          resume: true,
        })
      }
      if (outcome !== "success")
        expect(await task.catch((error: unknown) => error)).toMatchObject({
          name: "SessionTargetMutationError",
          cause: outcome === "failure" ? { name: "SessionNotFoundError" } : { reason: "Transport" },
        })

      expect(requests).toEqual([
        ...(selection === "explicit" ? [`GET /api/session/${selected.id}`] : ["GET /api/location", "GET /api/session"]),
        `POST /api/session/${selected.id}/fork`,
        ...(outcome === "success" ? ["GET /api/location"] : []),
      ])
    } finally {
      controller.abort()
      response.resolve(Response.json({ data: forked }))
    }
  })

  test("paginates to continue the exact directory", async () => {
    const client = OpenCode.make({ baseUrl: "https://opencode.test" })
    spyOn(client.location, "get").mockResolvedValue(location("/project"))
    const explicit = Array.from({ length: 50 }, (_, index) => session(`ses_${index}`, `/other/${index}`))
    const list = spyOn(client.session, "list")
      .mockResolvedValueOnce({ data: explicit, cursor: { next: "page_2" } })
      .mockResolvedValueOnce({ data: [session("ses_implicit", "/project")], cursor: {} })

    const target = await resolveSessionTarget({ client, location: { directory: "/project" }, continue: true, prepare })
    expect(list).toHaveBeenCalledTimes(2)
    expect(target.session.id).toBe("ses_implicit")
  })

  test("attaches the terminal environment to the resolved local Session", async () => {
    const client = OpenCode.make({ baseUrl: "https://opencode.test" })
    const selected = session("ses_resume", "/session")
    spyOn(client.session, "get").mockResolvedValue(selected)
    spyOn(client.location, "get").mockResolvedValue(location("/session"))
    const environment = spyOn(client.session, "environment").mockResolvedValue()

    await resolveSessionTarget({
      client,
      session: selected.id,
      environment: { PATH: "/terminal/bin" },
      prepare,
    })

    expect(environment).toHaveBeenCalledWith({
      sessionID: selected.id,
      variables: { PATH: "/terminal/bin" },
    })
  })

  test("prepares a fresh Session at the server Location before creation", async () => {
    const client = OpenCode.make({ baseUrl: "https://opencode.test" })
    const order: string[] = []
    spyOn(client.location, "get").mockResolvedValue(location("/server"))
    const create = spyOn(client.session, "create").mockImplementation(async (input) => {
      order.push("create")
      expect(input).toMatchObject({ agent: "prepared", location: { directory: "/server" } })
      return session("ses_fresh", "/server")
    })

    await resolveSessionTarget({
      client,
      agent: "requested",
      prepare: async (input) => {
        order.push("prepare")
        expect(input.location.directory).toBe("/server")
        return { model: input.model, agent: "prepared" }
      },
    })
    expect(create).toHaveBeenCalledTimes(1)
    expect(order).toEqual(["prepare", "create"])
  })

  test("uses the agent resolved by the server for a fresh Session", async () => {
    const client = OpenCode.make({ baseUrl: "https://opencode.test" })
    spyOn(client.location, "get").mockResolvedValue(location("/project"))
    spyOn(client.session, "create").mockResolvedValue({ ...session("ses_fresh", "/project"), agent: "review" })

    const target = await resolveSessionTarget({ client, prepare })
    expect(target.agent).toBe("review")
  })

  test("does not retry an ambiguous Session creation", async () => {
    const client = OpenCode.make({ baseUrl: "https://opencode.test" })
    spyOn(client.location, "get").mockResolvedValue(location("/project"))
    spyOn(client.session, "create").mockRejectedValue(new Error("connection closed after create"))
    await expect(resolveSessionTarget({ client, prepare })).rejects.toBeInstanceOf(SessionTargetMutationError)
  })
})
