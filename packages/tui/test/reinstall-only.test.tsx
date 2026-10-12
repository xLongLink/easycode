import { expect, test } from "bun:test"
import { InputRenderable } from "@opentui/core"
import { createAppFixture } from "./fixture/app"

test("the command palette does not offer an application updater", async () => {
  await using app = await createAppFixture({
    config: { animations: false, keybinds: { "command.palette.show": "f6" } },
  })
  await app.ready
  app.mockInput.pressKey("F6")
  await app.waitFor(() => app.renderer.currentFocusedEditor instanceof InputRenderable)
  await app.mockInput.typeText("opencode.update")
  const frame = await app.waitForFrame((frame) => frame.includes("No results found"))
  expect(frame).not.toContain("Update easycode")
})
