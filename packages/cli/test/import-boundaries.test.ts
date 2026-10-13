import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { Commands } from "../src/commands/commands"

const root = path.resolve(import.meta.dir, "../../..")

describe("CLI frontend import boundaries", () => {
  test("keeps run without registering Mini", () => {
    expect(Object.keys(Commands.commands)).toContain("run")
    expect(Object.keys(Commands.commands)).not.toContain("mini")
  })

  test("does not import Core directly", async () => {
    const glob = new Bun.Glob("{src,test}/**/*.{ts,tsx}")
    const imports: string[] = []
    for await (const file of glob.scan({ cwd: path.join(root, "packages/cli") })) {
      const source = await Bun.file(path.join(root, "packages/cli", file)).text()
      if (/["']@opencode\/core(?:\/[^"']*)?["']/.test(source)) imports.push(file)
    }
    expect(imports).toEqual([])
  })

  test("keeps ACP and its tests off the promise client", async () => {
    const glob = new Bun.Glob("{src,test}/acp/**/*.ts")
    const imports: string[] = []
    for await (const file of glob.scan({ cwd: path.join(root, "packages/cli") })) {
      const source = await Bun.file(path.join(root, "packages/cli", file)).text()
      if (/["']@opencode\/client(?:\/promise(?:\/[^"']*)?|\/service)?["']/.test(source)) imports.push(file)
    }
    expect(imports).toEqual([])
  })

  test("exposes only the intentional package entrypoints", async () => {
    const run = await import("@opencode/cli/run")
    const tool = await import("@opencode/tui/util/run-tool")
    const cli = await Bun.file(path.join(root, "packages/cli/package.json")).json()

    expect(Object.keys(run).sort()).toEqual(["runNonInteractive", "runV1Bridge"])
    expect(Object.keys(tool).sort()).toEqual([
      "nonEmptyToolContent",
      "readDisplayText",
      "toolInlineInfo",
      "toolOutputText",
    ])
    const tui = await Bun.file(path.join(root, "packages/tui/package.json")).json()
    expect(
      [cli.exports, tui.exports].flatMap((exports) => Object.keys(exports).filter((key) => key.startsWith("./mini"))),
    ).toEqual([])
  })

  test("keeps run off the interactive TUI evaluation graph", async () => {
    const run = await bundleInputs("packages/cli/src/commands/handlers/run.ts")
    expect(run).toContain("packages/cli/src/run/run.ts")
    expect(run).toContain("packages/cli/src/util/error.ts")
    expect(run).toContain("packages/tui/src/util/run-tool.ts")
    expect(run).not.toContain("packages/cli/src/ui/prompt.ts")
    expect(run).not.toContain("packages/tui/src/runtime.tsx")
  })
})

async function bundleInputs(entrypoint: string) {
  const temporary = await mkdtemp(path.join(import.meta.dir, ".import-boundary-"))
  const metafile = path.join(temporary, "meta.json")
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        "build",
        entrypoint,
        "--target=bun",
        "--format=esm",
        "--packages=bundle",
        "--external=@opentui/core-*",
        `--metafile=${metafile}`,
        `--outdir=${path.join(temporary, "out")}`,
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (exitCode !== 0) throw new Error(stdout + stderr)
    const metadata = await Bun.file(metafile).json()
    return Object.keys(metadata.inputs).map((input) =>
      path.relative(root, path.resolve(root, input)).replaceAll(path.sep, "/"),
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
