import { randomUUID } from "node:crypto"

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === "--new-session-id") {
  console.log(`ses_${randomUUID().replaceAll("-", "")}`)
  process.exit(0)
}
if (args.length !== 3 || !args[0].startsWith("ses_") || !args[1])
  throw new Error("Usage: launch.js <session> <directory> <message>")
const config = await Bun.file(new URL("./config.json", import.meta.url)).json()
if (typeof config.opencode !== "string" || !config.opencode.startsWith("/"))
  throw new Error("Invalid text config: expected an absolute OpenCode executable path")
const child = Bun.spawnSync([config.opencode, "run", "--session", args[0], "--thinking", "--", args[2]], {
  cwd: args[1], stdin: "inherit", stdout: "inherit", stderr: "inherit",
})
process.exit(child.exitCode ?? 1)
