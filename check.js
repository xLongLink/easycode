const result = await Bun.build({
  entrypoints: ["./check.js", "./text/launch.js", "./text/setup.js", "./voice/voice.js", "./voice/setup.js", "./voice/transcribe.js"],
  target: "bun",
  write: false,
})
if (!result.success) {
  console.error(result.logs)
  process.exit(1)
}
for (const cmd of [
  ["bash", "-n", "text/setup.sh", "text/hook.sh", "voice/setup.sh"],
  ["make", "-n", "up:text", "down:text", "up:voice", "down:voice", "test"],
]) {
  if (Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" }).exitCode !== 0) process.exit(1)
}
for (const directory of ["text", "voice"]) {
  const child = Bun.spawn([process.execPath, "test"], {
    cwd: directory, stdout: "inherit", stderr: "inherit",
  })
  if (await child.exited !== 0) process.exit(1)
}
console.info("JavaScript build checks, Bash syntax, Make targets, and integration tests passed")
