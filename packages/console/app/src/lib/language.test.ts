import { expect, test } from "bun:test"
import { detectFromLanguages, docs, localeFromRequest, parseLocale, route } from "./language"

test("uses English for previous locale preferences and browser languages", () => {
  expect(parseLocale("en")).toBe("en")
  expect(parseLocale("fr")).toBeNull()
  expect(detectFromLanguages(["ar", "zh-TW"])).toBe("en")
  expect(
    localeFromRequest(
      new Request("https://opencode.ai/", {
        headers: { cookie: "oc_locale=fr", "x-opencode-locale": "de", "accept-language": "ar,zh;q=0.8" },
      }),
    ),
  ).toBe("en")
})

test("keeps English page and documentation URLs unprefixed", () => {
  expect(route("en", "/en/brand")).toBe("/brand")
  expect(route("en", "/workspace/example")).toBe("/workspace/example")
  expect(docs("en", "/docs/en/config?example=true#settings")).toBe("/docs/config?example=true#settings")
})
