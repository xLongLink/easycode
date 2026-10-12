/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { CliRenderEvents } from "@opentui/core"
import { resolveThemeDocument } from "@opencode/theme/tui"
import { getOpenCodeTheme } from "../../../src/theme"
import { ThemeContextProvider, ThemeProvider, useTheme, useThemes } from "../../../src/context/theme"

test.each(["light", "dark"] as const)("uses the default theme and follows %s terminal mode", async (mode) => {
  let themes: ReturnType<typeof useThemes> | undefined
  function Probe() {
    themes = useThemes()
    return <text>{themes.mode()}</text>
  }
  const app = await testRender(
    () => (
      <ThemeProvider mode={mode}>
        <Probe />
      </ThemeProvider>
    ),
    { width: 20, height: 2 },
  )
  try {
    await app.renderOnce()
    expect(themes?.selected).toBe("opencode")
    expect(themes?.mode()).toBe(mode)
    expect(themes?.currentTokens().text.base.toInts()).toEqual(
      resolveThemeDocument(getOpenCodeTheme(), mode).text.base.toInts(),
    )
    const next = mode === "dark" ? "light" : "dark"
    app.renderer.emit(CliRenderEvents.THEME_MODE, next)
    await app.renderOnce()
    expect(themes?.mode()).toBe(next)
    expect(themes?.currentTokens().text.base.toInts()).toEqual(
      resolveThemeDocument(getOpenCodeTheme(), next).text.base.toInts(),
    )
  } finally {
    app.renderer.destroy()
  }
})

test("dialog surfaces are absolute and can be inherited through the theme context", async () => {
  let themes: ReturnType<typeof useThemes> | undefined
  let theme: ReturnType<typeof useTheme> | undefined
  let contextual: ReturnType<typeof useTheme> | undefined
  function ContextProbe() {
    contextual = useTheme()
    return <text>{contextual.text.base.toString()}</text>
  }
  function Probe() {
    themes = useThemes()
    theme = useTheme()
    return (
      <ThemeContextProvider context="dialog">
        <ContextProbe />
      </ThemeContextProvider>
    )
  }
  const app = await testRender(
    () => (
      <ThemeProvider mode="dark">
        <Probe />
      </ThemeProvider>
    ),
    { width: 20, height: 2 },
  )
  try {
    await app.renderOnce()
    if (!themes || !theme || !contextual) throw new Error("Theme provider is not mounted")
    const dialog = theme.surface("dialog")
    expect(theme.surface("dialog")).toBe(dialog)
    expect(dialog.surface("dialog")).toBe(dialog)
    expect(dialog.background.base).toBe(themes.currentTokens().background.raised.base)
    expect(contextual.background.base).toBe(dialog.background.base)
    expect(contextual.text.base).toBe(dialog.text.base)
    expect(dialog.decrease(dialog.background.raised.base)).toBe(themes.currentTokens().hue.neutral[600])
  } finally {
    app.renderer.destroy()
  }
})
