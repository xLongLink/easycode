const args = process.argv.slice(2)
if (args.length !== 3) throw new Error("Usage: setup.ts <executable> <runner> <config-file>")
const [pi, runner, configFile] = args
if (runner !== "bun" && runner !== "direct") throw new Error("Invalid Pi runner")
await Bun.write(configFile, JSON.stringify({ pi, runner }, null, 2) + "\n")
