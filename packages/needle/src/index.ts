export * as Needle from "./index.js"

import { createEngine } from "./engine"
import { captureAudio } from "./microphone"

export async function transcribe(audio: Float32Array, options: { cacheDirectory?: string; signal?: AbortSignal } = {}) {
  const engine = await createEngine(options)
  try {
    return await engine.transcribe(audio)
  } finally {
    await engine.close()
  }
}

export function record(
  options: {
    cacheDirectory?: string
    command?: readonly [string, ...string[]]
    onStatus?: (status: "recording" | "transcribing") => void
  } = {},
) {
  const controller = new AbortController()
  let capture: ReturnType<typeof captureAudio> | undefined
  const result = (async () => {
    const engine = await createEngine({ cacheDirectory: options.cacheDirectory, signal: controller.signal })
    try {
      controller.signal.throwIfAborted()
      capture = captureAudio({
        command: options.command,
        signal: controller.signal,
        onStart: () => options.onStatus?.("recording"),
      })
      const audio = await capture.result
      controller.signal.throwIfAborted()
      options.onStatus?.("transcribing")
      return await engine.transcribe(audio)
    } finally {
      await engine.close()
    }
  })()
  return {
    result,
    stop: () => capture?.stop(),
    cancel: () => controller.abort(new Error("Dictation cancelled")),
  }
}
