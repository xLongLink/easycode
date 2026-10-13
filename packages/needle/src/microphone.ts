import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { access } from "node:fs/promises"
import path from "node:path"

const maxBytes = 16000 * 30 * 2

export async function microphoneCommand(platform = process.platform, searchPath = process.env.PATH ?? "") {
  const candidates =
    platform === "linux"
      ? ([
          ["pw-record", "--raw", "--format", "s16", "--rate", "16000", "--channels", "1", "-"],
          ["parec", "--raw", "--format=s16le", "--rate=16000", "--channels=1"],
          ["arecord", "-q", "-t", "raw", "-f", "S16_LE", "-r", "16000", "-c", "1"],
        ] as const)
      : platform === "darwin"
        ? ([
            ["rec", "-q", "-t", "raw", "-r", "16000", "-e", "signed-integer", "-b", "16", "-c", "1", "-L", "-"],
            [
              "ffmpeg",
              "-nostdin",
              "-loglevel",
              "error",
              "-f",
              "avfoundation",
              "-i",
              ":default",
              "-ar",
              "16000",
              "-ac",
              "1",
              "-f",
              "s16le",
              "pipe:1",
            ],
          ] as const)
        : []
  const found = await Promise.all(
    candidates.map(async (candidate) => {
      const matches = await Promise.all(
        searchPath
          .split(path.delimiter)
          .filter(Boolean)
          .map(async (directory) => {
            const file = path.join(directory, candidate[0])
            return await access(file, constants.X_OK).then(
              () => file,
              () => undefined,
            )
          }),
      )
      const executable = matches.find((file) => file !== undefined)
      if (!executable) return
      return [executable, ...candidate.slice(1)] as [string, ...string[]]
    }),
  )
  const command = found.find((candidate) => candidate !== undefined)
  if (command) return command
  throw new Error(
    platform === "darwin"
      ? "Microphone capture needs SoX or FFmpeg. Install with: brew install sox"
      : "Microphone capture needs pw-record, parec, or arecord. Install your distribution's PipeWire, PulseAudio, or ALSA tools.",
  )
}

export function captureAudio(
  options: {
    command?: readonly [string, ...string[]]
    signal?: AbortSignal
    onStart?: () => void
  } = {},
) {
  let stop = () => {}
  const result = (async () => {
    const command = options.command ?? (await microphoneCommand())
    options.signal?.throwIfAborted()
    const child = spawn(command[0], command.slice(1), { stdio: ["ignore", "pipe", "pipe"] })
    return await new Promise<Float32Array>((resolve, reject) => {
      const chunks: Buffer[] = []
      let length = 0
      let stopped = false
      let stderr = ""
      stop = () => {
        stopped = true
        child.kill("SIGINT")
      }
      const timer = setTimeout(stop, 30000)
      const abort = () => {
        child.kill()
        reject(options.signal?.reason ?? new Error("Dictation cancelled"))
      }
      options.signal?.addEventListener("abort", abort, { once: true })
      child.once("spawn", () => options.onStart?.())
      child.stdout.on("data", (chunk: Buffer) => {
        const bytes = chunk.subarray(0, maxBytes - length)
        chunks.push(bytes)
        length += bytes.length
        if (length >= maxBytes) stop()
      })
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-4000)
      })
      child.once("error", (error) => reject(new Error(`Unable to record microphone: ${error.message}`)))
      child.once("close", (code, signal) => {
        clearTimeout(timer)
        options.signal?.removeEventListener("abort", abort)
        if (options.signal?.aborted) return reject(options.signal.reason)
        if (!stopped && (code !== 0 || signal))
          return reject(new Error(`Microphone capture failed: ${stderr.trim() || signal || `exit ${code}`}`))
        const pcm = Buffer.concat(chunks, length)
        resolve(
          Float32Array.from({ length: Math.floor(pcm.length / 2) }, (_, index) => pcm.readInt16LE(index * 2) / 32768),
        )
      })
    })
  })()
  return { result, stop: () => stop() }
}
