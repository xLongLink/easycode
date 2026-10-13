/**
 * OpenCode maps `@opentui/core` to its own runtime copy only for imports in the plugin's
 * entry file. The entry passes the module in, so every renderable belongs to the host.
 */
import type { BoxRenderable, ScrollBoxRenderable, TextRenderable, TextAttributes, RGBA, StyledText } from "@opentui/core"

export type Core = {
  BoxRenderable: typeof BoxRenderable
  ScrollBoxRenderable: typeof ScrollBoxRenderable
  TextRenderable: typeof TextRenderable
  TextAttributes: typeof TextAttributes
  RGBA: typeof RGBA
  StyledText: typeof StyledText
}

let module: Core | undefined

export function useCore(value: Core) {
  module = value
}

export function core(): Core {
  if (!module) throw new Error("opencode-gpt-live: @opentui/core was not provided by the entry file")
  return module
}
