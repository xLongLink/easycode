import { expect, test } from "bun:test"
import { Needle } from "../src/index"
import { createEngine } from "../src/engine"

test("already-cancelled transcription never downloads the model", async () => {
  await expect(
    Needle.transcribe(new Float32Array(16000), {
      signal: AbortSignal.abort(new Error("Dictation cancelled")),
    }),
  ).rejects.toThrow("Dictation cancelled")
})

// Opt in to real upstream model tests without making ordinary tests depend on the network.
test.skipIf(!process.env.OPENCODE_NEEDLE_TEST_CACHE)(
  "real Whistle WASM transcribes silence in a worker",
  async () => {
    const engine = await createEngine({ cacheDirectory: process.env.OPENCODE_NEEDLE_TEST_CACHE })
    try {
      expect(await engine.transcribe(new Float32Array(16000))).toEqual({ text: "", language: "" })
    } finally {
      await engine.close()
    }
  },
  120000,
)

test.skipIf(!process.env.OPENCODE_NEEDLE_TEST_CACHE)(
  "dictation captures audio and transcribes with the real WASM runtime",
  async () => {
    const statuses: string[] = []
    const capture = Needle.record({
      cacheDirectory: process.env.OPENCODE_NEEDLE_TEST_CACHE,
      command: [process.execPath, "-e", "process.stdout.write(Buffer.alloc(32000))"],
      onStatus: (status) => statuses.push(status),
    })
    expect(await capture.result).toEqual({ text: "", language: "" })
    expect(statuses).toEqual(["recording", "transcribing"])
  },
  120000,
)

test.skipIf(!process.env.OPENCODE_NEEDLE_TEST_CACHE)(
  "cancelling dictation releases the real WASM worker and recorder",
  async () => {
    const capture = Needle.record({
      cacheDirectory: process.env.OPENCODE_NEEDLE_TEST_CACHE,
      command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      onStatus: () => capture.cancel(),
    })
    await expect(capture.result).rejects.toThrow("Dictation cancelled")
  },
  120000,
)
