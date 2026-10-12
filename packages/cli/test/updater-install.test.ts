import { NodeServices } from "@effect/platform-node"
import { EffectFlock } from "@opencode/util/effect-flock"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { expect } from "bun:test"
import { Effect, FileSystem, Layer, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import path from "node:path"
import { Updater } from "../src/services/updater"
import { testEffect } from "../../core/test/lib/effect"

const it = testEffect(NodeServices.layer)

function fixture(
  respond: (command: ChildProcess.StandardCommand) => Partial<AppProcess.RunResult> = () => ({}),
  binary = "easycode",
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "easycode-updater-" })
    const executable = path.join(root, "bin", binary)
    yield* fs.makeDirectory(path.dirname(executable), { recursive: true })
    yield* fs.writeFileString(executable, "binary")
    const global = Global.make({
      home: root,
      cache: path.join(root, "cache"),
      state: path.join(root, "state"),
    })
    const commands: string[][] = []
    const updater = yield* Updater.Service.pipe(
      Effect.provide(Updater.layer),
      Effect.provide(
        LayerNode.compile(EffectFlock.node, {
          replacements: [Global.node.replace(Layer.succeed(Global.Service, global))],
        }),
      ),
      Effect.provideService(Global.Service, global),
      Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        realPath: (input) => fs.realPath(input === process.execPath ? executable : input),
      }),
      Effect.provideService(
        AppProcess.Service,
        AppProcess.Service.of({
          ...spawner,
          run: (command) =>
            Effect.sync(() => {
              if (command._tag !== "StandardCommand") throw new Error("Unexpected piped install command")
              commands.push([command.command, ...command.args])
              return {
                command: command.command,
                exitCode: 0,
                stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0),
                stdoutTruncated: false,
                stderrTruncated: false,
                ...respond(command),
              }
            }),
          runStream: () => Stream.die("Unexpected streaming install command"),
        }),
      ),
    )
    return { updater, commands, global, fs, executable }
  })
}

it.live("detects an easycode binary installed in a custom directory", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    expect(yield* test.updater.method()).toBe("curl")
    expect(test.commands).toEqual([])
  }),
)

it.live("does not adopt an upstream opencode installation", () =>
  Effect.gen(function* () {
    const test = yield* fixture(() => ({}), "opencode")
    expect(yield* test.updater.method()).toBeUndefined()
    expect(test.commands).toEqual([])
  }),
)
;["success", "download", "install"].forEach((failure) => {
  it.live(`curl uses the matching easycode release installer and cleans up: ${failure}`, () =>
    Effect.gen(function* () {
      const test = yield* fixture((command) => ({
        exitCode: command.command === (failure === "download" ? "curl" : failure === "install" ? "bash" : "") ? 1 : 0,
        stderr: Buffer.from(`${failure} failed`),
      }))
      const result = yield* test.updater.upgrade("curl", "v0.0.0").pipe(Effect.flip, Effect.option)
      const installer = test.commands[0]?.[3]
      expect(installer).toStartWith(path.join(test.global.cache, "update-"))
      expect(test.commands).toEqual([
        ["curl", "-fsSL", "-o", installer, "https://github.com/xLongLink/easycode/releases/download/v0.0.0/install"],
        ...(failure === "download"
          ? []
          : [
              [
                "bash",
                installer,
                "--version",
                "0.0.0",
                "--install-dir",
                path.dirname(test.executable),
                "--no-modify-path",
              ],
            ]),
      ])
      expect(yield* test.fs.readDirectory(test.global.cache)).toEqual([])
      expect(result._tag).toBe(failure === "success" ? "None" : "Some")
      if (result._tag === "Some") expect(result.value.message).toBe(`${failure} failed`)
    }),
  )
})

it.live("rejects package managers without executing an upstream install", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    yield* Effect.forEach(
      Updater.methods.filter((method) => method !== "curl"),
      (method) =>
        Effect.gen(function* () {
          const error = yield* test.updater.upgrade(method, "0.0.0").pipe(Effect.flip)
          expect(error.message).toContain("easycode installer")
          const lookup = yield* test.updater.latest(method).pipe(Effect.flip)
          expect(lookup.message).toContain("easycode installer")
        }),
    )
    expect(test.commands).toEqual([])
    expect(yield* test.fs.exists(test.global.cache)).toBe(false)
  }),
)

it.live("invalid version targets never execute a command or create a cache", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    yield* Effect.forEach(
      ["", "latest", "2.3", "01.2.3", "vv2.3.4", "2.3.4; echo unsafe", "--global", "v2.3.4\n--force"],
      (version) =>
        Effect.gen(function* () {
          const error = yield* test.updater.upgrade("curl", version).pipe(Effect.flip)
          expect(error.message).toBe(`Invalid version: ${version}`)
        }),
    )
    expect(test.commands).toEqual([])
    expect(yield* test.fs.exists(test.global.cache)).toBe(false)
  }),
)
