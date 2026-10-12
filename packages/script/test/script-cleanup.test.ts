import { expect, test } from "bun:test"
import { chmod, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../../..")

test.each([
  { name: "consistent", entries: ['    "@opentui/core": ["@opentui/core@1.2.3"],'], code: 0, repairs: false },
  {
    name: "spinner-only stale peers",
    entries: [
      '    "@opentui/core": ["@opentui/core@1.2.3"],',
      '    "opentui-spinner/@opentui/core": ["@opentui/core@0.9.0"],',
      '    "opentui-spinner/@opentui/solid": ["@opentui/solid@0.9.0"],',
    ],
    code: 0,
    repairs: true,
  },
  {
    name: "mixed stale entries",
    entries: [
      '    "@opentui/core": ["@opentui/core@0.9.0"],',
      '    "opentui-spinner/@opentui/core": ["@opentui/core@0.9.0"],',
    ],
    code: 1,
    repairs: false,
  },
])("upgrade validates the resulting lockfile: $name", async (input) => {
  const fixture = await mkdtemp("/tmp/opencode/upgrade-cleanup-")
  await using cleanup = { [Symbol.asyncDispose]: () => rm(fixture, { recursive: true, force: true }) }
  const lock = input.entries.join("\n") + "\n"
  await Promise.all([
    Bun.write(path.join(fixture, "script/upgrade-opentui.ts"), Bun.file(path.join(root, "script/upgrade-opentui.ts"))),
    Bun.write(
      path.join(fixture, "package.json"),
      JSON.stringify({ name: "upgrade-fixture", private: true, scripts: { postinstall: "bun seed.ts" } }),
    ),
    Bun.write(path.join(fixture, "seed.ts"), `await Bun.write("bun.lock", ${JSON.stringify(lock)})`),
  ])
  const proc = Bun.spawn([process.execPath, "script/upgrade-opentui.ts", "1.2.3"], {
    cwd: fixture,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited])
  expect(code, stdout + stderr).toBe(input.code)
  expect(stdout.includes("Removed stale opentui-spinner peer lockfile entries:")).toBe(input.repairs)
  expect(stdout.includes("bun.lock opentui versions are consistent")).toBe(input.code === 0)
  expect(stderr.includes("bun.lock still contains stale opentui versions")).toBe(input.code !== 0)
  expect(await Bun.file(path.join(fixture, "bun.lock")).text()).toBe(
    input.repairs ? lock.split("\n").filter((line) => !line.includes("opentui-spinner/@opentui/")).join("\n") : lock,
  )
}, 30000)

test.each([false, true])("generation dispatch preserves ordering and failures (fail=%s)", async (fail) => {
  const fixture = await mkdtemp("/tmp/opencode/generate-cleanup-")
  await using cleanup = { [Symbol.asyncDispose]: () => rm(fixture, { recursive: true, force: true }) }
  await Promise.all([
    Bun.write(path.join(fixture, "generate.ts"), Bun.file(path.join(root, "script/generate.ts"))),
    Bun.write(path.join(fixture, "packages/protocol/.keep"), ""),
    Bun.write(path.join(fixture, "packages/cli/.keep"), ""),
    Bun.write(
      path.join(fixture, "bin/bun"),
      '#!/bin/sh\nprintf "%s|%s\\n" "$PWD" "$*" >> "$COMMAND_LOG"\nif [ "$FAIL_SCHEMA" = 1 ] && [ "$1" = script/schema.ts ]; then exit 7; fi\n',
    ),
  ])
  await chmod(path.join(fixture, "bin/bun"), 0o755)
  const proc = Bun.spawn([process.execPath, "generate.ts"], {
    cwd: fixture,
    env: {
      ...process.env,
      PATH: `${path.join(fixture, "bin")}:${process.env.PATH}`,
      COMMAND_LOG: path.join(fixture, "commands.log"),
      FAIL_SCHEMA: fail ? "1" : "0",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited])
  expect(code, stdout + stderr).toBe(fail ? 1 : 0)
  expect((await Bun.file(path.join(fixture, "commands.log")).text()).trim().split("\n")).toEqual([
    `${fixture}/packages/protocol|run generate`,
    `${fixture}/packages/cli|script/schema.ts cli.schema.json`,
    ...(fail ? [] : [`${fixture}|run prettier --ignore-unknown --write .`]),
  ])
})
