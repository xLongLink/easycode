import { createInterface } from "node:readline"
import { Command } from "./protocol.js"
import { VoiceHost } from "./session.js"

const emit = (event: { type: string } & Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify(event)}\n`)
}
const host = new VoiceHost(emit)
const input = createInterface({ input: process.stdin })
const interrupt = () => {
  input.close()
  void host.close().finally(() => process.exit())
}
process.once("SIGTERM", interrupt)
process.once("SIGINT", interrupt)
emit({ type: "ready", version: "node", protocol: 1 })

try {
  for await (const line of input) {
    if (!line.trim()) continue
    const parsed = Command.safeParse(JSON.parse(line))
    if (!parsed.success) {
      emit({ type: "error", message: parsed.error.message, fatal: false })
      continue
    }
    const command = parsed.data
    if (command.type === "close") break
    if (command.type === "start") emit({ type: "offer", sdp: await host.start(command) })
    if (command.type === "answer") {
      await host.answer(command.sdp)
      emit({ type: "connected" })
    }
    if (command.type === "mute") host.mute(command.muted)
    if (command.type === "clear") await host.clear()
    if (command.type === "devices") emit({ type: "devices", input: "Default microphone", output: "Default speakers" })
  }
} catch (error) {
  emit({ type: "error", message: error instanceof Error ? error.message : String(error), fatal: true })
  process.exitCode = 1
} finally {
  input.close()
  await host.close()
  process.off("SIGTERM", interrupt)
  process.off("SIGINT", interrupt)
  emit({ type: "closed" })
}
