import { expect, test } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { EOL } from "node:os"
import path from "node:path"
import { reportPlainError } from "../src/util/error"
import { OPENCODE_VERSION } from "../src/version"

test.each(
  [
    ["auth", "list"],
    ["auth", "export"],
    ["auth", "import"],
    ["session", "list"],
    ["session", "delete", "ses_missing"],
    ["session", "export", "ses_missing"],
    ["stats"],
  ].map((args) => [args.join(" "), args] as const),
)("%s reports command failures as one plain stderr line", async (_command, args) => {
  using server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/api/info")
        return Response.json({ version: OPENCODE_VERSION, pid: process.pid, urls: [], paths: { tmp: "/tmp/opencode" } })
      const location = {
        directory: process.cwd(),
        project: { id: "global", directory: process.cwd(), canonical: process.cwd() },
      }
      if (url.pathname === "/api/model/default") return Response.json({ location, data: null })
      if (url.pathname === "/api/location") return Response.json(location)
      return new Response("Unavailable", { status: 418 })
    },
  })
  const child = Bun.spawn([process.execPath, "run", "src/index.ts", ...args, "--server", server.url.toString()], {
    cwd: path.join(import.meta.dir, ".."),
    stdin: new Blob(["[]"]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ stdout, stderr, exitCode }).toEqual({ stdout: "", stderr: `UnexpectedStatus: 418${EOL}`, exitCode: 1 })
})

test("plain-error reporting does not consume interruption", async () => {
  const exit = await Effect.runPromiseExit(Effect.interrupt.pipe(reportPlainError))
  expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
})
