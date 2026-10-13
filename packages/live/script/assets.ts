import { fileURLToPath } from "node:url"
import path from "node:path"
import { readPromptSource } from "../src/server/prompt.js"

/** Self-contained assets for Bun executables and Node SEA builds. */
export async function liveAssets() {
  const host = await Bun.build({
    entrypoints: [fileURLToPath(new URL("../src/host/index.ts", import.meta.url))],
    target: "node",
    format: "esm",
    minify: true,
    banner: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  })
  if (!host.success) throw new AggregateError(host.logs, "Could not bundle the voice helper")
  const directory = fileURLToPath(new URL("../src/server/prompts", import.meta.url))
  return {
    host: await host.outputs[0].text(),
    prompts: Object.fromEntries(["gpt-live", "voice-agent"].map((name) => [name, readPromptSource(path.join(directory, name))] as const)),
  }
}
