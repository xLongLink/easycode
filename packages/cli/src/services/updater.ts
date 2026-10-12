import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { EffectFlock } from "@opencode/util/effect-flock"
import { OPENCODE_LOCAL, OPENCODE_VERSION } from "../version"
import { Context, Duration, Effect, FileSystem, Layer, Option, Ref, Schema } from "effect"
import { ChildProcess } from "effect/process"
import { parse, type ParseError } from "jsonc-parser"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"
import { action, parseReleaseVersion, type Policy } from "./updater-action"
import { errorMessage } from "../util/error"

export const methods = ["curl", "npm", "pnpm", "bun", "yarn", "vp", "brew"] as const

export type Method = (typeof methods)[number]
export type RunResult = { readonly type: "available" | "installed"; readonly version: string }
export type CheckResult = RunResult | { readonly type: "unavailable"; readonly message: string }

export class UpgradeError extends Error {
  readonly title: string
  readonly detail: string
  readonly command?: string
  readonly retry: string

  constructor(
    input: {
      readonly title: string
      readonly detail: string
      readonly command?: string
      readonly retry: string
    },
    options?: ErrorOptions,
  ) {
    super(input.detail, options)
    this.name = "UpgradeError"
    this.title = input.title
    this.detail = input.detail
    this.command = input.command
    this.retry = input.retry
  }
}

const installNames: Record<Method, string> = {
  curl: "The easycode installer",
  npm: "npm",
  pnpm: "pnpm",
  bun: "Bun",
  yarn: "Yarn",
  vp: "Vite+",
  brew: "Homebrew",
}

function conciseDetail(input: string) {
  const lines = stripVTControlCharacters(input)
    .trim()
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
  const tail = lines.slice(-12).join("\n")
  const clipped = tail.length > 2_000
  const detail = clipped ? `…${tail.slice(-1_999)}` : tail
  if (!detail) return
  if (lines.length <= 12 && !clipped) return detail
  return `${detail}\n\nOutput shortened to the last 12 lines.`
}

function errorDetail(cause: unknown): string {
  if (cause instanceof AppProcess.AppProcessError) {
    const stderr = conciseDetail(cause.stderr ?? "")
    if (stderr) return stderr
    if (cause.cause !== undefined) return errorDetail(cause.cause)
    return cause.message
  }
  if (cause instanceof Error) {
    const detail = cause.cause === undefined ? undefined : errorDetail(cause.cause)
    if (!detail || detail === cause.message) return cause.message
    return `${cause.message}: ${detail}`
  }
  return errorMessage(cause)
}

function resultDetail(result: { code: number; stdout: string; stderr: string }) {
  return (
    conciseDetail(result.stderr) ??
    conciseDetail(result.stdout) ??
    `The command exited with code ${result.code} without any error output.`
  )
}

export interface Interface {
  readonly run: (onInstall?: (version: string) => void) => Effect.Effect<RunResult | undefined>
  readonly check: () => Effect.Effect<CheckResult | undefined, Error>
  readonly apply: (version: string) => Effect.Effect<void, Error>
  readonly method: () => Effect.Effect<Method | undefined>
  readonly latest: (method?: Method) => Effect.Effect<string, Error>
  readonly upgrade: (method: Method, version: string) => Effect.Effect<void, Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/cli/Updater") {}

export function decodePolicy(text: string): Policy | undefined {
  // The CLI only projects this host-level preference instead of initializing
  // the location-scoped server configuration graph.
  const errors: ParseError[] = []
  const input: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || typeof input !== "object" || input === null) return
  if ("update" in input) {
    const value = input.update
    if (value === "disable" || value === "notify" || value === "auto") return value
    return
  }
  if (!("autoupdate" in input)) return
  if (input.autoupdate === false) return "disable"
  if (input.autoupdate === "notify") return "notify"
  if (input.autoupdate === true) return "auto"
}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const global = yield* Global.Service
  const appProcess = yield* AppProcess.Service
  const flock = yield* EffectFlock.Service
  const installedVersion = yield* Ref.make(OPENCODE_VERSION)
  const executable = yield* fs.realPath(process.execPath).pipe(Effect.orElseSucceed(() => process.execPath))

  const readPolicy = Effect.fnUntraced(function* () {
    const values = yield* Effect.forEach(["config.json", "opencode.json", "opencode.jsonc"], (name) =>
      fs.readFileString(path.join(global.config, name)).pipe(
        Effect.map(decodePolicy),
        Effect.orElseSucceed(() => undefined),
      ),
    )
    return values.findLast((value) => value !== undefined) ?? "notify"
  })

  const exec = Effect.fnUntraced(function* (command: string[], timeout: Duration.Input = "30 seconds") {
    return yield* appProcess
      .run(ChildProcess.make(command[0], command.slice(1)), {
        timeout,
        maxOutputBytes: 100_000,
        maxErrorBytes: 100_000,
      })
      .pipe(
        Effect.map((result) => ({
          code: result.exitCode,
          stdout: result.stdout.toString("utf8"),
          stderr: result.stderr.toString("utf8"),
        })),
      )
  })

  const curlPath = path.resolve(global.home, ".easycode", "bin", "easycode")
  const curlBinary = yield* fs.realPath(curlPath).pipe(Effect.orElseSucceed(() => curlPath))

  const method = Effect.fnUntraced(function* () {
    if (path.basename(executable) === "easycode") return "curl"
    if (executable === curlBinary) return "curl"
  })

  const release = Effect.fnUntraced(function* (method?: Method) {
    if (method && method !== "curl")
      return yield* Effect.fail(
        new Error("easycode releases are installed with the easycode installer, not a package manager."),
      )
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch("https://api.github.com/repos/xLongLink/easycode/releases/latest", {
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        }),
      catch: (cause) =>
        new UpgradeError(
          {
            title: "Could not check for easycode updates",
            detail: errorDetail(cause),
            retry: "Check your network, then run easycode upgrade again.",
          },
          { cause },
        ),
    })
    if (!response.ok)
      return yield* Effect.fail(
        new UpgradeError({
          title: "Could not check for easycode updates",
          detail: `The update service returned HTTP ${response.status}.`,
          retry: "Try again in a few minutes.",
        }),
      )
    const data: unknown = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) =>
        new UpgradeError(
          {
            title: "Could not read the easycode update information",
            detail: errorDetail(cause),
            retry: "Try again in a few minutes.",
          },
          { cause },
        ),
    })
    const decoded = Schema.decodeUnknownOption(Schema.Struct({ tag_name: Schema.String }))(data)
    const version = Option.getOrUndefined(decoded)?.tag_name.replace(/^v/, "")
    if (!version || !parseReleaseVersion(version))
      return yield* Effect.fail(
        new UpgradeError({
          title: "Could not read the easycode update information",
          detail: "The update service returned incomplete release information.",
          retry: "Try again in a few minutes.",
        }),
      )
    return version
  })

  const latest = (selected?: Method) => (selected ? Effect.succeed(selected) : method()).pipe(Effect.flatMap(release))

  const temporaryDirectory = (prefix: string) =>
    Effect.acquireRelease(fs.makeTempDirectory({ directory: global.cache, prefix }), (directory) =>
      fs.remove(directory, { recursive: true, force: true }).pipe(Effect.ignore),
    )

  const runUpgrade = (input: {
    readonly method: Method
    readonly command: string[]
    readonly displayCommand?: string[]
    readonly title?: string
    readonly retry?: string
  }) => {
    const failure = (detail: string, cause?: unknown) =>
      new UpgradeError(
        {
          title: input.title ?? `${installNames[input.method]} could not install easycode`,
          detail,
          command: (input.displayCommand ?? input.command).join(" "),
          retry: input.retry ?? "Fix the issue above, then run easycode upgrade again.",
        },
        cause === undefined ? undefined : { cause },
      )
    return exec(input.command, "5 minutes").pipe(
      Effect.flatMap((result) =>
        result.code === 0 ? Effect.succeed(result) : Effect.fail(failure(resultDetail(result))),
      ),
      Effect.mapError((cause) =>
        cause instanceof UpgradeError
          ? cause
          : failure(
              cause instanceof AppProcess.AppProcessError && cause.stderr === undefined && cause.cause === undefined
                ? `Failed to update with ${input.method}`
                : errorDetail(cause),
              cause,
            ),
      ),
    )
  }

  const upgrade = Effect.fnUntraced(function* (method: Method, input: string) {
    if (method !== "curl")
      return yield* Effect.fail(
        new Error("easycode releases are installed with the easycode installer. Use --method curl."),
      )
    if (!parseReleaseVersion(input)) return yield* Effect.fail(new Error(`Invalid version: ${input}`))
    const version = input.trim().replace(/^v/, "")
    yield* Effect.scoped(
      Effect.gen(function* () {
        // Other easycode processes may be installing at the same time. Wait longer than the
        // slowest install (curl runs two 5-minute commands).
        yield* flock.acquire("cli-upgrade", undefined, { timeoutMs: Duration.toMillis("15 minutes") })
        yield* fs.makeDirectory(global.cache, { recursive: true })
        const directory = yield* temporaryDirectory("update-")
        const installer = path.join(directory, "install")
        yield* runUpgrade({
          method,
          command: [
            "curl",
            "-fsSL",
            "-o",
            installer,
            `https://github.com/xLongLink/easycode/releases/download/v${version}/install`,
          ],
          displayCommand: [
            "curl",
            "-fsSL",
            `https://github.com/xLongLink/easycode/releases/download/v${version}/install`,
          ],
          title: "Could not download the easycode installer",
          retry: "Check your network, then run easycode upgrade again.",
        })
        return yield* runUpgrade({
          method,
          command: [
            "bash",
            installer,
            "--version",
            version,
            "--install-dir",
            path.dirname(executable),
            "--no-modify-path",
          ],
          displayCommand: ["easycode", "upgrade", version, "--method", "curl"],
          title: "The easycode installer failed",
        })
      }),
    ).pipe(
      Effect.mapError((cause) =>
        cause instanceof UpgradeError
          ? cause
          : new UpgradeError(
              {
                title: "Could not prepare the easycode upgrade",
                detail: errorDetail(cause),
                retry: "Fix the issue above, then run easycode upgrade again.",
              },
              { cause },
            ),
      ),
      Effect.asVoid,
    )
  })

  const inspect = Effect.fnUntraced(function* () {
    if (OPENCODE_LOCAL || ["1", "true"].includes(process.env.OPENCODE_DISABLE_AUTOUPDATE?.toLowerCase() ?? "")) {
      yield* Effect.logInfo("update check skipped", {
        reason: OPENCODE_LOCAL ? "local-install" : "disabled",
        version: OPENCODE_VERSION,
      })
      return undefined
    }
    const policy = yield* readPolicy()
    if (policy === "disable") {
      yield* Effect.logInfo("update check skipped", { reason: "policy-disabled" })
      return undefined
    }

    const current = yield* Ref.get(installedVersion)
    const version = yield* latest()
    yield* Effect.logInfo("update check", {
      current,
      latest: version,
    })
    const next = action(current, version, policy)
    if (next === "none") {
      yield* Effect.logInfo("update check done", { action: "up-to-date" })
      return undefined
    }
    yield* Effect.logInfo("easycode update available", { current, latest: version, action: next })
    return { policy, version }
  })

  const install = Effect.fnUntraced(function* (version: string) {
    const detected = yield* method()
    if (!detected) {
      yield* Effect.logWarning("update skipped: installation method not found")
      return false
    }
    const current = yield* Ref.get(installedVersion)
    yield* upgrade(detected, version)
    yield* Ref.set(installedVersion, version)
    yield* Effect.logInfo("updated easycode", { from: current, to: version, method: detected })
    return true
  })

  const apply = Effect.fn("cli.updater.apply")(function* (version: string) {
    if (!(yield* install(version)))
      return yield* Effect.fail(
        new Error(
          "Could not detect the installation method. Update with your package manager or download the latest release.",
        ),
      )
  })

  const check = Effect.fn("cli.updater.check")(function* () {
    if (OPENCODE_LOCAL)
      return {
        type: "unavailable" as const,
        message: "This build runs from a source checkout. Use an installed easycode release to check for updates.",
      }
    const detected = yield* method()
    if (!detected)
      return {
        type: "unavailable" as const,
        message:
          "Could not detect the installation method. Update with your package manager or download the latest release.",
      }
    const version = yield* latest(detected)
    if (!parseReleaseVersion(version)) return yield* Effect.fail(new Error(`Invalid version: ${version}`))
    const current = yield* Ref.get(installedVersion)
    if (action(current, version, "auto") === "none") {
      // An earlier check may have installed the update while this client is still running.
      return action(OPENCODE_VERSION, current, "auto") === "none"
        ? undefined
        : { type: "installed" as const, version: current }
    }
    return { type: "available" as const, version }
  })

  const run = Effect.fn("cli.updater.run")(
    function* (onInstall: (version: string) => void = () => {}) {
      const result = yield* inspect()
      if (!result) return undefined
      if (result.policy === "notify") return { type: "available" as const, version: result.version }
      onInstall(result.version)
      if (!(yield* install(result.version))) return yield* Effect.fail(new Error("Installation method not found"))
      return { type: "installed" as const, version: result.version }
    },
    Effect.catch((error) => Effect.logWarning("update check failed", { error }).pipe(Effect.as(undefined))),
  )

  return Service.of({ run, check, apply, method, latest, upgrade })
})

export const layer = Layer.effect(Service, make)

export * as Updater from "./updater"
export { action, type Action, type Policy } from "./updater-action"
