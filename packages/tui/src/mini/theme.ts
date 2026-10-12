import { RGBA, SyntaxStyle, type CliRenderer, type ColorInput, type TerminalColors } from "@opentui/core"
import { generateSyntax, resolveThemeDocument, type ResolvedTheme } from "@opencode/theme/tui"
import { getOpenCodeTheme } from "../theme"
import { ansiToRgba } from "../theme/color"
import { dedupeWith } from "effect/Array"
import type { EntryKind } from "./types"

type Tone = {
  body: ColorInput
  start?: ColorInput
}

export type RunEntryTheme = Record<EntryKind, Tone>

export type RunSplashTheme = {
  left: ColorInput
  right: ColorInput
  leftShadow: ColorInput
}

export type RunFooterTheme = {
  actionSecondaryText: ColorInput
  actionFocusedBg: ColorInput
  actionFocusedText: ColorInput
  formfieldText: ColorInput
  formfieldFocusedBg: ColorInput
  formfieldFocusedText: ColorInput
  selection: ColorInput
  running: ColorInput
  question: ColorInput
  permission: ColorInput
  success: ColorInput
  link: ColorInput
  categorical: ColorInput[]
  warning: ColorInput
  error: ColorInput
  muted: ColorInput
  text: ColorInput
  shade: ColorInput
  surface: ColorInput
  pane: ColorInput
  border: ColorInput
  line: ColorInput
}

export type RunBlockTheme = {
  text: ColorInput
  muted: ColorInput
  syntax?: SyntaxStyle
  diffRemoved: ColorInput
  diffAddedBg: ColorInput
  diffRemovedBg: ColorInput
  diffContextBg: ColorInput
  diffHighlightAdded: ColorInput
  diffHighlightRemoved: ColorInput
  diffLineNumber: ColorInput
  diffAddedLineNumberBg: ColorInput
  diffRemovedLineNumberBg: ColorInput
}

export type RunTheme = {
  background: ColorInput
  footer: RunFooterTheme
  entry: RunEntryTheme
  splash: RunSplashTheme
  block: RunBlockTheme
}

export const transparent = RGBA.fromValues(0, 0, 0, 0)

const ansiPalette = Array.from({ length: 256 }, (_, index) => RGBA.fromIndex(index, ansiToRgba(index)))
const palettes = new WeakMap<CliRenderer, TerminalColors>()

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function oklab(color: RGBA) {
  const r = srgbToLinear(color.r)
  const g = srgbToLinear(color.g)
  const b = srgbToLinear(color.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function nearestIndexed(indexed: RGBA[], color: RGBA): RGBA {
  const target = oklab(color)
  const hit = indexed.reduce(
    (best, item) => {
      const sample = oklab(item)
      const dl = sample.l - target.l
      const da = sample.a - target.a
      const db = sample.b - target.b
      const dist = dl * dl * 2 + da * da + db * db
      return dist >= best.dist ? best : { dist, item }
    },
    { dist: Number.POSITIVE_INFINITY, item: indexed[0]! },
  )
  return RGBA.clone(hit.item)
}

function map(theme: ResolvedTheme, indexed: RGBA[], syntax?: SyntaxStyle): RunTheme {
  const scrollback = (color: RGBA) =>
    color.a === 0 || color.intent !== "rgb" ? color : nearestIndexed(indexed, color)
  syntax?.getAllStyles().forEach((style, name) => {
    syntax.registerStyle(name, {
      ...style,
      fg: style.fg && scrollback(style.fg),
      bg: style.bg && scrollback(style.bg),
    })
  })

  return {
    background: RGBA.defaultBackground(theme.background.base),
    footer: {
      actionSecondaryText: theme.text.action.secondary.base,
      actionFocusedBg: theme.background.action.primary.focused,
      actionFocusedText: theme.text.action.primary.focused,
      formfieldText: theme.text.formfield.base,
      formfieldFocusedBg: theme.background.formfield.focused,
      formfieldFocusedText: theme.text.formfield.focused,
      selection: theme.text.formfield.selected,
      running: theme.hue.interactive[200],
      question: theme.hue.accent[200],
      permission: theme.hue.accent[200],
      success: theme.text.feedback.success.base,
      link: theme.markdown.link,
      categorical: dedupeWith(
        theme.categorical.map((scale) => scale[200]),
        (a, b) => a.equals(b),
      ),
      warning: theme.text.feedback.warning.base,
      error: theme.text.feedback.error.base,
      muted: theme.text.muted,
      text: theme.text.base,
      shade: theme.background.raised.base,
      surface: theme.background.raised.base,
      pane: theme.background.raised.high,
      border: theme.border.base,
      line: theme.background.raised.high,
    },
    entry: {
      system: { body: scrollback(theme.text.muted) },
      user: { body: scrollback(theme.text.base) },
      assistant: { body: scrollback(theme.markdown.text) },
      reasoning: { body: scrollback(theme.text.muted) },
      tool: { body: scrollback(theme.text.muted), start: scrollback(theme.text.muted) },
      error: { body: scrollback(theme.text.feedback.error.base) },
    },
    splash: {
      left: nearestIndexed(indexed, theme.text.muted),
      right: nearestIndexed(indexed, theme.text.base),
      leftShadow: nearestIndexed(indexed, theme.background.raised.base),
    },
    block: {
      text: scrollback(theme.text.base),
      muted: scrollback(theme.text.muted),
      syntax,
      diffRemoved: scrollback(theme.diff.text.removed),
      diffAddedBg: scrollback(theme.diff.background.added),
      diffRemovedBg: scrollback(theme.diff.background.removed),
      diffContextBg: scrollback(theme.diff.background.context),
      diffHighlightAdded: scrollback(theme.diff.highlight.added),
      diffHighlightRemoved: scrollback(theme.diff.highlight.removed),
      diffLineNumber: scrollback(theme.diff.lineNumber.text),
      diffAddedLineNumberBg: scrollback(theme.diff.lineNumber.background.added),
      diffRemovedLineNumberBg: scrollback(theme.diff.lineNumber.background.removed),
    },
  }
}

export const RUN_THEME_FALLBACK = map(resolveThemeDocument(getOpenCodeTheme(), "dark"), ansiPalette)

function monoTheme(): RunTheme {
  const foreground = RGBA.defaultForeground("#ffffff")
  const background = RGBA.defaultBackground("#000000")
  return {
    background,
    footer: {
      actionSecondaryText: foreground,
      actionFocusedBg: background,
      actionFocusedText: foreground,
      formfieldText: foreground,
      formfieldFocusedBg: background,
      formfieldFocusedText: foreground,
      selection: foreground,
      running: foreground,
      question: foreground,
      permission: foreground,
      success: foreground,
      link: foreground,
      categorical: [foreground],
      warning: foreground,
      error: foreground,
      muted: foreground,
      text: foreground,
      shade: background,
      surface: background,
      pane: background,
      border: foreground,
      line: background,
    },
    entry: {
      system: { body: foreground },
      user: { body: foreground },
      assistant: { body: foreground },
      reasoning: { body: foreground },
      tool: { body: foreground },
      error: { body: foreground },
    },
    splash: { left: foreground, right: foreground, leftShadow: background },
    block: {
      text: foreground,
      muted: foreground,
      diffRemoved: foreground,
      diffAddedBg: background,
      diffRemovedBg: background,
      diffContextBg: background,
      diffHighlightAdded: foreground,
      diffHighlightRemoved: foreground,
      diffLineNumber: foreground,
      diffAddedLineNumberBg: background,
      diffRemovedLineNumberBg: background,
    },
  }
}

export const RUN_THEME_MONO = monoTheme()

export async function resolveRunTheme(renderer: CliRenderer, mono = false): Promise<RunTheme> {
  if (mono) return RUN_THEME_MONO

  const detected = await renderer.getPalette({ size: 256 }).catch(() => undefined)
  // A transient OSC timeout must not remap immutable scrollback against an unrelated ANSI palette.
  const colors =
    (detected?.defaultBackground ?? detected?.palette[0]) && (detected?.defaultForeground ?? detected?.palette[7])
      ? detected
      : palettes.get(renderer)
  if (colors) palettes.set(renderer, colors)
  if (!colors) return RUN_THEME_FALLBACK
  const theme = resolveThemeDocument(getOpenCodeTheme(), "dark")
  const indexed = colors
    ? ansiPalette.map((color, index) => (colors.palette[index] ? RGBA.fromIndex(index, colors.palette[index]!) : color))
    : ansiPalette
  return {
    ...map(theme, indexed, generateSyntax(theme)),
    background: RGBA.defaultBackground(colors?.defaultBackground ?? theme.background.base),
  }
}
