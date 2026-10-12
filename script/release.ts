#!/usr/bin/env bun

import { $ } from "bun"
import path from "path"
import { parseArgs } from "util"

const root = path.resolve(import.meta.dir, "..")
const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log(`Usage: bun script/release.ts [version]

Confirms and dispatches the release workflow on dev.
The version defaults to package.json and must match it.`)
  process.exit(0)
}

const current = (await Bun.file(path.join(root, "package.json")).json()).version
const version = positionals[0] ?? current
if (positionals.length > 1 || !/^\d+\.\d+\.\d+$/.test(version) || version !== current) {
  console.error("Expected a stable version matching package.json")
  process.exit(1)
}

const answer = prompt(`Trigger the ${version} release? [y/N]`)
if (answer?.trim().toLowerCase() !== "y" && answer?.trim().toLowerCase() !== "yes") {
  console.log("Release cancelled")
  process.exit(0)
}

process.chdir(root)
await $`gh workflow run publish.yml --ref dev -f version=${version}`
console.log(`Triggered the ${version} release`)
