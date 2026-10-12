import { beforeAll, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../../..")
const version = (await Bun.file(path.join(root, "package.json")).json()).version

beforeAll(() => mkdir("/tmp/opencode", { recursive: true }))

test.each([
  { args: ["--help"], answer: "", exitCode: 0, output: "Usage:", dispatch: false },
  { args: ["patch"], answer: "yes\n", exitCode: 1, output: "matching package.json", dispatch: false },
  { args: ["999999.0.0"], answer: "yes\n", exitCode: 1, output: "matching package.json", dispatch: false },
  { args: [version, "extra"], answer: "yes\n", exitCode: 1, output: "matching package.json", dispatch: false },
  { args: [], answer: "no\n", exitCode: 0, output: "Release cancelled", dispatch: false },
  { args: [], answer: "yes\n", exitCode: 0, output: `Triggered the ${version} release`, dispatch: true },
  { args: [version], answer: "y\n", exitCode: 0, output: `Triggered the ${version} release`, dispatch: true },
  { args: [version], answer: "yes\n", exitCode: 1, output: "exit code 1", dispatch: true },
])("release dispatch: $args / $answer", async (input) => {
  const temporary = await mkdtemp("/tmp/opencode/release-dispatch-")
  try {
    const recorded = path.join(temporary, "args")
    await Bun.write(
      path.join(temporary, "gh"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$RELEASE_TEST_ARGS"\nexit "$RELEASE_TEST_EXIT"\n',
    )
    await chmod(path.join(temporary, "gh"), 0o755)
    const child = Bun.spawn([process.execPath, path.join(root, "script/release.ts"), ...input.args], {
      cwd: temporary,
      env: {
        ...process.env,
        PATH: `${temporary}:${process.env.PATH}`,
        RELEASE_TEST_ARGS: recorded,
        RELEASE_TEST_EXIT: String(input.dispatch ? input.exitCode : 0),
      },
      stdin: new Blob([input.answer]),
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect(exitCode).toBe(input.exitCode)
    expect(stdout + stderr).toContain(input.output)
    expect(await Bun.file(recorded).exists()).toBe(input.dispatch)
    if (input.exitCode !== 0) expect(stdout).not.toContain("Triggered")
    if (input.dispatch)
      expect((await Bun.file(recorded).text()).trim().split("\n")).toEqual([
        "workflow",
        "run",
        "publish.yml",
        "--ref",
        "dev",
        "-f",
        `version=${version}`,
      ])
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
