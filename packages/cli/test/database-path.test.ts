import { expect, test } from "bun:test"
import path from "node:path"

test.each([
  [undefined, "/data/opencode.db"],
  ["custom.db", "/data/custom.db"],
  ["/custom/database.db", "/custom/database.db"],
  [":memory:", ":memory:"],
])("database path ignores channel overrides and respects OPENCODE_DB=%s", async (database, expected) => {
  const env = { ...process.env }
  delete env.OPENCODE_DB
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      'import { databasePath } from "./src/database-path.ts"; console.log(databasePath("/data"))',
    ],
    {
      cwd: path.join(import.meta.dir, ".."),
      env: {
        ...env,
        OPENCODE_CHANNEL: "preview",
        OPENCODE_DISABLE_CHANNEL_DB: "false",
        ...(database === undefined ? {} : { OPENCODE_DB: database }),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect(code, stderr).toBe(0)
  expect(stdout.trim()).toBe(expected)
})
