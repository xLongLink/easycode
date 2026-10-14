import { afterEach, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function fixture() {
  await mkdir("/tmp/opencode", { recursive: true })
  const home = await mkdtemp("/tmp/opencode/text-tests-")
  directories.push(home)
  const executable = join(home, "installed pi")
  await Bun.write(
    executable,
    `#!${process.execPath}
const delay = Number(process.env.TEXT_TEST_SLEEP ?? 0)
if (delay > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay)
console.log(JSON.stringify({ args: process.argv.slice(2), directory: process.cwd() }))
process.exit(Number(process.env.TEXT_TEST_EXIT ?? 0))
`,
  )
  await chmod(executable, 0o755)
  const data = join(home, "data", "uncode")
  const env = {
    ...process.env,
    PATH: process.env.PATH,
    HOME: home,
    XDG_DATA_HOME: join(home, "data"),
    PI_BIN: executable,
  }
  return {
    home,
    data,
    executable,
    env,
    setup(action: string) {
      return Bun.spawnSync(["bash", join(import.meta.dir, "../setup.sh"), action], {
        env,
        stdout: "pipe",
        stderr: "pipe",
      })
    },
    shell(script: string, args: string[] = []) {
      const errorFile = join(home, "shell.stderr")
      const parameters = args.map((value) => `'${value.replaceAll("'", "'\\''")}'`).join(" ")
      // Start the Readline loop before loading bindings; Bash -ic does not initialize it.
      const result = Bun.spawnSync(
        [
          "script",
          "--quiet",
          "--return",
          "--echo",
          "never",
          "--command",
          `bash --noprofile --norc -i 2>'${errorFile}'`,
          "/dev/null",
        ],
        {
          env: { ...env, HISTFILE: "/dev/null", PS1: "", PS2: "", TERM: "dumb" },
          stdin: Buffer.from(`set -- ${parameters}\n{\n${script}\n}\nexit\n`),
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      const stderr = readFileSync(errorFile)
      if (result.exitCode !== 0)
        throw new Error(
          `Bash failed (${result.signalCode ?? result.exitCode}): ${stderr.toString()}`,
        )
      return {
        ...result,
        stderr,
        stdout: Buffer.from(result.stdout.toString().replaceAll("\r\n", "\n")),
      }
    },
  }
}

test("install migrates the old hook, preserves shell settings, and is idempotent", async () => {
  const context = await fixture()
  await mkdir(context.data, { recursive: true })
  await Bun.write(
    join(context.home, ".bashrc"),
    `export KEEP_SETTING=yes
# >>> uncode bash input hook >>>
source old-hook.sh
# <<< uncode bash input hook <<<
alias keep_alias='pwd'
`,
  )
  for (const file of ["bash-hook.sh", "bash-ai.sh", "bash-classify.js"])
    await Bun.write(join(context.data, file), "legacy")
  expect(context.setup("install").exitCode).toBe(0)
  expect(context.setup("install").exitCode).toBe(0)
  const rc = await Bun.file(join(context.home, ".bashrc")).text()
  expect(rc).toContain("export KEEP_SETTING=yes")
  expect(rc).toContain("alias keep_alias='pwd'")
  expect(rc).not.toContain("source old-hook.sh")
  expect(rc.match(/# >>> easycode text hook >>>/g)).toHaveLength(1)
  expect(await Bun.file(join(context.data, "text", "config.json")).json()).toEqual({
    pi: context.executable,
    runner: "direct",
  })
  for (const file of ["bash-hook.sh", "bash-ai.sh", "bash-classify.js"])
    expect(await Bun.file(join(context.data, file)).exists()).toBe(false)
})

test("uninstall removes only owned files and blocks, including legacy leftovers", async () => {
  const context = await fixture()
  await Bun.write(join(context.home, ".bashrc"), "export KEEP_SETTING=yes\n")
  expect(context.setup("install").exitCode).toBe(0)
  await Bun.write(join(context.data, "unrelated.json"), "keep")
  expect(context.setup("uninstall").exitCode).toBe(0)
  expect(context.setup("uninstall").exitCode).toBe(0)
  expect(await Bun.file(join(context.home, ".bashrc")).text()).toBe("export KEEP_SETTING=yes\n")
  expect(await Bun.file(join(context.data, "text", "hook.sh")).exists()).toBe(false)
  expect(await Bun.file(join(context.data, "unrelated.json")).text()).toBe("keep")
})

test("an unterminated legacy hook block leaves the original bashrc unchanged", async () => {
  const context = await fixture()
  const original = "export KEEP_SETTING=yes\n# >>> uncode bash input hook >>>\nsource old-hook.sh\n"
  await Bun.write(join(context.home, ".bashrc"), original)
  const result = context.setup("install")
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).toContain("Unterminated")
  expect(await Bun.file(join(context.home, ".bashrc")).text()).toBe(original)
})

test("uninstall without an installation does not create a bashrc", async () => {
  const context = await fixture()
  expect(context.setup("uninstall").exitCode).toBe(0)
  expect(await Bun.file(join(context.home, ".bashrc")).exists()).toBe(false)
})

async function installerFixture() {
  const context = await fixture()
  const bin = join(context.home, "bin")
  await mkdir(bin)
  await Bun.write(
    join(bin, "bun"),
    `#!/bin/bash
if [[ "$1" != install ]]; then exec '${process.execPath}' "$@"; fi
printf '%s\\n' "$@" > "$HOME/bun-args"
printf '%s\\n' "$BUN_INSTALL" > "$HOME/bun-prefix"
[[ ! -e "$HOME/fail-install" ]] || exit 9
mkdir -p "$HOME/.local/bin"
cp "$HOME/installed pi" "$HOME/.local/bin/pi"
`,
  )
  for (const command of ["node", "npm"]) await Bun.write(join(bin, command), "#!/bin/sh\nexit 99\n")
  for (const command of ["bun", "node", "npm"]) await chmod(join(bin, command), 0o755)
  context.env.PI_BIN = ""
  context.env.PATH = `${bin}:/usr/bin:/bin`
  return context
}

test("installs missing Pi into a user prefix without lifecycle scripts and reuses it", async () => {
  const context = await installerFixture()
  expect(context.setup("install").exitCode).toBe(0)
  expect(await Bun.file(join(context.home, "bun-args")).text()).toBe(
    "install\n-g\n--ignore-scripts\n@earendil-works/pi-coding-agent@1.2.0\n",
  )
  expect(await Bun.file(join(context.home, "bun-prefix")).text()).toBe(`${context.home}/.local\n`)
  expect(await Bun.file(join(context.data, "text", "config.json")).json()).toEqual({
    pi: join(context.home, ".local/bin/pi"),
    runner: "direct",
  })
  await Bun.write(join(context.home, "fail-install"), "fail")
  expect(context.setup("install").exitCode).toBe(0)
  await Bun.write(join(context.home, ".pi/agent/settings.json"), "keep")
  expect(context.setup("uninstall").exitCode).toBe(0)
  expect(await Bun.file(join(context.home, ".local/bin/pi")).exists()).toBe(true)
  expect(await Bun.file(join(context.home, ".pi/agent/settings.json")).text()).toBe("keep")
})

test("failed Pi installation leaves shell settings unchanged", async () => {
  const context = await installerFixture()
  await Bun.write(join(context.home, "fail-install"), "fail")
  await Bun.write(join(context.home, ".bashrc"), "export KEEP_SETTING=yes\n")
  expect(context.setup("install").exitCode).toBe(9)
  expect(await Bun.file(join(context.home, ".bashrc")).text()).toBe("export KEEP_SETTING=yes\n")
})

test("an invalid explicit PI_BIN fails rather than installing another executable", async () => {
  const context = await installerFixture()
  context.env.PI_BIN = join(context.home, "missing pi")
  expect(context.setup("install").exitCode).not.toBe(0)
  expect(await Bun.file(join(context.home, "bun-args")).exists()).toBe(false)
  expect(await Bun.file(join(context.home, ".bashrc")).exists()).toBe(false)
})

test("launcher uses Pi print mode and thinking without changing the prompt or directory", async () => {
  const context = await fixture()
  expect(context.setup("install").exitCode).toBe(0)
  const directory = join(context.home, "project with spaces")
  await mkdir(directory)
  const message = "--help; $(echo should-not-execute)\nsecond line"
  const result = Bun.spawnSync(
    [process.execPath, join(context.data, "text", "launch.ts"), "test-session", directory, message],
    { stdout: "pipe", stderr: "pipe" },
  )
  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout.toString())).toEqual({
    args: ["--print", "--session-id", "test-session", "--thinking", "high", "--", message],
    directory,
  })
})

test("Node-shebang Pi runs with Bun without invoking Node", async () => {
  const context = await installerFixture()
  context.env.PI_BIN = context.executable
  const source = await Bun.file(context.executable).text()
  await Bun.write(context.executable, source.replace(/^#![^\n]+/, "#!/usr/bin/env node"))
  expect(context.setup("install").exitCode).toBe(0)
  expect(await Bun.file(join(context.data, "text", "config.json")).json()).toEqual({
    pi: context.executable,
    runner: "bun",
  })
  const result = Bun.spawnSync(
    [
      process.execPath,
      join(context.data, "text", "launch.ts"),
      "test-session",
      context.home,
      "hello",
    ],
    { env: context.env, stdout: "pipe", stderr: "pipe" },
  )
  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout.toString()).args.at(-1)).toBe("hello")
})

test("launcher forwards Pi's failure status", async () => {
  const context = await fixture()
  expect(context.setup("install").exitCode).toBe(0)
  const result = Bun.spawnSync(
    [
      process.execPath,
      join(context.data, "text", "launch.ts"),
      "test-session",
      context.home,
      "hello",
    ],
    {
      env: { ...context.env, TEXT_TEST_EXIT: "7" },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  expect(result.exitCode).toBe(7)
})

test("session IDs are unique UUIDs", () => {
  const values = Array.from({ length: 2 }, () =>
    Bun.spawnSync([process.execPath, join(import.meta.dir, "../src/launch.ts"), "--new-session-id"])
      .stdout.toString()
      .trim(),
  )
  values.forEach((value) => expect(value).toMatch(/^[0-9a-f-]{36}$/))
  expect(values[0]).not.toBe(values[1])
})

test("Bash routes executables, aliases, functions and shell syntax without sending them to AI", async () => {
  const context = await fixture()
  const result = context.shell(
    `set -o emacs
source "$1"
shift
alias myalias='pwd'
myfunction() { :; }
for line in "$@"; do
  if text_before_submit "$line"; then printf 'command\n'; else printf 'message\n'; fi
done`,
    [
      join(import.meta.dir, "../src/hook.sh"),
      "",
      "   ",
      "git status",
      "pwd",
      "myalias",
      "myfunction",
      "VALUE=x",
      "./script",
      "/bin/echo hello",
      "# comment",
      "$(pwd)",
      "(pwd)",
      "> output",
      "cmd gti status",
      "explain this directory",
      "gti status",
    ],
  )
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString().trim().split("\n")).toEqual([
    ...Array(14).fill("command"),
    "message",
    "message",
  ])
})

test("the hook shows thinking feedback before printing the answer", async () => {
  const context = await fixture()
  expect(context.setup("install").exitCode).toBe(0)
  const result = context.shell(
    `set -o emacs
source "$1"
PS1=''
export TEXT_TEST_SLEEP=250
READLINE_LINE='explain this project'
text_handle_enter`,
    [join(context.data, "text", "hook.sh")],
  )
  expect(result.exitCode).toBe(0)
  expect(result.stderr.toString()).toMatch(/thinking\.{1,3}/)
  expect(result.stderr.toString()).not.toMatch(/[|/\\-] thinking/)
  expect(
    result.stdout
      .toString()
      .split("\n")
      .filter((line) => line.startsWith("{")),
  ).toHaveLength(1)
})

test("the hook reuses one session and its first directory across later cd commands", async () => {
  const context = await fixture()
  expect(context.setup("install").exitCode).toBe(0)
  const first = join(context.home, "first project")
  const second = join(context.home, "second project")
  await mkdir(first)
  await mkdir(second)
  const result = context.shell(
    `set -o emacs
source "$1"
PS1=''
cd "$2"
READLINE_LINE='explain this project'
text_handle_enter
cd "$3"
READLINE_LINE='what next?'
text_handle_enter`,
    [join(context.data, "text", "hook.sh"), first, second],
  )
  expect(result.exitCode).toBe(0)
  const calls = result.stdout
    .toString()
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line))
  expect(calls).toHaveLength(2)
  expect(calls[0].args[2]).toMatch(/^[0-9a-f-]{36}$/)
  expect(calls[1].args[2]).toBe(calls[0].args[2])
  expect(calls.map((call) => call.directory)).toEqual([first, first])
})
