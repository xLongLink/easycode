import { afterEach, expect, test } from "bun:test"
import { chmod, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { captureAudio, microphoneCommand } from "../src/microphone"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function executable(source: string, name = "recorder") {
  const directory = await mkdtemp(path.join(tmpdir(), "needle-test-"))
  directories.push(directory)
  const file = path.join(directory, name)
  await Bun.write(file, `#!${process.execPath}\n${source}\n`)
  await chmod(file, 0o755)
  return file
}

test("capture converts signed 16-bit mono PCM to float samples", async () => {
  const file = await executable(`process.stdout.write(Buffer.from([0, 0, 255, 127, 0, 128, 0, 64]))`)
  const capture = captureAudio({ command: [file] })
  expect(Array.from(await capture.result)).toEqual([0, 32767 / 32768, -1, 0.5])
})

test("capture joins partial samples across pipe chunks", async () => {
  const file = await executable(`
    process.stdout.write(Buffer.from([0]))
    setTimeout(() => process.stdout.write(Buffer.from([64])), 10)
  `)
  expect(Array.from(await captureAudio({ command: [file] }).result)).toEqual([0.5])
})

test("stop terminates the recorder without treating interruption as failure", async () => {
  const file = await executable(`setInterval(() => {}, 1000)`)
  const capture = captureAudio({ command: [file], onStart: () => capture.stop() })
  expect((await capture.result).length).toBe(0)
})

test("capture caps audio at 30 seconds even when a recorder sends more", async () => {
  const file = await executable(`process.stdout.write(Buffer.alloc(16000 * 31 * 2))`)
  expect((await captureAudio({ command: [file] }).result).length).toBe(16000 * 30)
})

test("cancellation rejects and terminates capture", async () => {
  const file = await executable(`setInterval(() => {}, 1000)`)
  const controller = new AbortController()
  const capture = captureAudio({
    command: [file],
    signal: controller.signal,
    onStart: () => controller.abort(new Error("Dictation cancelled")),
  })
  await expect(capture.result).rejects.toThrow("Dictation cancelled")
})

test("already-cancelled capture does not start a recorder", async () => {
  await expect(
    captureAudio({
      command: ["/nonexistent/recorder"],
      signal: AbortSignal.abort(new Error("Dictation cancelled")),
    }).result,
  ).rejects.toThrow("Dictation cancelled")
})

test("missing recorder reports a process error", async () => {
  await expect(captureAudio({ command: ["/nonexistent/recorder"] }).result).rejects.toThrow(
    "Unable to record microphone",
  )
})

test("recorder failure includes stderr", async () => {
  const file = await executable(`console.error("No input device"); process.exit(1)`)
  await expect(captureAudio({ command: [file] }).result).rejects.toThrow("No input device")
})

test("Linux selects an installed PipeWire recorder with raw 16 kHz mono output", async () => {
  const file = await executable("", "pw-record")
  expect(await microphoneCommand("linux", path.dirname(file))).toEqual([
    file,
    "--raw",
    "--format",
    "s16",
    "--rate",
    "16000",
    "--channels",
    "1",
    "-",
  ])
})

test("Linux falls back to ALSA when other recorders are absent", async () => {
  const file = await executable("", "arecord")
  expect((await microphoneCommand("linux", path.dirname(file)))[0]).toBe(file)
})

test("macOS selects SoX and reports an actionable error if none is installed", async () => {
  const file = await executable("", "rec")
  expect((await microphoneCommand("darwin", path.dirname(file)))[0]).toBe(file)
  await expect(microphoneCommand("darwin", "/nonexistent/recorders")).rejects.toThrow("brew install sox")
})
