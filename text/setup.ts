const args = process.argv.slice(2)
if (args.length !== 2) throw new Error("Usage: setup.ts <executable> <config-file>")
await Bun.write(args[1], JSON.stringify({ pi: args[0] }, null, 2) + "\n")
