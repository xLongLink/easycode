const args = process.argv.slice(2)
if (args.length !== 2) throw new Error("Usage: setup.js <executable> <config-file>")
await Bun.write(args[1], JSON.stringify({ opencode: args[0] }, null, 2) + "\n")
