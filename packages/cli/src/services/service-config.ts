import { Global } from "@opencode/util/global"
import { OPENCODE_VERSION } from "../version"
import { Service } from "@opencode/client/effect/service"
import { Effect, FileSystem, Option, Schema } from "effect"
import { randomBytes } from "crypto"
import path from "path"
import { selfCommand } from "../util/process"

// The CLI's service configuration file, plus the Service.EnsureOptions binding that
// points the client package's service operations at this CLI: which
// registration file, which version, and how to spawn opencode.

export const Info = Schema.Struct({
  disabled: Schema.optional(Schema.Boolean),
  hostname: Schema.optional(Schema.String),
  port: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(65_535))),
  password: Schema.optional(Schema.String),
  cors: Schema.optional(Schema.Array(Schema.String)),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})
export type Info = typeof Info.Type

const keys = ["disabled", "hostname", "port", "password", "cors", "env"] as const
type Key = (typeof keys)[number]

const decodeInfo = Schema.decodeUnknownEffect(Schema.fromJsonString(Info))

export function filename() {
  return "service.json"
}

export function defaultPort() {
  // Keep uncode's separate service registration from competing with older installations for their port.
  return 0xec0f
}

function configKey(key: string): Key {
  if (
    key === "disabled" ||
    key === "hostname" ||
    key === "port" ||
    key === "password" ||
    key === "cors" ||
    key === "env"
  )
    return key
  throw new Error(`Unknown service config key: ${key}`)
}

const paths = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const global = yield* Global.Service
  const name = filename()
  const file = path.join(global.state, name)
  return {
    fs,
    file,
    configFile: path.join(global.config, name),
  }
})

export const options = Effect.fnUntraced(function* (input: { readonly checkVersion?: boolean } = {}) {
  const { file } = yield* paths
  return {
    file,
    version: input.checkVersion ? OPENCODE_VERSION : undefined,
    env: (yield* read()).env,
    command: [
      ...selfCommand(),
      "serve",
      "--service",
    ],
  }
})

export const read = Effect.fn("cli.service-config.read")(function* () {
  const { fs, configFile } = yield* paths
  const text = yield* fs.readFileString(configFile).pipe(Effect.option)
  if (Option.isNone(text)) return {} as Info
  return yield* decodeInfo(text.value).pipe(Effect.orElseSucceed(() => ({} as Info)))
})

const write = Effect.fn("cli.service-config.write")(function* (value: Info) {
  const { fs, configFile } = yield* paths
  const temp = configFile + ".tmp"
  yield* fs.makeDirectory(path.dirname(configFile), { recursive: true })
  yield* fs.writeFileString(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 })
  yield* fs.rename(temp, configFile)
})

export const password = Effect.fn("cli.service-config.password")(function* (value?: string) {
  const existing = yield* read()
  if (value === undefined && existing.password) return existing.password
  const next = value ?? randomBytes(32).toString("base64url")

  // Keep one private credential across server restarts so discovered clients
  // can reconnect without exposing a password flag or environment variable.
  yield* write({ ...existing, password: next })
  return next
})

export const get = Effect.fn("cli.service-config.get")(function* (key?: string, name?: string) {
  if (key === undefined) {
    const { password: _password, ...safe } = yield* read()
    return JSON.stringify(safe, null, 2)
  }
  const selected = configKey(key)
  if (selected !== "env" && name !== undefined) throw new Error(`Usage: uncode service get ${selected}`)
  switch (selected) {
    case "disabled": {
      return String((yield* read()).disabled ?? false)
    }
    case "hostname": {
      return (yield* read()).hostname ?? ""
    }
    case "port": {
      const port = (yield* read()).port
      return port === undefined ? "" : String(port)
    }
    case "password": {
      return yield* password()
    }
    case "cors": {
      return JSON.stringify((yield* read()).cors ?? [], null, 2)
    }
    case "env": {
      const env = (yield* read()).env ?? {}
      return name === undefined ? JSON.stringify(env, null, 2) : (env[name] ?? "")
    }
  }
  throw new Error(`Unknown service config key: ${key}`)
})

export const set = Effect.fn("cli.service-config.set")(function* (key: string, value: string, nestedValue?: string) {
  const selected = configKey(key)
  if (selected !== "env" && nestedValue !== undefined)
    throw new Error(`Usage: uncode service set ${selected} <value>`)
  switch (selected) {
    case "disabled": {
      if (value !== "true" && value !== "false") throw new Error("Disabled must be true or false")
      if (value === "true") yield* Service.stop(yield* options())
      yield* write({ ...(yield* read()), disabled: value === "true" })
      return
    }
    case "hostname": {
      yield* Service.stop(yield* options())
      yield* write({ ...(yield* read()), hostname: value })
      return
    }
    case "port": {
      const port = Number(value)
      if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Port must be between 1 and 65535")
      yield* Service.stop(yield* options())
      yield* write({ ...(yield* read()), port })
      return
    }
    case "password": {
      yield* Service.stop(yield* options())
      yield* password(value)
      return
    }
    case "env": {
      if (nestedValue === undefined) throw new Error("Usage: uncode service set env <key> <value>")
      yield* Service.stop(yield* options())
      const existing = yield* read()
      yield* write({ ...existing, env: { ...existing.env, [value]: nestedValue } })
      return
    }
    case "cors": {
      const cors = value.split(",").map((origin) => origin.trim())
      if (
        cors.some((origin) => {
          const url = URL.parse(origin)
          return !url || (url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== origin
        })
      )
        throw new Error("CORS must be a comma-separated list of HTTP(S) origins without paths or trailing slashes")
      yield* Service.stop(yield* options())
      yield* write({ ...(yield* read()), cors })
      return
    }
  }
})

export const unset = Effect.fn("cli.service-config.unset")(function* (key: string, name?: string) {
  const selected = configKey(key)
  if (selected !== "env" && name !== undefined) throw new Error(`Usage: uncode service unset ${selected}`)
  switch (selected) {
    case "disabled": {
      const { disabled: _disabled, ...next } = yield* read()
      yield* write(next)
      return
    }
    case "hostname": {
      yield* Service.stop(yield* options())
      const { hostname: _hostname, ...next } = yield* read()
      yield* write(next)
      return
    }
    case "port": {
      yield* Service.stop(yield* options())
      const { port: _port, ...next } = yield* read()
      yield* write(next)
      return
    }
    case "password": {
      yield* Service.stop(yield* options())
      const { password: _password, ...next } = yield* read()
      yield* write(next)
      return
    }
    case "env": {
      if (name === undefined) throw new Error("Usage: uncode service unset env <key>")
      yield* Service.stop(yield* options())
      const existing = yield* read()
      const { [name]: _removed, ...env } = existing.env ?? {}
      const { env: _existingEnv, ...rest } = existing
      yield* write(Object.keys(env).length === 0 ? rest : { ...rest, env })
      return
    }
    case "cors": {
      yield* Service.stop(yield* options())
      const { cors: _cors, ...next } = yield* read()
      yield* write(next)
      return
    }
  }
})

export * as ServiceConfig from "./service-config"
