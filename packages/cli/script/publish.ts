#!/usr/bin/env bun
import { $ } from "bun"
import { chmod, rm } from "node:fs/promises"
import path from "node:path"
import { Script } from "@opencode/script"

const dir = path.resolve(import.meta.dir, "..")
const root = path.resolve(process.env.OPENCODE_CLI_DIST ?? path.join(dir, "dist"))
const dryRun = process.argv.includes("--dry-run")
const repo = process.env.GH_REPO ?? "anomalyco/opencode"
const tag = `v${Script.version}`

if (!Script.release && !dryRun) {
  console.log("skipped CLI publication without a release")
  process.exit(0)
}

const files = await Promise.all(
  (await Array.fromAsync(new Bun.Glob("**/bin/*").scan({ cwd: root })))
    .filter((file) =>
      /^(?:node\/cli-node-|cli-)(?:linux|darwin)-[^/]+\/bin\/(?:opencode|opencode2-node)$/.test(file),
    )
    .map(async (file) => {
      const source = path.join(root, file)
      const binary = path.basename(file)
      const target = path.basename(path.dirname(path.dirname(file)))
      const name = target.replace(/^cli-node-/, "opencode-node-").replace(/^cli-/, "opencode-")
      const output = path.join(root, `${name}.tar.gz`)
      if (!Bun.file(source).size) throw new Error(`Empty release binary: ${source}`)
      // CI downloads do not preserve executable permissions.
      await chmod(source, 0o755)
      await rm(output, { force: true })
      await $`tar -czf ${output} -C ${path.dirname(source)} ${binary}`
      return output
    }),
)
if (!files.length) throw new Error(`No CLI release binaries found in ${root}`)

if (dryRun) {
  console.log(`Prepared release archives: ${files.join(", ")}`)
  process.exit(0)
}

if ((await $`gh release view ${tag} --repo ${repo}`.nothrow()).exitCode !== 0) {
  const target = (await $`git rev-parse HEAD`.cwd(dir).text()).trim()
  await $`gh release create ${tag} --repo ${repo} --target ${target} --title ${tag} --notes ${process.env.OPENCODE_RELEASE_NOTES ?? ""} ${Script.preview ? ["--prerelease"] : []}`
}
await $`gh release upload ${tag} ${files} ${path.resolve(dir, "../../install")} --repo ${repo} --clobber`
