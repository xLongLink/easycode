#!/usr/bin/env bun

import { Script } from "@opencode/script"
import { $ } from "bun"
import { fileURLToPath } from "url"

console.log("=== publishing ===\n")

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)
const tag = `v${Script.version}`

const pkgjsons = await Array.fromAsync(
  new Bun.Glob("**/package.json").scan({
    absolute: true,
  }),
).then((arr) => arr.filter((x) => !x.includes("node_modules") && !x.includes("dist")))

async function prepareReleaseFiles() {
  for (const file of pkgjsons) {
    let pkg = await Bun.file(file).text()
    pkg = pkg.replaceAll(/"version": "[^"]+"/g, `"version": "${Script.version}"`)
    console.log("updated:", file)
    await Bun.file(file).write(pkg)
  }

  await $`bun install`
}

if (Script.release && !Script.preview) {
  await $`git fetch origin --tags`
  await $`git switch --detach`
}

await prepareReleaseFiles()

for (const name of [
  "schema",
  "codemode",
  "theme",
  "ai",
  "util",
  "protocol",
  "client",
  "plugin",
  "core",
  "simulation",
  "server",
  "sdk",
]) {
  console.log(`\n=== ${name} ===\n`)
  await $`bun ${`./packages/${name}/script/publish.ts`}`
}

if (Script.release && !Script.preview) {
  if ((await $`git diff --quiet`.nothrow()).exitCode !== 0) await $`git commit -am "release: ${tag}"`
  await $`git tag -d ${tag}`.nothrow()
  await $`git tag ${tag}`
  await $`git push origin refs/tags/${tag} --force-with-lease --no-verify`
  await new Promise((resolve) => setTimeout(resolve, 5_000))
  await $`git fetch origin`
  await $`git checkout -B dev origin/dev`
  await prepareReleaseFiles()
  if ((await $`git diff --quiet`.nothrow()).exitCode !== 0) {
    // The release already published this code; a push-triggered dev publish of a version bump is wasted work.
    await $`git commit -am ${`sync release versions for ${tag} [skip ci]`}`
    await $`git push origin HEAD:dev --no-verify`
  }
}

if (Script.release) {
  console.log("\n=== CLI release archives ===\n")
  await $`bun ./packages/cli/script/publish.ts`
}
