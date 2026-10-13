import { once } from "node:events"
import { Worker } from "node:worker_threads"
import { z } from "zod"
import { assets } from "./assets"

const transcript = z.object({ text: z.string(), language: z.string() })

// Inline the worker so bundled and compiled CLIs do not need an extra worker asset.
// Each worker owns one non-thread-safe WASM instance and is released after dictation.
const source = `
;(async () => {
  const { parentPort, workerData } = await import("node:worker_threads")
  const { readFileSync } = await import("node:fs")
  const { pathToFileURL } = await import("node:url")
  const factory = await import(pathToFileURL(workerData.javascript).href)
  const engine = await factory.default({ wasmBinary: readFileSync(workerData.wasm) })
  const model = readFileSync(workerData.model)
  const weights = engine._malloc(model.byteLength)
  try {
    engine.HEAPU8.set(model, weights)
    if (engine._needle_load(weights, BigInt(model.byteLength)) < 0)
      throw new Error(engine.UTF8ToString(engine._needle_last_error()))
  } finally {
    engine._free(weights)
  }
  parentPort.once("message", (audio) => {
    const pcm = engine._malloc(audio.byteLength || 4)
    const output = engine._malloc(262144)
    try {
      engine.HEAPU8.set(new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength), pcm)
      if (engine._needle_transcribe(pcm, audio.length, 0, 0, 0, output, 262144) < 0)
        throw new Error(engine.UTF8ToString(engine._needle_last_error()))
      parentPort.postMessage(JSON.parse(engine.UTF8ToString(output)))
    } finally {
      engine._free(output)
      engine._free(pcm)
    }
  })
  parentPort.postMessage("ready")
})().catch((error) => { throw error })
`

export async function createEngine(options: { cacheDirectory?: string; signal?: AbortSignal } = {}) {
  const files = await assets(options)
  options.signal?.throwIfAborted()
  const worker = new Worker(source, { eval: true, workerData: files })
  const close = () => worker.terminate().then(() => {})
  const abort = () => {
    void close()
  }
  options.signal?.addEventListener("abort", abort, { once: true })
  await once(worker, "message", { signal: options.signal }).catch(async (error) => {
    options.signal?.removeEventListener("abort", abort)
    await close()
    throw error
  })
  return {
    async transcribe(audio: Float32Array) {
      options.signal?.throwIfAborted()
      const result = once(worker, "message", { signal: options.signal })
      worker.postMessage(audio)
      const [response]: unknown[] = await result
      return transcript.parse(response)
    },
    async close() {
      options.signal?.removeEventListener("abort", abort)
      await close()
    },
  }
}
