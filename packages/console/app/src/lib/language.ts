export const LOCALES = ["en"] as const

export type Locale = (typeof LOCALES)[number]

export const LOCALE_COOKIE = "oc_locale" as const
export const LOCALE_HEADER = "x-opencode-locale" as const

function fix(pathname: string) {
  if (pathname.startsWith("/")) return pathname
  return `/${pathname}`
}

const LABEL = {
  en: "English",
} satisfies Record<Locale, string>

const TAG = {
  en: "en",
} satisfies Record<Locale, string>

const DOCS_LOCALE = { en: "en", root: "en" } as const satisfies Record<string, Locale>

export function goUsageLimits(locale: Locale) {
  return docs(locale, "/docs/go/#usage-limits")
}

function suffix(pathname: string) {
  const index = pathname.search(/[?#]/)
  if (index === -1) {
    return {
      path: fix(pathname),
      suffix: "",
    }
  }

  return {
    path: fix(pathname.slice(0, index)),
    suffix: pathname.slice(index),
  }
}

export function docs(_locale: Locale, pathname: string) {
  const next = suffix(pathname)
  if (next.path !== "/docs" && next.path !== "/docs/" && !next.path.startsWith("/docs/")) {
    return `${next.path}${next.suffix}`
  }

  if (next.path === "/docs/en") return `/docs${next.suffix}`
  if (next.path === "/docs/en/") return `/docs/${next.suffix}`
  if (next.path.startsWith("/docs/en/")) return `/docs/${next.path.slice("/docs/en/".length)}${next.suffix}`
  return `${next.path}${next.suffix}`
}

export function parseLocale(value: unknown): Locale | null {
  return value === "en" ? "en" : null
}

export function fromPathname(pathname: string) {
  return parseLocale(fix(pathname).split("/")[1])
}

export function fromDocsPathname(pathname: string) {
  const next = fix(pathname)
  const value = next.split("/")[2]?.toLowerCase()
  if (!value) return null
  if (!next.startsWith("/docs/")) return null
  if (!(value in DOCS_LOCALE)) return null
  return DOCS_LOCALE[value as keyof typeof DOCS_LOCALE]
}

export function strip(pathname: string) {
  const locale = fromPathname(pathname)
  if (!locale) return fix(pathname)

  const next = fix(pathname).slice(locale.length + 1)
  if (!next) return "/"
  if (next.startsWith("/")) return next
  return `/${next}`
}

export function route(locale: Locale, pathname: string) {
  const next = strip(pathname)
  if (next.startsWith("/docs")) return docs(locale, next)
  return next
}

export function label(locale: Locale) {
  return LABEL[locale]
}

export function tag(locale: Locale) {
  return TAG[locale]
}

export function dir(_locale: Locale) {
  return "ltr"
}

export function detectFromLanguages(_languages: readonly string[]) {
  return "en" satisfies Locale
}

export function detectFromAcceptLanguage(_header: string | null) {
  return "en" satisfies Locale
}

export function localeFromCookieHeader(header: string | null) {
  if (!header) return null

  const raw = header
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(`${LOCALE_COOKIE}=`.length)

  if (!raw) return null
  return parseLocale(decodeURIComponent(raw))
}

export function localeFromRequest(request: Request) {
  const fromHeader = parseLocale(request.headers.get(LOCALE_HEADER))
  if (fromHeader) return fromHeader

  const fromPath = fromPathname(new URL(request.url).pathname)
  if (fromPath) return fromPath

  const fromDocsPath = fromDocsPathname(new URL(request.url).pathname)
  if (fromDocsPath) return fromDocsPath

  return (
    localeFromCookieHeader(request.headers.get("cookie")) ??
    detectFromAcceptLanguage(request.headers.get("accept-language"))
  )
}

export function cookie(locale: Locale) {
  return `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

export function clearCookie() {
  return `${LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}
