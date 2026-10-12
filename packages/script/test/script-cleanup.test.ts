import { expect, test } from "bun:test"
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises"
import path from "node:path"
import { editVersions } from "../../../script/opentui"

const root = path.resolve(import.meta.dir, "../../..")

test.each([
  { bundle: false, cwd: "root", fail: false },
  { bundle: false, cwd: "package", fail: false },
  { bundle: false, cwd: "root", fail: true },
  { bundle: true, cwd: "root", fail: false },
  { bundle: true, cwd: "package", fail: false },
  { bundle: true, cwd: "root", fail: true },
])(
  "shared build preserves output, cleanup, and failures: %j",
  async (input) => {
    const fixture = await mkdtemp("/tmp/opencode/build-cleanup-")
    await using cleanup = { [Symbol.asyncDispose]: () => rm(fixture, { recursive: true, force: true }) }
    const pkg = path.join(fixture, "packages/fixture")
    await Promise.all([
      symlink(path.join(root, "node_modules"), path.join(fixture, "node_modules")),
      Bun.write(path.join(fixture, "script/build.ts"), Bun.file(path.join(root, "script/build.ts"))),
      Bun.write(
        path.join(pkg, "script/build.ts"),
        Bun.file(path.join(root, input.bundle ? "packages/server/script/build.ts" : "packages/util/script/build.ts")),
      ),
      Bun.write(path.join(pkg, "package.json"), JSON.stringify({ type: "module" })),
      Bun.write(
        path.join(pkg, "tsconfig.build.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ESNext",
            module: "NodeNext",
            declaration: true,
            outDir: "dist",
            types: [],
            strict: true,
          },
          include: ["src"],
        }),
      ),
      Bun.write(path.join(pkg, "src/index.ts"), `export const value: number = ${input.fail ? '"invalid"' : "42"}\n`),
      Bun.write(path.join(pkg, "src/types.d.ts"), "export declare const declarationOnly: string\n"),
      Bun.write(path.join(pkg, "dist/stale.txt"), "stale output"),
    ])
    const proc = Bun.spawn([process.execPath, path.join(pkg, "script/build.ts")], {
      cwd: input.cwd === "root" ? fixture : pkg,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited])
    expect(code, stdout + stderr).toBe(input.fail ? 1 : 0)
    expect(await Bun.file(path.join(pkg, "dist/stale.txt")).exists()).toBe(false)
    if (input.fail) {
      expect(stdout + stderr).toContain("not assignable to type 'number'")
      return
    }
    expect(await Bun.file(path.join(pkg, "dist/index.d.ts")).text()).toContain("value: number")
    expect(await Bun.file(path.join(pkg, "dist/types.js")).exists()).toBe(false)
    const built = await import(path.join(pkg, "dist/index.js"))
    expect(built.value).toBe(42)
  },
  30000,
)

test("release metadata exposes only the channel and version", async () => {
  const proc = Bun.spawn(
    [process.execPath, "-e", 'import { Script } from "./src/index.ts"; console.log(JSON.stringify(Script))'],
    {
      cwd: path.join(root, "packages/script"),
      env: { ...process.env, OPENCODE_CHANNEL: "latest", OPENCODE_VERSION: "1.2.3" },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited])
  expect(code, stdout + stderr).toBe(0)
  expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toEqual({ channel: "latest", version: "1.2.3" })
})

test.each([false, true])("upgrade preserves all manifest version policies (snapshot=%s)", (snapshot) => {
  const keys = ["@opentui/core", "@opentui/keymap", "@opentui/solid"]
  const catalog = Object.fromEntries(keys.map((key) => [key, "0.9.0"]))
  const overrides = Object.fromEntries(keys.map((key) => [key, "0.9.0"]))
  expect(editVersions(catalog, "catalog", "1.2.3", snapshot)).toBe(true)
  expect(editVersions(overrides, "override", "1.2.3", snapshot)).toBe(true)
  expect(catalog).toEqual(Object.fromEntries(keys.map((key) => [key, "1.2.3"])))
  expect(overrides).toEqual(Object.fromEntries(keys.map((key) => [key, snapshot ? "1.2.3" : "catalog:"])))
  const pkg = {
    dependencies: { "@opentui/core": "^0.9.0", "@opentui/keymap": "~0.9.0", "@opentui/solid": ">=0.9.0" },
    devDependencies: { "@opentui/core": "catalog:", "@opentui/keymap": "workspace:*", "@opentui/solid": "0.9.0" },
    peerDependencies: { "@opentui/core": "^0.9.0", "@opentui/keymap": "catalog:", "@opentui/solid": "workspace:*" },
  }
  expect(editVersions(pkg.dependencies, "dep", "1.2.3", snapshot)).toBe(true)
  expect(editVersions(pkg.devDependencies, "dep", "1.2.3", snapshot)).toBe(true)
  expect(editVersions(pkg.peerDependencies, "peer", "1.2.3", snapshot)).toBe(true)
  expect(pkg.dependencies).toEqual({
    "@opentui/core": snapshot ? "1.2.3" : "^1.2.3",
    "@opentui/keymap": snapshot ? "1.2.3" : "~1.2.3",
    "@opentui/solid": snapshot ? "1.2.3" : ">=1.2.3",
  })
  expect(pkg.devDependencies).toEqual({
    "@opentui/core": "catalog:",
    "@opentui/keymap": "workspace:*",
    "@opentui/solid": "1.2.3",
  })
  expect(pkg.peerDependencies).toEqual({
    "@opentui/core": snapshot ? "1.2.3" : ">=1.2.3",
    "@opentui/keymap": "catalog:",
    "@opentui/solid": "workspace:*",
  })
  expect(editVersions(pkg.dependencies, "dep", "1.2.3", snapshot)).toBe(false)
  expect(editVersions(undefined, "dep", "1.2.3", snapshot)).toBe(false)
  const unrelated = { other: "0.9.0", "@opentui/core": null }
  expect(editVersions(unrelated, "dep", "1.2.3", snapshot)).toBe(false)
  expect(unrelated).toEqual({ other: "0.9.0", "@opentui/core": null })
})

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
])(
  "upgrade validates the resulting lockfile: $name",
  async (input) => {
    const fixture = await mkdtemp("/tmp/opencode/upgrade-cleanup-")
    await using cleanup = { [Symbol.asyncDispose]: () => rm(fixture, { recursive: true, force: true }) }
    const lock = input.entries.join("\n") + "\n"
    await Promise.all([
      Bun.write(
        path.join(fixture, "script/upgrade-opentui.ts"),
        Bun.file(path.join(root, "script/upgrade-opentui.ts")),
      ),
      Bun.write(path.join(fixture, "script/opentui.ts"), Bun.file(path.join(root, "script/opentui.ts"))),
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
      input.repairs
        ? lock
            .split("\n")
            .filter((line) => !line.includes("opentui-spinner/@opentui/"))
            .join("\n")
        : lock,
    )
  },
  30000,
)

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
