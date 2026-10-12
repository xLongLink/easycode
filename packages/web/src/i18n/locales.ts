export const docsLocale = [] as const

export type DocsLocale = (typeof docsLocale)[number]

export const locale = ["root"] as const

export type Locale = (typeof locale)[number]

export const localeAlias = { en: "root", root: "root" } as const satisfies Record<string, Locale>

function parse(input: string) {
  try {
    return decodeURIComponent(input).trim().toLowerCase()
  } catch {
    return null
  }
}

export function exactLocale(input: string) {
  const value = parse(input)
  if (value === "en" || value === "root") return "root" as const
  return null
}

export function matchLocale(input: string) {
  const value = parse(input)
  if (value === "root" || (value && /^en(?:-|$)/.test(value))) return "root" as const
  return null
}
