import { CliRenderEvents, SyntaxStyle } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { generateSyntax, resolveThemeDocument, type SurfaceName } from "@opencode/theme/tui"
import { getOpenCodeTheme } from "../theme"
import { createComponentTheme, type ComponentTheme } from "../theme/component"
import { createEffect, createMemo, createSignal, onCleanup, type ParentProps } from "solid-js"
import { createSimpleContext } from "./helper"

const themeContext = createSimpleContext({
  name: "Theme",
  init: (props: { mode: "dark" | "light" }) => {
    const renderer = useRenderer()
    const [mode, setMode] = createSignal(renderer.themeMode ?? props.mode)
    renderer.on(CliRenderEvents.THEME_MODE, setMode)
    onCleanup(() => renderer.off(CliRenderEvents.THEME_MODE, setMode))

    const tokens = createMemo(() => resolveThemeDocument(getOpenCodeTheme(), mode()))
    const current = createComponentTheme(tokens)
    const currentSyntax = createSyntaxStyleMemo(() => generateSyntax(tokens()))
    createEffect(() => renderer.setBackgroundColor(tokens().background.base))

    return {
      current,
      themes: { current, currentTokens: tokens, currentSyntax, mode, selected: "opencode", ready: true },
      ready: true,
    }
  },
})

export function useThemes() {
  return themeContext.use().themes
}
export function useTheme(): ComponentTheme {
  return themeContext.use().current
}
export const ThemeProvider = themeContext.provider

/** Switches the ambient theme surface without remounting children; undefined inherits the enclosing view. */
export function ThemeContextProvider(props: ParentProps<{ context: SurfaceName | undefined }>) {
  const value = themeContext.use()
  const current = createComponentTheme(() => {
    const name = props.context
    return name ? value.themes.currentTokens().surface(name) : value.current
  })
  return (
    <themeContext.context.Provider value={{ current, themes: value.themes, ready: value.ready }}>
      {props.children}
    </themeContext.context.Provider>
  )
}

export function createSyntaxStyleMemo(factory: () => SyntaxStyle) {
  const renderer = useRenderer()
  const retained = new Set<SyntaxStyle>()
  let current: SyntaxStyle | undefined

  const release = (style: SyntaxStyle) => {
    retained.add(style)
    void renderer
      .idle()
      .catch(() => {})
      .finally(() => {
        if (!retained.delete(style)) return
        style.destroy()
      })
  }

  onCleanup(() => {
    if (current) release(current)
  })

  return createMemo(() => {
    const previous = current
    current = factory()
    if (previous) release(previous)
    return current
  })
}
