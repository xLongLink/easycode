import { homedir } from "node:os"
import path from "node:path"
import { createEngine } from "./engine.js"
import { Dictation } from "./dictation.js"
import { Copilot } from "./hotkey.js"
import { openKeyboard } from "./keyboard.js"
import { captureAudio } from "./microphone.js"
import { pasteText } from "./paste.js"

if (!process.env.WAYLAND_DISPLAY) throw new Error("Voice requires a Wayland desktop session")
const config = await Bun.file(
  path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), "uncode-voice.json"),
).json()
if (
  typeof config.keyboard !== "string" ||
  ![null, undefined, "en", "de", "fr", "es", "it", "nl", "pl"].includes(config.language)
)
  throw new Error("Invalid voice config: expected keyboard path and supported language (or null)")
const engine = await createEngine()
const keyboard = openKeyboard(config.keyboard)
const dictation = new Dictation(
  captureAudio,
  (audio) => engine.transcribe(audio, config.language),
  (text) => pasteText(text, keyboard.emit),
)
const hotkey = new Copilot(
  keyboard.emit,
  () => dictation.start(),
  () => dictation.stop(),
)

// Allow the compositor to discover the new virtual keyboard before taking over.
await Bun.sleep(150)
keyboard.grab()
let checkedKeysAt = 0
const timer = setInterval(() => {
  keyboard.read().forEach((event) => hotkey.feed(event))
  if (hotkey.pressed.size && performance.now() - checkedKeysAt >= 100) {
    hotkey.reconcile(keyboard.pressedKeys())
    checkedKeysAt = performance.now()
  }
  dictation.flush(hotkey.pressed.size > 0)
}, 5)

function shutdown() {
  clearInterval(timer)
  dictation.close()
  keyboard.close()
  void engine.close()
}
process.once("exit", shutdown)
process.once("SIGTERM", () => process.exit(0))
process.once("SIGINT", () => process.exit(0))
console.info("Ready: hold Copilot, speak, then release")
