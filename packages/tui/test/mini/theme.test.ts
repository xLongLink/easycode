import { expect, test } from "bun:test"
import { RGBA, type CliRenderer, type TerminalColors } from "@opentui/core"
import { resolveThemeDocument } from "@opencode/theme/tui"
import { RUN_THEME_MONO, resolveRunTheme } from "../../src/mini/theme"
import { getOpenCodeTheme } from "../../src/theme"

function terminalColors(mode: "light" | "dark" = "dark"): TerminalColors {
  return {
    palette: Array.from(
      { length: 256 },
      (_, index) =>
        ["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5"][index % 8]!,
    ),
    defaultBackground: mode === "light" ? "#fbf1c7" : "#1a1b26",
    defaultForeground: mode === "light" ? "#3c3836" : "#c0caf5",
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
  }
}

function renderer(input: { themeMode?: "light" | "dark"; colors?: TerminalColors; fail?: boolean } = {}) {
  return {
    get themeMode() {
      return input.themeMode
    },
    waitForThemeMode: async (): Promise<"light" | "dark" | null> => {
      throw new Error("Must not wait for terminal mode")
    },
    getPalette: async () => {
      if (input.fail) throw new Error("Palette unavailable")
      return input.colors ?? terminalColors()
    },
  } as CliRenderer
}

function rgba(color: unknown) {
  if (!(color instanceof RGBA)) throw new Error("Expected RGBA")
  return color
}

test.each(["light", "dark"] as const)(
  "uses the dark theme with a %s terminal background and indexed scrollback",
  async (mode) => {
    const colors = terminalColors(mode)
    const theme = await resolveRunTheme(renderer({ colors }))
    const expected = resolveThemeDocument(getOpenCodeTheme(), "dark")
    try {
      expect(rgba(theme.footer.text).toInts()).toEqual(expected.text.base.toInts())
      expect(rgba(theme.footer.surface).toInts()).toEqual(expected.background.raised.base.toInts())
      expect(rgba(theme.background).intent).toBe("default")
      expect(rgba(theme.background).toInts()).toEqual(RGBA.fromHex(colors.defaultBackground!).toInts())
      expect(theme.footer.categorical.map((color) => rgba(color).toInts())).toEqual(
        expected.categorical.map((scale) => scale[200].toInts()),
      )
      expect(theme.block.syntax?.getAllStyles().size).toBeGreaterThan(0)
      expect(rgba(theme.entry.reasoning.body).intent).toBe("indexed")
      for (const style of theme.block.syntax!.getAllStyles().values()) {
        if (style.fg && style.fg.a !== 0) expect(style.fg.intent).toBe("indexed")
        if (style.bg && style.bg.a !== 0) expect(style.bg.intent).toBe("indexed")
      }
    } finally {
      theme.block.syntax?.destroy()
    }
  },
)

test.each(["light", "dark"] as const)(
  "uses dark monochrome fallbacks in a %s terminal without querying the palette",
  async (mode) => {
    const term = renderer({ themeMode: mode })
    term.getPalette = async () => {
      throw new Error("Must not query palette")
    }
    const theme = await resolveRunTheme(term, true)
    expect(theme.block.syntax).toBeUndefined()
    expect(rgba(theme.footer.text).toInts().slice(0, 3)).toEqual([255, 255, 255])
    expect(rgba(theme.footer.text).intent).toBe("default")
    expect(rgba(theme.background).intent).toBe("default")
    expect(theme).toBe(RUN_THEME_MONO)
  },
)

test.each(["light", "dark"] as const)("uses dark colors when palette queries fail in %s mode", async (mode) => {
  const theme = await resolveRunTheme(renderer({ themeMode: mode, fail: true }))
  try {
    expect(rgba(theme.footer.text).toInts()).toEqual(resolveThemeDocument(getOpenCodeTheme(), "dark").text.base.toInts())
  } finally {
    theme.block.syntax?.destroy()
  }
})

test("a light background does not select light theme colors", async () => {
  const theme = await resolveRunTheme(renderer({ themeMode: "dark", colors: terminalColors("light") }))
  try {
    expect(rgba(theme.footer.text).toInts()).toEqual(
      resolveThemeDocument(getOpenCodeTheme(), "dark").text.base.toInts(),
    )
  } finally {
    theme.block.syntax?.destroy()
  }
})

test("retains and refreshes the scrollback palette across probe failures", async () => {
  const input = { fail: false, colors: terminalColors(), themeMode: "dark" as "light" | "dark" }
  const term = renderer(input)
  const initial = await resolveRunTheme(term)
  input.fail = true
  const retained = await resolveRunTheme(term)
  input.themeMode = "light"
  const light = await resolveRunTheme(term)
  input.fail = false
  input.colors = { ...terminalColors(), palette: Array.from({ length: 256 }, () => "#ff00ff") }
  const refreshed = await resolveRunTheme(term)
  try {
    expect(rgba(retained.entry.reasoning.body).toInts()).toEqual(rgba(initial.entry.reasoning.body).toInts())
    expect(rgba(light.footer.text).toInts()).toEqual(
      resolveThemeDocument(getOpenCodeTheme(), "dark").text.base.toInts(),
    )
    expect(rgba(refreshed.entry.reasoning.body).toInts()).not.toEqual(rgba(initial.entry.reasoning.body).toInts())
  } finally {
    initial.block.syntax?.destroy()
    retained.block.syntax?.destroy()
    light.block.syntax?.destroy()
    refreshed.block.syntax?.destroy()
  }
})
