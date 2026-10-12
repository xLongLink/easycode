#!/usr/bin/env bun

import path from "path"

const root = path.resolve(import.meta.dir, "..")
const packages = Array.from(new Bun.Glob("packages/*/vite.config.mjs").scanSync(root))
  .map((file) => `@opencode/${path.basename(path.dirname(file))}`)
  // Core emits declarations used by the five checks that reference it.
  .sort((a, b) => (a === "@opencode/core" ? -1 : b === "@opencode/core" ? 1 : a.localeCompare(b)))
const tasks = []
for (const pkg of packages) {
  const started = performance.now()
  const proc = Bun.spawn(
    [path.join(root, "node_modules/.bin/vp"), "run", "--no-cache", "--ignore-depends-on", `${pkg}#check:types`],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited])
  if (exitCode !== 0) {
    process.stdout.write(stdout)
    process.stderr.write(stderr)
    process.exit(exitCode)
  }
  tasks.push({ task: pkg, durationMs: performance.now() - started })
}
tasks.sort((a, b) => b.durationMs - a.durationMs)
const total = tasks.reduce((duration, task) => duration + task.durationMs, 0)
const width = Math.max(...tasks.map((task) => task.task.length), "Package".length)

console.log(`Package${" ".repeat(width - "Package".length)}  Time    Share`)
tasks.forEach((task) => {
  const duration = `${(task.durationMs / 1000).toFixed(2)}s`.padStart(7)
  const share = `${((task.durationMs / total) * 100).toFixed(1)}%`.padStart(6)
  console.log(`${task.task.padEnd(width)}  ${duration}  ${share}`)
})
console.log(`\nTotal serial task time: ${(total / 1000).toFixed(2)}s (includes Vite+ startup per package)`)
