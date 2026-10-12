import { $ } from "bun"
import { rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export async function compile(directory: URL) {
  const cwd = fileURLToPath(directory)
  await rm(path.join(cwd, "dist"), { recursive: true, force: true })
  await $`bun tsc -p tsconfig.build.json`.cwd(cwd)
}

export async function bundle(directory: URL, name: string) {
  await compile(directory)
  const root = path.join(fileURLToPath(directory), "src")
  const result = await Bun.build({
    entrypoints: (await Array.fromAsync(new Bun.Glob("**/*.ts").scan({ cwd: root, absolute: true }))).filter(
      (file) => !file.endsWith(".d.ts"),
    ),
    root,
    outdir: path.join(fileURLToPath(directory), "dist"),
    target: "node",
    format: "esm",
    packages: "external",
    splitting: true,
    naming: {
      entry: "[dir]/[name].[ext]",
      chunk: "chunks/[name]-[hash].[ext]",
    },
  })
  if (!result.success) throw new AggregateError(result.logs, `Failed to build ${name}`)
}
