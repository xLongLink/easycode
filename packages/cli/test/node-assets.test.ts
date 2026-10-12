import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { collectNodeAssets } from "../script/node-assets"
import { attentionSoundAssets, nodeTarget, shellParserWasmAssets } from "../src/node/target"

test("collects each SEA asset key once", async () => {
  const assets = await collectNodeAssets(nodeTarget(process.platform, process.arch))
  const keys = assets.map((asset) => asset.key)

  expect(new Set(keys).size).toBe(keys.length)
  expect(keys.filter((key) => key === "opencode-pty/opencode-pty")).toHaveLength(1)
  expect(assets.filter((asset) => asset.key === shellParserWasmAssets.runtime)).toEqual([
    {
      key: shellParserWasmAssets.runtime,
      source: fileURLToPath(import.meta.resolve(shellParserWasmAssets.runtime)),
    },
  ])
  expect(assets.filter((asset) => asset.key.startsWith("@opencode/tui/audio/"))).toEqual(
    attentionSoundAssets.map((key) => ({
      key,
      source: fileURLToPath(new URL(`../../tui/src/assets/audio/${key.split("/").at(-1)}`, import.meta.url)),
    })),
  )
})

test.each(["win32", "freebsd"])("rejects unsupported Node platform %s", (platform) => {
  expect(() => nodeTarget(platform, "x64")).toThrow("Unsupported Node executable target")
})
