import { expect, test } from "bun:test"
import { getOpenCodeTheme, parseTheme, resolveTheme } from "../src/theme"
import opencodeSource from "../src/theme/assets/opencode.json" with { type: "json" }
import type { ThemeV1Json } from "@opencode/theme/tui/v1"

const opencodeV1 = opencodeSource as ThemeV1Json

test("rejects unrecognized theme structures", () => {
  expect(() => parseTheme({})).toThrow()
  expect(() => parseTheme({ version: 3 })).toThrow("Invalid theme")
})

test("registers opencode as a native V2 theme", () => {
  expect(getOpenCodeTheme()).toBe(getOpenCodeTheme())
  expect(parseTheme(getOpenCodeTheme()).base).toBeDefined()
})

test("detects V1 themes from their theme field and caches migrations", () => {
  const unversioned = structuredClone(opencodeV1)
  const explicit = { ...structuredClone(opencodeV1), version: 1 }
  const first = parseTheme(unversioned, "unversioned")
  const second = parseTheme(explicit, "explicit")

  expect(first.base).toBeDefined()
  expect(second.base).toBeDefined()
  expect(parseTheme(unversioned, "unversioned")).toBe(first)
  expect(parseTheme(explicit, "explicit")).toBe(second)
})

test("decodes native V2 themes lazily once", () => {
  const source = {
    base: getOpenCodeTheme().base,
    light: { ...getOpenCodeTheme().light, categorical: ["red"] },
  } as const

  const document = parseTheme(source)
  expect(document.light?.categorical).toEqual(["red"])
  expect(parseTheme(source)).toBe(document)
})

test("rejects invalid V2 themes when parsing", () => {
  expect(() => parseTheme({ light: { categorical: [] } }, "invalid-v2")).toThrow("Invalid theme: invalid-v2")
})

test("rejects invalid V1 themes when parsing", () => {
  const source = structuredClone(opencodeV1)
  source.defs = { ...source.defs, one: "two", two: "one" }
  source.theme.primary = "one"

  expect(() => parseTheme(source)).toThrow("Circular color reference")
})

test("replacement sources receive independent parse caches", () => {
  const first = structuredClone(opencodeV1)
  const second = structuredClone(opencodeV1)
  second.theme.primary = "#123456"

  const previous = parseTheme(first)
  const next = parseTheme(second)
  expect(next).not.toBe(previous)
  expect(parseTheme(second)).toBe(next)
})

test("resolveTheme rejects circular color refs", () => {
  const item = structuredClone(opencodeV1)
  item.defs = { ...item.defs, one: "two", two: "one" }
  item.theme.primary = "one"
  expect(() => resolveTheme(item, "dark")).toThrow("Circular color reference")
})

test("resolveTheme preserves full theme numeric color and marker semantics", () => {
  const item = structuredClone(opencodeV1)
  item.theme.primary = 6
  delete item.theme.selectedListItemText

  const theme = resolveTheme(item, "dark")
  expect(theme.primary.intent).toBe("rgb")
  expect(theme.selectedListItemText).toBe(theme.background)
  expect(theme._hasSelectedListItemText).toBe(false)
})
