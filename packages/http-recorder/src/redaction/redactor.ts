import { Option, Schema } from "effect"
import type { RequestSnapshot, ResponseSnapshot } from "../http/model.js"
import type { RedactOptions } from "../options.js"

export type { RedactOptions } from "../options.js"
export const REDACTED = "[REDACTED]"

const DEFAULT_REDACT_HEADERS = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-amz-security-token",
  "x-goog-api-key",
]
const DEFAULT_REDACT_QUERY = [
  "access_token",
  "api-key",
  "api_key",
  "apikey",
  "code",
  "key",
  "signature",
  "sig",
  "token",
  "x-amz-credential",
  "x-amz-security-token",
  "x-amz-signature",
]
const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))
const redactionSet = (values: ReadonlyArray<string> | undefined, defaults: ReadonlyArray<string>) =>
  new Set([...defaults, ...(values ?? [])].map((value) => value.toLowerCase()))

export const redactUrl = (
  raw: string,
  query: ReadonlyArray<string> = DEFAULT_REDACT_QUERY,
  transform?: (url: string) => string,
) => {
  if (!URL.canParse(raw)) return transform?.(raw) ?? raw
  const url = new URL(raw)
  if (url.username) url.username = REDACTED
  if (url.password) url.password = REDACTED
  const redacted = redactionSet(query, DEFAULT_REDACT_QUERY)
  for (const key of url.searchParams.keys()) if (redacted.has(key.toLowerCase())) url.searchParams.set(key, REDACTED)
  return transform?.(url.toString()) ?? url.toString()
}

export const redactHeaders = (
  headers: Record<string, string>,
  allow: ReadonlyArray<string>,
  redact: ReadonlyArray<string> = DEFAULT_REDACT_HEADERS,
) => {
  const allowed = new Set(allow.map((name) => name.toLowerCase()))
  const redacted = redactionSet(redact, DEFAULT_REDACT_HEADERS)
  return Object.fromEntries(
    Object.entries(headers)
      .map(([name, value]) => [name.toLowerCase(), value] as const)
      .filter(([name]) => allowed.has(name))
      .map(([name, value]) => [name, redacted.has(name) ? REDACTED : value] as const)
      .toSorted(([a], [b]) => a.localeCompare(b)),
  )
}

const DEFAULT_REQUEST_HEADERS: ReadonlyArray<string> = ["content-type", "accept", "openai-beta"]
const DEFAULT_RESPONSE_HEADERS: ReadonlyArray<string> = ["content-type"]

export interface Redactor {
  readonly request: (snapshot: RequestSnapshot) => RequestSnapshot
  readonly response: (snapshot: ResponseSnapshot) => ResponseSnapshot
}

const DEFAULT_REDACT_JSON_FIELDS = [
  "access_token",
  "api_key",
  "apikey",
  "client_secret",
  "password",
  "refresh_token",
  "secret",
  "token",
]
const normalizeField = (field: string) => field.replace(/[^a-z0-9]/gi, "").toLowerCase()
interface RedactedJson {
  readonly value: unknown
  readonly changed: boolean
}
const redactJsonFields = (value: unknown, fields: ReadonlySet<string>): RedactedJson => {
  if (Array.isArray(value)) {
    const items = value.map((item) => redactJsonFields(item, fields))
    return { value: items.map((item) => item.value), changed: items.some((item) => item.changed) }
  }
  if (!value || typeof value !== "object") return { value, changed: false }
  let changed = false
  const entries = Object.entries(value).map(([key, child]) => {
    if (fields.has(normalizeField(key))) {
      if (child !== REDACTED) changed = true
      return [key, REDACTED] as const
    }
    const redacted = redactJsonFields(child, fields)
    if (redacted.changed) changed = true
    return [key, redacted.value] as const
  })
  return { value: Object.fromEntries(entries), changed }
}
const redactBody = (value: string, fields: ReadonlySet<string>, transform: ((body: string) => string) | undefined) => {
  const redacted = Option.match(decodeJson(value), {
    onNone: () => value,
    onSome: (parsed) => {
      const result = redactJsonFields(parsed, fields)
      return result.changed ? JSON.stringify(result.value) : value
    },
  })
  return transform?.(redacted) ?? redacted
}

export const make = (options: RedactOptions = {}): Redactor => {
  const fields = new Set([...DEFAULT_REDACT_JSON_FIELDS, ...(options.jsonFields ?? [])].map(normalizeField))
  const requestHeaders = [
    ...DEFAULT_REQUEST_HEADERS,
    ...(options.allowRequestHeaders ?? []),
    ...(options.headers ?? []),
  ]
  const responseHeaders = [
    ...DEFAULT_RESPONSE_HEADERS,
    ...(options.allowResponseHeaders ?? []),
    ...(options.headers ?? []),
  ]
  return {
    request: (snapshot) => ({
      ...snapshot,
      headers: redactHeaders(snapshot.headers, requestHeaders, options.headers),
      url: redactUrl(snapshot.url, options.queryParameters, options.url),
      body: redactBody(snapshot.body, fields, options.body),
    }),
    response: (snapshot) => ({
      ...snapshot,
      headers: redactHeaders(snapshot.headers, responseHeaders, options.headers),
      body: redactBody(snapshot.body, fields, options.body),
    }),
  }
}
