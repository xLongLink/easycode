import { randomUUID } from "node:crypto"

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === "--new-session-id") {
  console.log(randomUUID())
  process.exit(0)
}
if (args.length !== 3 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/.test(args[0]) || !args[1])
  throw new Error("Usage: launch.ts <session> <directory> <message>")
const config = await Bun.file(new URL("./config.json", import.meta.url)).json()
if (typeof config.pi !== "string" || !config.pi.startsWith("/"))
  throw new Error("Invalid text config: expected an absolute Pi executable path")
const runner = config.runner ?? "direct"
if (runner !== "bun" && runner !== "direct")
  throw new Error("Invalid text config: expected a Pi runner")
const piArgs = ["--print", "--session-id", args[0], "--thinking", "high", "--", args[2]]
const command = runner === "bun" ? [process.execPath, config.pi, ...piArgs] : [config.pi, ...piArgs]
const child = Bun.spawnSync(command, {
  cwd: args[1],
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})
process.exit(child.exitCode ?? 1)
