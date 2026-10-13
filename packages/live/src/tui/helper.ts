import { existsSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

import type { FileSink } from "bun"

export type HelperEvent = { type: string } & Record<string, unknown>
declare const OPENCODE_LIVE_ASSETS: { host: string } | undefined

/** Build the Node entrypoint in source checkouts; published packages already contain it. */
export async function ensureHelper(onProgress?: (message: string) => void): Promise<string> {
  if (!Bun.which("node")) throw new Error("GPT-Live requires Node.js 22 or newer on PATH")
  if (process.env.GPT_LIVE_HOST) return process.env.GPT_LIVE_HOST
  if (typeof OPENCODE_LIVE_ASSETS !== "undefined") {
    const host = OPENCODE_LIVE_ASSETS.host
    const hash = new Bun.CryptoHasher("sha256").update(host).digest("hex")
    const target = path.join(
      process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
      "uncode",
      "live",
      hash,
      "host.mjs",
    )
    if (!(await Bun.file(target).exists())) await Bun.write(target, host)
    return target
  }
  const source = fileURLToPath(new URL("../host/index.ts", import.meta.url))
  if (!existsSync(source)) return fileURLToPath(new URL("../host/index.js", import.meta.url))
  onProgress?.("Preparing the Node.js voice helper…")
  const directory = fileURLToPath(new URL("../../.build", import.meta.url))
  const built = await Bun.build({
    entrypoints: [source],
    outdir: directory,
    target: "node",
    packages: "external",
    naming: "host.js",
  })
  if (!built.success) throw new AggregateError(built.logs, "Could not build the Node.js voice helper")
  return path.join(directory, "host.js")
}

interface Pending {
  expect: string
  resolve: (event: HelperEvent) => void
  reject: (error: Error) => void
}

export interface HelperCallbacks {
  onEvent?: (event: HelperEvent) => void
  onExit?: (code: number | null, stderr: string) => void
}

/** A Node.js voice process speaking newline-delimited JSON over stdio. */
export class HelperProcess {
  private readonly process: ReturnType<typeof Bun.spawn>
  private readonly pending: Pending[] = []
  private stderr = ""
  private exited = false
  readonly ready: Promise<HelperEvent>

  constructor(
    binary: string,
    private readonly callbacks: HelperCallbacks = {},
  ) {
    this.process = Bun.spawn(["node", binary], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    this.ready = this.expect("ready")
    void this.readStdout()
    void this.readStderr()
    void this.watchExit()
  }

  private async watchExit() {
    const code = await this.process.exited
    this.exited = true
    const error = new Error(this.stderr.trim().split("\n").pop() || `audio helper exited (${code})`)
    for (const pending of this.pending.splice(0)) pending.reject(error)
    this.callbacks.onExit?.(code, this.stderr)
  }

  private expect(type: string) {
    return new Promise<HelperEvent>((resolve, reject) => {
      if (this.exited) reject(new Error("audio helper is not running"))
      else this.pending.push({ expect: type, resolve, reject })
    })
  }

  private async readStdout() {
    const stdout = this.process.stdout as ReadableStream<Uint8Array>
    const reader = stdout.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return
      buffer += decoder.decode(chunk.value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        let event: HelperEvent
        try {
          event = JSON.parse(line)
        } catch {
          continue
        }
        this.dispatch(event)
      }
    }
  }

  private async readStderr() {
    const stderr = this.process.stderr as ReadableStream<Uint8Array>
    const reader = stderr.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return
      this.stderr = (this.stderr + decoder.decode(chunk.value, { stream: true })).slice(-4000)
    }
  }

  private dispatch(event: HelperEvent) {
    if (event.type === "error" && this.pending.length > 0 && event.fatal !== true) {
      // Command failures reply with an error instead of the expected response.
      const index = this.pending.findIndex((pending) => pending.expect !== "ready")
      if (index >= 0) {
        const [pending] = this.pending.splice(index, 1)
        pending.reject(new Error(String(event.message)))
        this.callbacks.onEvent?.(event)
        return
      }
    }
    const index = this.pending.findIndex((pending) => pending.expect === event.type)
    if (index >= 0) {
      const [pending] = this.pending.splice(index, 1)
      pending.resolve(event)
    }
    this.callbacks.onEvent?.(event)
  }

  private send(command: Record<string, unknown>) {
    if (this.exited) throw new Error("audio helper is not running")
    const stdin = this.process.stdin as FileSink
    stdin.write(`${JSON.stringify(command)}\n`)
    stdin.flush()
  }

  async start(options: { input?: unknown; output?: unknown; duck?: boolean } = {}): Promise<string> {
    await this.ready
    const offer = this.expect("offer")
    this.send({
      type: "start",
      ...(options.input ? { input: options.input } : {}),
      ...(options.output ? { output: options.output } : {}),
      ...(options.duck ? { duckOthers: true } : {}),
    })
    return String((await offer).sdp)
  }

  async answer(sdp: string): Promise<void> {
    const connected = this.expect("connected")
    this.send({ type: "answer", sdp })
    await connected
  }

  mute(muted: boolean) {
    if (!this.exited) this.send({ type: "mute", muted })
  }

  clear() {
    if (!this.exited) this.send({ type: "clear" })
  }

  async close(timeoutMs = 3000): Promise<void> {
    if (this.exited) return
    try {
      this.send({ type: "close" })
    } catch {
      // Already gone.
    }
    const timer = setTimeout(() => this.process.kill(), timeoutMs)
    await this.process.exited
    clearTimeout(timer)
  }

  kill() {
    if (!this.exited) this.process.kill()
  }
}
