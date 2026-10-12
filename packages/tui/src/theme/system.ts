import { RGBA, type TerminalColors } from "@opentui/core"

export function terminalMode(colors: TerminalColors): "dark" | "light" | undefined {
  if (!colors.defaultBackground) return
  const background = RGBA.fromHex(colors.defaultBackground)
  return 0.299 * background.r + 0.587 * background.g + 0.114 * background.b > 0.5 ? "light" : "dark"
}
