import { afterEach, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"

const directories = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  await mkdir("/tmp/opencode", { recursive: true })
  const home = await mkdtemp("/tmp/opencode/text-tests-")
  directories.push(home)
  const executable = path.join(home, "installed opencode")
  await Bun.write(executable, `#!${process.execPath}
console.log(JSON.stringify({ args: process.argv.slice(2), directory: process.cwd() }))
process.exit(Number(process.env.TEXT_TEST_EXIT ?? 0))
`)
  await chmod(executable, 0o755)
  const data = path.join(home, "data", "uncode")
  const env = { ...process.env, HOME: home, XDG_DATA_HOME: path.join(home, "data"), OPENCODE_BIN: executable }
  return {
    home, data, executable, env,
    setup(action) {
      return Bun.spawnSync(["bash", path.join(import.meta.dir, "../setup.sh"), action], {
        env, stdout: "pipe", stderr: "pipe",
      })
    },
    shell(script, args = []) {
      return Bun.spawnSync(["bash", "--noprofile", "--norc", "-ic", script, "text-test", ...args], {
        env: { ...env, HISTFILE: "/dev/null" }, stdin: "ignore", stdout: "pipe", stderr: "pipe",
      })
    },
  }
}

test("install migrates the old hook, preserves shell settings, and is idempotent", async () => {
  const context = await fixture()
  await mkdir(context.data, { recursive: true })
  await Bun.write(path.join(context.home, ".bashrc"), `export KEEP_SETTING=yes
# >>> uncode bash input hook >>>
source old-hook.sh
# <<< uncode bash input hook <<<
alias keep_alias='pwd'
`)
  for (const file of ["bash-hook.sh", "bash-ai.sh", "bash-classify.js"])
    await Bun.write(path.join(context.data, file), "legacy")
  expect(context.setup("install").exitCode).toBe(0)
  expect(context.setup("install").exitCode).toBe(0)
  const rc = await Bun.file(path.join(context.home, ".bashrc")).text()
  expect(rc).toContain("export KEEP_SETTING=yes")
  expect(rc).toContain("alias keep_alias='pwd'")
  expect(rc).not.toContain("source old-hook.sh")
  expect(rc.match(/# >>> easycode text hook >>>/g)).toHaveLength(1)
  expect(await Bun.file(path.join(context.data, "text", "config.json")).json()).toEqual({ opencode: context.executable })
  for (const file of ["bash-hook.sh", "bash-ai.sh", "bash-classify.js"])
    expect(await Bun.file(path.join(context.data, file)).exists()).toBe(false)
})

test("uninstall removes only owned files and blocks, including legacy leftovers", async () => {
  const context = await fixture()
  await Bun.write(path.join(context.home, ".bashrc"), "export KEEP_SETTING=yes\n")
  expect(context.setup("install").exitCode).toBe(0)
  await Bun.write(path.join(context.data, "unrelated.json"), "keep")
  expect(context.setup("uninstall").exitCode).toBe(0)
  expect(context.setup("uninstall").exitCode).toBe(0)
  expect(await Bun.file(path.join(context.home, ".bashrc")).text()).toBe("export KEEP_SETTING=yes\n")
  expect(await Bun.file(path.join(context.data, "text", "hook.sh")).exists()).toBe(false)
  expect(await Bun.file(path.join(context.data, "unrelated.json")).text()).toBe("keep")
})

test("an unterminated legacy hook block leaves the original bashrc unchanged", async () => {
  const context = await fixture()
  const original = "export KEEP_SETTING=yes\n# >>> uncode bash input hook >>>\nsource old-hook.sh\n"
  await Bun.write(path.join(context.home, ".bashrc"), original)
  const result = context.setup("install")
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).toContain("Unterminated")
  expect(await Bun.file(path.join(context.home, ".bashrc")).text()).toBe(original)
})

test("uninstall without an installation does not create a bashrc", async () => {
  const context = await fixture()
  expect(context.setup("uninstall").exitCode).toBe(0)
  expect(await Bun.file(path.join(context.home, ".bashrc")).exists()).toBe(false)
})

test("launcher enables thinking without changing the selected executable, prompt or directory", async () => {
  const context = await fixture()
  expect(context.setup("install").exitCode).toBe(0)
  const directory = path.join(context.home, "project with spaces")
  await mkdir(directory)
  const message = "--help; $(echo should-not-execute)\nsecond line"
  const result = Bun.spawnSync([
    process.execPath, path.join(context.data, "text", "launch.js"), "ses_test", directory, message,
  ], { stdout: "pipe", stderr: "pipe" })
  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout.toString())).toEqual({
    args: ["run", "--session", "ses_test", "--thinking", "--", message], directory,
  })
})

test("launcher forwards OpenCode's failure status", async () => {
  const context = await fixture()
  expect(context.setup("install").exitCode).toBe(0)
  const result = Bun.spawnSync([
    process.execPath, path.join(context.data, "text", "launch.js"), "ses_test", context.home, "hello",
  ], { env: { ...context.env, TEXT_TEST_EXIT: "7" }, stdout: "pipe", stderr: "pipe" })
  expect(result.exitCode).toBe(7)
})

test("session IDs are unique and use the installed OpenCode session prefix", () => {
  const values = Array.from({ length: 2 }, () => Bun.spawnSync([
    process.execPath, path.join(import.meta.dir, "../launch.js"), "--new-session-id",
  ]).stdout.toString().trim())
  values.forEach((value) => expect(value).toMatch(/^ses_[0-9a-f]{32}$/))
  expect(values[0]).not.toBe(values[1])
})

test("Bash routes executables, aliases, functions and shell syntax without sending them to AI", async () => {
  const context = await fixture()
  const result = context.shell(`set -o emacs
source "$1"
shift
alias myalias='pwd'
myfunction() { :; }
for line in "$@"; do
  if text_before_submit "$line"; then printf 'command\n'; else printf 'message\n'; fi
done`, [path.join(import.meta.dir, "../hook.sh"),
    "", "   ", "git status", "pwd", "myalias", "myfunction", "VALUE=x", "./script", "/bin/echo hello",
    "# comment", "$(pwd)", "(pwd)", "> output", "cmd gti status", "explain this directory", "gti status",
  ])
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString().trim().split("\n")).toEqual([
    ...Array(14).fill("command"), "message", "message",
  ])
})

test("the hook reuses one session and its first directory across later cd commands", async () => {
  const context = await fixture()
  expect(context.setup("install").exitCode).toBe(0)
  const first = path.join(context.home, "first project")
  const second = path.join(context.home, "second project")
  await mkdir(first)
  await mkdir(second)
  const result = context.shell(`set -o emacs
source "$1"
PS1=''
cd "$2"
READLINE_LINE='explain this project'
text_handle_enter
cd "$3"
READLINE_LINE='what next?'
text_handle_enter`, [path.join(context.data, "text", "hook.sh"), first, second])
  expect(result.exitCode).toBe(0)
  const calls = result.stdout.toString().split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line))
  expect(calls).toHaveLength(2)
  expect(calls[0].args[2]).toMatch(/^ses_[0-9a-f]{32}$/)
  expect(calls[1].args[2]).toBe(calls[0].args[2])
  expect(calls.map((call) => call.directory)).toEqual([first, first])
})
