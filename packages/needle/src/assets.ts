import { randomUUID } from "node:crypto"
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

// Pin both archives together: the .cact format is tied to the engine version.
const engineRevision = "93e88ede867e4311c39151285e74df513e4b835b"
const modelRevision = "ca5287601bef25af26dcf2e1b2bdc0843a7c19e5"

export async function assets(options: { cacheDirectory?: string; signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted()
  const directory = path.join(
    options.cacheDirectory ??
      path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache"), "uncode", "needle"),
    `${engineRevision}-${modelRevision}`,
  )
  await mkdir(directory, { recursive: true })
  await Promise.all([
    download(
      `https://huggingface.co/Cactus-Compute/needle3/resolve/${engineRevision}/wasm/needle.js`,
      path.join(directory, "needle.cjs"),
      options.signal,
    ),
    download(
      `https://huggingface.co/Cactus-Compute/needle3/resolve/${engineRevision}/wasm/needle.wasm`,
      path.join(directory, "needle.wasm"),
      options.signal,
    ),
    download(
      `https://huggingface.co/Cactus-Compute/whistle/resolve/${modelRevision}/whistle.cact`,
      path.join(directory, "whistle.cact"),
      options.signal,
    ),
  ])
  return {
    javascript: path.join(directory, "needle.cjs"),
    wasm: path.join(directory, "needle.wasm"),
    model: path.join(directory, "whistle.cact"),
  }
}

export async function download(url: string, file: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (
    await stat(file).then(
      (info) => info.size > 0,
      () => false,
    )
  )
    return
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Unable to download Whistle: HTTP ${response.status} (${url})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length) throw new Error(`Whistle download was empty (${url})`)
  // Publish only complete downloads; cancelling must not poison the offline cache.
  const temporary = `${file}.${randomUUID()}.partial`
  try {
    await writeFile(temporary, bytes)
    signal?.throwIfAborted()
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
}
