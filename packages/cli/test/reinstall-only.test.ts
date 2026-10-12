import { expect, test } from "bun:test"
import path from "node:path"
import { Commands } from "../src/commands/commands"

test("does not expose application update or upgrade commands", async () => {
  expect(Commands.commands).not.toHaveProperty("upgrade")
  expect(Commands.commands).not.toHaveProperty("update")
  expect(
    Object.values(Commands.commands).flatMap((command) => command.aliases.map((alias) => alias.name)),
  ).not.toContain("update")
  const proc = Bun.spawn([process.execPath, "src/index.ts", "--help"], {
    cwd: path.resolve(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  expect(code, stdout + stderr).toBe(0)
  expect(stdout).not.toMatch(/\b(?:upgrade|update)\b/)
  expect(stdout).toContain("uninstall")
})
