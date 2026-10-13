/** @jsxImportSource @opentui/solid */
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onMount } from "solid-js"
import { Keymap } from "../../../src/context/keymap"
import { DialogProvider, useDialog, type DialogContext } from "../../../src/ui/dialog"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

async function mountDialog(root: string, textarea = false) {
  const state = path.join(root, "state")
  await mkdir(state, { recursive: true })
  const [{ ConfigProvider }, { ThemeProvider }, { ToastProvider }] = await Promise.all([
    import("../../../src/config"),
    import("../../../src/context/theme"),
    import("../../../src/ui/toast"),
  ])
  let dialog!: DialogContext
  let keymap!: Keymap
  let prior!: InputRenderable
  let editor!: InputRenderable | TextareaRenderable

  function Fixture() {
    dialog = useDialog()
    keymap = Keymap.use()
    onMount(() => prior.focus())
    return <input ref={(ref) => (prior = ref)} value="Prior target" />
  }

  function Content() {
    onMount(() => editor.focus())
    return (
      <box>
        <text>Dismiss dialog Alpha</text>
        {textarea ? (
          <textarea ref={(ref) => (editor = ref)} initialValue="query" height={2} />
        ) : (
          <input ref={(ref) => (editor = ref)} value="query" />
        )}
      </box>
    )
  }

  const app = await testRender(
    () => (
      <TestTuiContexts directory={root} paths={{ home: root, state, worktree: root }}>
        <ConfigProvider config={createTuiResolvedConfig()}>
          <Keymap.Provider>
            <ThemeProvider>
              <ToastProvider>
                <DialogProvider>
                  <Fixture />
                </DialogProvider>
              </ToastProvider>
            </ThemeProvider>
          </Keymap.Provider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width: 100, height: 24, kittyKeyboard: true },
  )
  app.renderer.start()
  await app.waitFor(() => app.renderer.currentFocusedEditor === prior)
  return {
    app,
    dialog,
    keymap,
    prior,
    editor: () => editor,
    async open(onClose: () => void) {
      dialog.replace(() => <Content />, onClose, { size: "large" })
      dialog.setCentered(true)
      await app.waitForFrame((frame) => frame.includes("Dismiss dialog Alpha"))
      await app.waitFor(() => app.renderer.currentFocusedEditor === editor)
    },
  }
}

test.each(["escape", "ctrl+c"])("%s clears selection first and restores the live prior focus", async (key) => {
  await using tmp = await tmpdir()
  const fixture = await mountDialog(tmp.path)
  const closed: { length: number; text: string; focused: boolean }[] = []
  const press = () =>
    key === "escape" ? fixture.app.mockInput.pressEscape() : fixture.app.mockInput.pressKey("c", { ctrl: true })
  try {
    await fixture.open(() => {
      closed.push({
        length: fixture.dialog.stack.length,
        text: fixture.editor().plainText,
        focused: fixture.app.renderer.currentFocusedEditor === fixture.editor(),
      })
    })
    expect(fixture.keymap.mode.current()).toBe("modal")
    const frame = fixture.app.captureCharFrame().split("\n")
    const row = frame.findIndex((line) => line.includes("Alpha"))
    const column = frame[row]!.indexOf("Alpha") + 1
    await fixture.app.mockMouse.click(column, row)
    await fixture.app.mockMouse.click(column, row)
    await fixture.app.waitFor(() => fixture.app.renderer.getSelection()?.getSelectedText() === "Alpha")
    fixture.editor().focus()
    press()
    await fixture.app.waitFor(() => !fixture.app.renderer.getSelection())
    expect(fixture.editor().plainText).toBe("query")
    expect(closed).toEqual([])
    expect(fixture.dialog.stack).toHaveLength(1)

    press()
    if (key === "ctrl+c") {
      await fixture.app.waitFor(() => fixture.editor().plainText === "")
      expect(closed).toEqual([])
      expect(fixture.dialog.stack).toHaveLength(1)
      press()
    }
    expect(closed).toEqual([{ length: 1, text: key === "escape" ? "query" : "", focused: true }])
    expect(fixture.dialog.stack).toHaveLength(0)
    expect(fixture.dialog.size).toBe("large")
    expect(fixture.dialog.centered).toBe(true)
    await fixture.app.waitFor(() => fixture.app.renderer.currentFocusedEditor === fixture.prior)
    expect(fixture.prior.isDestroyed).toBe(false)
    expect(fixture.keymap.mode.current()).toBe("base")
    press()
    expect(closed).toHaveLength(1)
  } finally {
    fixture.app.renderer.destroy()
  }
})

test("Ctrl+C clears a textarea before dismissing", async () => {
  await using tmp = await tmpdir()
  const fixture = await mountDialog(tmp.path, true)
  const closed: number[] = []
  try {
    await fixture.open(() => closed.push(fixture.dialog.stack.length))
    fixture.app.mockInput.pressKey("c", { ctrl: true })
    await fixture.app.waitFor(() => fixture.editor().plainText === "")
    expect(closed).toEqual([])
    expect(fixture.dialog.stack).toHaveLength(1)
    fixture.app.mockInput.pressKey("c", { ctrl: true })
    expect(closed).toEqual([1])
    await fixture.app.waitFor(() => fixture.app.renderer.currentFocusedEditor === fixture.prior)
  } finally {
    fixture.app.renderer.destroy()
  }
})

test("dismissal slices the current stack after a reentrant callback", async () => {
  await using tmp = await tmpdir()
  const fixture = await mountDialog(tmp.path)
  const closed: string[] = []
  try {
    await fixture.open(() => {
      closed.push("original")
      if (closed.length !== 1) return
      fixture.dialog.replace(
        () => <text>Replacement</text>,
        () => closed.push("replacement"),
      )
      fixture.dialog.setSize("xlarge")
      fixture.dialog.setCentered(true)
    })
    fixture.app.mockInput.pressEscape()
    expect(closed).toEqual(["original", "original"])
    expect(fixture.dialog.stack).toHaveLength(0)
    expect(fixture.dialog.size).toBe("xlarge")
    expect(fixture.dialog.centered).toBe(true)
    await fixture.app.waitFor(() => fixture.app.renderer.currentFocusedEditor === fixture.prior)
  } finally {
    fixture.app.renderer.destroy()
  }
})

test.each(["escape", "ctrl+c"])("%s leaves the dialog open when its callback throws", async (key) => {
  await using tmp = await tmpdir()
  const fixture = await mountDialog(tmp.path)
  const error = new Error("close failed")
  const closed: number[] = []
  try {
    await fixture.open(() => {
      closed.push(fixture.dialog.stack.length)
      throw error
    })
    fixture.editor().setText("")
    // The keymap logs command errors; dismissal must stop before popping or refocusing.
    if (key === "escape") fixture.app.mockInput.pressEscape()
    if (key === "ctrl+c") fixture.app.mockInput.pressKey("c", { ctrl: true })
    expect(closed).toEqual([1])
    expect(fixture.dialog.stack).toHaveLength(1)
    await fixture.app.waitForVisualIdle()
    expect(fixture.app.renderer.currentFocusedEditor).toBe(fixture.editor())
    expect(fixture.keymap.mode.current()).toBe("modal")
  } finally {
    fixture.app.renderer.destroy()
  }
})
