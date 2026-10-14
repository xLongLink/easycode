import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createEngine } from "./engine.ts"
import { detectKeyboard } from "./detect-keyboard.ts"
import { openKeyboard } from "./keyboard.ts"

const [action, ...args] = process.argv.slice(2)
if (action === "download") {
  const engine = await createEngine()
  if ((await engine.transcribe(new Float32Array(16000))) !== "")
    throw new Error("Whistle silence self-test failed")
  await engine.close()
  console.info("Whistle ready (TypeScript + native CPU engine)")
}
if (action === "check") openKeyboard(args[0], true)
if (action === "detect") {
  console.error("Press the Copilot key on the keyboard you want to use (within 30 seconds)...")
  console.info(await detectKeyboard(args))
}
if (action === "configure") {
  const [root, keyboard, config, unit] = args
  const quote = (value: string) =>
    `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`
  await mkdir(dirname(unit), { recursive: true })
  await Bun.write(config, JSON.stringify({ keyboard, language: null }, null, 2) + "\n")
  await Bun.write(
    unit,
    `[Unit]
Description=Local Whistle Copilot-key dictation
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart=${quote(process.execPath)} ${quote(join(root, "voice.ts"))}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=graphical-session.target
`,
  )
}
if (!["download", "check", "detect", "configure"].includes(action))
  throw new Error("Unknown voice setup action")
