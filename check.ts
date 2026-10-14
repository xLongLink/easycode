const result = await Bun.build({
  entrypoints: ["./check.ts"],
  target: "bun",
})
if (!result.success) {
  console.error(result.logs)
  process.exit(1)
}
for (const cmd of [
  ["make", "-n", "up", "down", "up:text", "down:text", "up:voice", "down:voice", "test"],
]) {
  if (Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" }).exitCode !== 0) process.exit(1)
}
console.info("Root build checks and Make targets passed")
