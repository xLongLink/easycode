import { spawn, type ChildProcess } from "node:child_process"
import { closeSync, openSync, readFileSync, writeSync } from "node:fs"
import { FRAME_BYTES, PcmQueue, RATE, readWav, wavHeader } from "./pcm.js"
import type { Emit, Start } from "./protocol.js"

export function captureArgs(platform = process.platform) {
  if (platform === "linux")
    return ["-f", process.env.GPT_LIVE_AUDIO_BACKEND ?? "pulse", "-i", process.env.GPT_LIVE_INPUT_DEVICE ?? "default"]
  if (platform === "darwin") return ["-f", "avfoundation", "-i", process.env.GPT_LIVE_INPUT_DEVICE ?? ":default"]
  throw new Error(`Voice audio devices are not supported on ${platform}`)
}

export class Audio {
  private readonly input = new PcmQueue()
  private readonly output = new PcmQueue()
  private capture: ChildProcess | undefined
  private player: ChildProcess | undefined
  private file: Buffer | undefined
  private offset = 0
  private recording: number | undefined
  private written = 0
  private closed = false

  constructor(
    private readonly options: Start,
    private readonly emit: Emit,
  ) {}

  async open() {
    if (this.options.input) this.file = readWav(readFileSync(this.options.input.file))
    if (!this.options.input) {
      this.capture = await this.launch(process.env.GPT_LIVE_FFMPEG ?? "ffmpeg", [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        ...captureArgs(),
        "-ac",
        "2",
        "-ar",
        String(RATE),
        "-f",
        "s16le",
        "pipe:1",
      ])
      this.capture.stdout?.on("data", (pcm: Buffer) => this.input.push(pcm))
    }
    if (this.options.output && this.options.output !== "none") {
      this.recording = openSync(this.options.output.file, "w")
      writeSync(this.recording, wavHeader(0))
    }
    if (!this.options.output) await this.openPlayer()
    this.emit({
      type: "audio",
      input: { name: this.options.input?.file ?? "Default microphone", rate: RATE, channels: 2 },
      output: {
        name: this.options.output === "none" ? "None" : (this.options.output?.file ?? "Default speakers"),
        rate: RATE,
        channels: 2,
      },
    })
  }

  private async launch(binary: string, args: string[]) {
    const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] })
    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000)
    })
    child.stdin?.on("error", (error: Error) => {
      if (!this.closed && child === this.player) this.emit({ type: "error", message: error.message, fatal: true })
    })
    child.on("exit", (code) => {
      if (this.closed || (child !== this.player && child !== this.capture)) return
      // A device process is expected to remain alive for the whole call.
      this.emit({ type: "error", message: stderr.trim() || `${binary} stopped (${code})`, fatal: true })
    })
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve)
      child.once("error", () =>
        reject(new Error(`Could not start ${binary}. Install FFmpeg (including ffplay) for voice audio.`)),
      )
    })
    return child
  }

  private async openPlayer() {
    this.player = await this.launch(process.env.GPT_LIVE_FFPLAY ?? "ffplay", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nodisp",
      "-autoexit",
      "-fflags",
      "nobuffer",
      "-f",
      "s16le",
      "-ar",
      String(RATE),
      "-ch_layout",
      "stereo",
      "-i",
      "pipe:0",
    ])
  }

  read() {
    if (!this.file) return this.input.read()
    const frame = Buffer.alloc(FRAME_BYTES)
    this.file.copy(frame, 0, this.offset, this.offset + FRAME_BYTES)
    this.offset = Math.min(this.file.length, this.offset + FRAME_BYTES)
    return frame
  }

  receive(pcm: Buffer) {
    this.output.push(pcm)
  }

  play() {
    const frame = this.output.read()
    if (this.recording !== undefined) {
      writeSync(this.recording, frame)
      this.written += frame.length
    }
    if (this.player?.stdin?.writable && this.player.stdin.writableLength < FRAME_BYTES * 10)
      this.player.stdin.write(frame)
    return frame
  }

  async clear() {
    this.output.clear()
    const player = this.player
    this.player = undefined
    player?.kill()
    if (player && !this.closed) await this.openPlayer()
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.capture?.kill()
    this.player?.kill()
    if (this.recording !== undefined) {
      writeSync(this.recording, wavHeader(this.written), 0, 44, 0)
      closeSync(this.recording)
      this.recording = undefined
    }
  }
}
