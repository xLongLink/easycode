import { expect, test } from "bun:test"
import { builtins } from "../src/plugin/builtins"

test("voice commands are available as a built-in TUI plugin without plugin configuration", () => {
  expect(builtins.filter((plugin) => plugin.id === "opencode-gpt-live.tui")).toHaveLength(1)
})
