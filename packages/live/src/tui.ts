// Import renderables here so the plugin loader uses the host's OpenTUI runtime.
import { BoxRenderable, ScrollBoxRenderable, TextRenderable, TextAttributes, RGBA, StyledText } from "@opentui/core"
import { createTuiPlugin } from "./tui/index.js"

export default createTuiPlugin({ BoxRenderable, ScrollBoxRenderable, TextRenderable, TextAttributes, RGBA, StyledText })
