import { expect, test } from "bun:test"
import { ServerAuth } from "@opencode/server/auth"
import { Option, Redacted } from "effect"

test("accepts only the fixed opencode username", () => {
  const config = { password: Option.some("secret"), username: "opencode" }
  expect(ServerAuth.authorized({ username: "opencode", password: Redacted.make("secret") }, config)).toBe(true)
  expect(ServerAuth.authorized({ username: "custom", password: Redacted.make("secret") }, config)).toBe(false)
})

test("rejects incorrect passwords and missing credentials", () => {
  const config = { password: Option.some("secret"), username: "opencode" }
  expect(ServerAuth.authorized({ username: "opencode", password: Redacted.make("wrong") }, config)).toBe(false)
  expect(
    ServerAuth.authorized(
      { username: "opencode", password: Redacted.make("secret") },
      { ...config, password: Option.none() },
    ),
  ).toBe(false)
})
