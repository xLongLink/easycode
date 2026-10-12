import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { workspaceTasks } from "../../../script/vite-tasks"
import config from "../../../vite.config"

describe("workspace tasks", () => {
  test("keeps the exact Bun scripts and separate Vite+ task names", () => {
    const tasks = workspaceTasks({
      name: "@opencode/ai",
      scripts: {
        typecheck: "tsgo --noEmit && tsgo --noEmit -p tsconfig.types.json",
        build: "tsc -p tsconfig.build.json",
        test: "bun test --timeout 30000 --only-failures",
        dev: "bun run src/index.ts",
      },
    }).run?.tasks

    expect(Object.keys(tasks ?? {})).toEqual(["check:types", "workspace:build", "workspace:test"])
    expect(tasks?.["check:types"]).toMatchObject({ command: "bun run typecheck" })
    expect(tasks?.["workspace:build"]).toMatchObject({ command: "bun run build", cache: { output: ["dist/**"] } })
    expect(tasks?.["workspace:test"]).toMatchObject({
      command: "bun run test",
      dependsOn: [{ task: "workspace:build", from: ["dependencies", "devDependencies"] }],
      cache: { output: [] },
    })
  })

  test.each(["cli", "server", "simulation", "tui"])("%s checks wait for Core declarations", (name) => {
    expect(workspaceTasks({ name: `@opencode/${name}`, scripts: { typecheck: "tsgo -b" } }).run?.tasks).toMatchObject({
      "check:types": {
        dependsOn: ["@opencode/core#check:types"],
        cache: { output: ["node_modules/.ts-dist/**", "**/*.tsbuildinfo"] },
      },
    })
  })

  test("hashes the previous global inputs and environment without hashing generated build info", () => {
    expect(workspaceTasks({ name: "@opencode/core", scripts: { typecheck: "tsgo -b" } }).run?.tasks).toMatchObject({
      "check:types": {
        cache: {
          env: ["CI", "OPENCODE_DISABLE_SHARE"],
          input: expect.arrayContaining([
            { auto: true },
            "!**/*.tsbuildinfo",
            { pattern: "patches/**", base: "workspace" },
            { pattern: "bunfig.toml", base: "workspace" },
            { pattern: ".npmrc", base: "workspace" },
            { pattern: ".github/actions/setup-bun/**", base: "workspace" },
            { pattern: ".github/workflows/test.yml", base: "workspace" },
            { pattern: "script/build.ts", base: "workspace" },
          ]),
        },
      },
    })
  })

  test("preserves the CI test selection", () => {
    expect(workspaceTasks({ name: "@opencode/client", scripts: { test: "bun test" } }).run?.tasks).toEqual({})
    expect(
      workspaceTasks({ name: "@opencode/httpapi-codegen", scripts: { test: "bun test" } }).run?.tasks,
    ).toMatchObject({
      "workspace:test": { dependsOn: [] },
    })
  })

  test.each(["ai", "codemode", "core", "server", "cli", "tui"])("%s tests build dependencies", (name) => {
    expect(workspaceTasks({ name: `@opencode/${name}`, scripts: { test: "bun test" } }).run?.tasks).toMatchObject({
      "workspace:test": { dependsOn: [{ task: "workspace:build", from: ["dependencies", "devDependencies"] }] },
    })
  })

  test.each(["latex", "simulation", "client"])("does not select %s tests", (name) => {
    expect(workspaceTasks({ name: `@opencode/${name}`, scripts: { test: "bun test" } }).run?.tasks).toEqual({})
  })
})

test("keeps custom lint plugins and formatting outside the canonical check", () => {
  expect(config.lint?.jsPlugins).toEqual([
    { name: "anti-slop", specifier: "./script/oxlint/anti-slop/index.ts" },
    { name: "anti-slop-effect", specifier: "./script/oxlint/anti-slop/effect/index.ts" },
  ])
  expect(config.fmt).toMatchObject({ semi: false, printWidth: 120, sortPackageJson: false, sortImports: false })
  expect(config.check).toEqual({ fmt: false })
})

test("Vite+ loads and executes both custom lint plugins", async () => {
  const root = path.resolve(import.meta.dir, "../../..")
  const proc = Bun.spawn(
    [
      path.join(root, "node_modules/.bin/vp"),
      "lint",
      "--config",
      "packages/script/test/fixtures/vite-lint.config.mjs",
      "packages/script/test/fixtures/vite-lint.ts",
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited])
  expect(exitCode).toBe(1)
  expect(stdout + stderr).toContain("anti-slop(no-reflect-get)")
  expect(stdout + stderr).toContain("anti-slop-effect(no-service-constructor-imports)")
})

test("task cache restores builds and invalidates global inputs and environment", async () => {
  const root = path.resolve(import.meta.dir, "../../..")
  await mkdir(path.join(os.tmpdir(), "opencode"), { recursive: true })
  const fixture = await mkdtemp(path.join(os.tmpdir(), "opencode/vite-cache-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(fixture, { recursive: true, force: true }) }
  await Promise.all([
    Bun.write(
      path.join(fixture, "package.json"),
      JSON.stringify({
        name: "cache-test",
        private: true,
        type: "module",
        packageManager: "bun@1.4.2",
        workspaces: ["packages/*"],
      }),
    ),
    Bun.write(path.join(fixture, "vite.config.mjs"), "export default {}"),
    Bun.write(
      path.join(fixture, "packages/ai/package.json"),
      JSON.stringify({ name: "@opencode/ai", type: "module", scripts: { build: "bun build.ts" } }),
    ),
    Bun.write(
      path.join(fixture, "packages/ai/vite.config.mjs"),
      `import pkg from "./package.json" with { type: "json" }\n` +
        `import { workspaceTasks } from ${JSON.stringify(path.join(root, "script/vite-tasks.ts"))}\n` +
        `export default workspaceTasks(pkg)\n`,
    ),
    Bun.write(
      path.join(fixture, "packages/ai/build.ts"),
      `await Bun.write("dist/result.txt", process.env.OPENCODE_DISABLE_SHARE ?? "default")\n`,
    ),
  ])

  const run = async (value: string) => {
    const proc = Bun.spawn([path.join(root, "node_modules/.bin/vp"), "run", "-v", "workspace:build"], {
      cwd: path.join(fixture, "packages/ai"),
      env: { ...process.env, OPENCODE_DISABLE_SHARE: value },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited])
    expect(exitCode, stdout + stderr).toBe(0)
    return stdout + stderr
  }

  expect(await run("first")).toContain("Cache miss: no previous cache entry found")
  await rm(path.join(fixture, "packages/ai/dist/result.txt"))
  expect(await run("first")).toContain("Cache hit - output replayed")
  expect(await Bun.file(path.join(fixture, "packages/ai/dist/result.txt")).text()).toBe("first")
  expect(await run("second")).toContain("env 'OPENCODE_DISABLE_SHARE' changed")
  expect(await Bun.file(path.join(fixture, "packages/ai/dist/result.txt")).text()).toBe("second")
  await Bun.write(path.join(fixture, "patches/global.patch"), "global input changed")
  expect(await run("second")).toContain("'global.patch' added in 'patches'")
  await Bun.write(path.join(fixture, "script/build.ts"), "shared builder changed")
  expect(await run("second")).toContain("Cache miss")
  expect(await run("second")).toContain("Cache hit - output replayed")
}, 30000)

test.each([
  {
    name: "wrapped const array aliases",
    source: `const values = [1, 2]
const alias = values
{ (alias as number[]).filter(Boolean).map(String) }`,
    diagnostic: "anti-slop(no-array-filter-map)",
  },
  {
    name: "shadowed and reassigned array bindings",
    source: `const values = [1, 2]
function inspect(values: Iterable<number>) {
  values.filter(Boolean).map(String)
}
let alias = values
alias = unknownValues
alias.filter(Boolean).map(String)
makeValues().filter(Boolean).map(String)`,
    diagnostic: undefined,
  },
  {
    name: "wrapped const accumulator aliases",
    source: `[1, 2].reduce((acc, item) => {
  const alias = (acc as number[])
  { return (alias!).concat(item) }
}, [])`,
    diagnostic: "anti-slop(no-reduce-accumulator-copy)",
  },
  {
    name: "shadowed, reassigned, and non-identifier accumulators",
    source: `[1, 2].reduce((acc, item) => {
  { const acc = []; acc.concat(item) }
  let alias = acc
  alias = []
  alias.concat(item)
  return [].concat(item)
}, [])`,
    diagnostic: undefined,
  },
])("array lint preserves binding semantics: $name", async (input) => {
  const root = path.resolve(import.meta.dir, "../../..")
  const fixture = await mkdtemp(path.join(import.meta.dir, "fixtures/array-lint-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(fixture, { recursive: true, force: true }) }
  await Bun.write(path.join(fixture, "input.ts"), input.source)
  const proc = Bun.spawn(
    [
      path.join(root, "node_modules/.bin/vp"),
      "lint",
      "--config",
      path.join(root, "packages/script/test/fixtures/array-lint.config.mjs"),
      path.join(fixture, "input.ts"),
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited])
  expect(exitCode, stdout + stderr).toBe(input.diagnostic ? 1 : 0)
  if (input.diagnostic) expect(stdout + stderr).toContain(input.diagnostic)
  expect(stdout + stderr).not.toContain("No files found")
})
