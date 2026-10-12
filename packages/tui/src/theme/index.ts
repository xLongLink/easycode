import { migrateV1, parseThemeDocument, type ThemeDocument, type ModeDefinition } from "@opencode/theme/tui"
import { resolveThemeColors } from "./resolve"
import type { Theme, ThemeV1Json } from "./v1"
import opencode from "./assets/v2/opencode.json" with { type: "json" }

export type { Theme, ThemeV1Json } from "./v1"

export type ThemeDocumentSource = Record<string, unknown>

const parsed = new WeakMap<object, ThemeDocument>()
let opencodeTheme: (ThemeDocument & {
  readonly light: ModeDefinition
  readonly dark: ModeDefinition
}) | undefined

export function getOpenCodeTheme() {
  if (opencodeTheme) return opencodeTheme
  const document = parseThemeDocument(opencode, "opencode") as NonNullable<typeof opencodeTheme>
  opencodeTheme = document
  return document
}

export function parseTheme(source: ThemeDocumentSource, name = "theme") {
  const cached = parsed.get(source)
  if (cached) return cached

  const document = "theme" in source ? migrateV1(source as ThemeV1Json) : parseThemeDocument(source, name)

  parsed.set(source, document)
  return document
}

export function resolveTheme(theme: ThemeV1Json, mode: "dark" | "light"): Theme {
  const resolved = resolveThemeColors(theme, mode)
  return {
    ...resolved.theme,
    _hasSelectedListItemText: resolved.hasSelectedListItemText,
    thinkingOpacity: resolved.thinkingOpacity,
  }
}
