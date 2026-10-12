#!/usr/bin/env bun
import { $ } from "bun"
import { chmod, rm } from "node:fs/promises"
import path from "node:path"

const dir = path.resolve(import.meta.dir, "..")
const root = path.resolve(process.env.OPENCODE_CLI_DIST ?? path.join(dir, "dist"))

const files = await Promise.all(
  (await Array.fromAsync(new Bun.Glob("**/bin/*").scan({ cwd: root })))
    .filter((file) => /^cli-(?:linux|darwin)-[^/]+\/bin\/easycode$/.test(file))
    .map(async (file) => {
      const source = path.join(root, file)
      const binary = path.basename(file)
      const target = path.basename(path.dirname(path.dirname(file)))
      const name = target.replace(/^cli-/, "easycode-")
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

console.log(`Prepared release archives: ${files.join(", ")}`)
