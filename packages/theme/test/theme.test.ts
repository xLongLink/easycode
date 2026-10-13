import { expect, test } from "bun:test"
import { expandTheme, migrateV1, resolveThemeDocument, selectThemeMode } from "../src/tui/index.js"
import type { ModeDefinition } from "../src/tui/index.js"
import { expandTokens } from "../src/tui/expand.js"
import type { ThemeV1Json } from "../src/tui/v1.js"

const source: ThemeV1Json = await Bun.file(new URL("../../tui/src/theme/assets/opencode.json", import.meta.url)).json()
const document = migrateV1(source)

test.each(["light", "dark"] as const)("resolves %s themes without status tokens", (mode) => {
  const theme = resolveThemeDocument(document, mode)
  expect("status" in theme.text).toBeFalse()
  expect(theme.hue.accent[800]).toBeDefined()
  expect(theme.hue.interactive[800]).toBeDefined()
})

test("leaves missing token groups and states without a base untouched", () => {
  expect(expandTokens({})).toEqual({ text: undefined, background: undefined })
  const color = { $focused: "#abc" } as const
  const expanded = expandTokens({
    text: { formfield: color, action: { primary: color } },
    background: { formfield: color, action: { secondary: color } },
  })

  expect(expanded.text?.formfield).toBe(color)
  expect(expanded.text?.action?.primary).toBe(color)
  expect(expanded.text?.action?.secondary).toBeUndefined()
  expect(expanded.background?.formfield).toBe(color)
  expect(expanded.background?.action?.secondary).toBe(color)
  expect(expandTokens({ text: {}, background: {} }).text?.action).toBeUndefined()
  expect(expandTokens({ text: {}, background: {} }).background?.formfield).toBeUndefined()
})

test.each(["text", "background"] as const)("expands %s states without mutating overrides", (group) => {
  const tokens = {
    formfield: { base: "#123", $disabled: "#456" },
    action: {
      primary: { base: "#789", $focused: "#abc" },
      secondary: { base: "#def" },
      destructive: { base: "transparent" },
    },
  } as const
  const expanded = expandTokens({ [group]: tokens })[group]

  expect(expanded?.formfield).toEqual({
    base: "#123",
    $disabled: "#456",
    $pressed: `$${group}.formfield.base`,
    $focused: `$${group}.formfield.base`,
    $selected: `$${group}.formfield.base`,
    $hovered: `$${group}.formfield.base`,
  })
  expect(expanded?.action?.primary).toEqual({
    base: "#789",
    $disabled: `$${group}.action.primary.base`,
    $pressed: `$${group}.action.primary.base`,
    $focused: "#abc",
    $selected: `$${group}.action.primary.base`,
    $hovered: `$${group}.action.primary.base`,
  })
  expect(expanded?.action).toMatchObject({
    secondary: { $hovered: `$${group}.action.secondary.base` },
    destructive: { $hovered: `$${group}.action.destructive.base` },
  })
  expect(tokens.formfield).toEqual({ base: "#123", $disabled: "#456" })
  expect(tokens.action.primary).toEqual({ base: "#789", $focused: "#abc" })
})

test("expands dialog tokens with their own bases and overrides", () => {
  const theme: ModeDefinition = {
    ...selectThemeMode(document, "light").theme,
    "@dialog": {
      text: { action: { primary: { base: "#123", $hovered: "#456" } } },
      background: { formfield: { base: "transparent" } },
    },
  }
  const expanded = expandTheme(theme)

  expect(expanded["@dialog"]?.text?.action?.primary).toEqual({
    base: "#123",
    $disabled: "$text.action.primary.base",
    $pressed: "$text.action.primary.base",
    $focused: "$text.action.primary.base",
    $selected: "$text.action.primary.base",
    $hovered: "#456",
  })
  expect(expanded["@dialog"]?.background?.formfield).toEqual({
    base: "transparent",
    $disabled: "$background.formfield.base",
    $pressed: "$background.formfield.base",
    $focused: "$background.formfield.base",
    $selected: "$background.formfield.base",
    $hovered: "$background.formfield.base",
  })
  expect(theme["@dialog"]?.text?.action?.primary).toEqual({ base: "#123", $hovered: "#456" })
})
