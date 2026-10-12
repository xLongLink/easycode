export * as ShellSelect from "./select.js"

import path from "path"
import { readFile } from "fs/promises"
import { statSync } from "fs"
import { Context, Effect, Layer } from "effect"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Global } from "@opencode/util/global"
import { State } from "../state.js"
import { which } from "../util/which.js"

const META: Record<string, { deny?: boolean; login?: boolean; ps?: boolean }> = {
  bash: { login: true },
  dash: { login: true },
  fish: { deny: true, login: true },
  ksh: { login: true },
  nu: { deny: true },
  powershell: { ps: true },
  pwsh: { ps: true },
  sh: { login: true },
  zsh: { login: true },
}

export type Item = {
  path: string
  name: string
  acceptable: boolean
}

type Data = {
  shell?: string
}

export type Editor = {
  configure: (shell: string) => void
}

export type ResolveInput = {
  priority: "config" | "compat"
}

export interface Interface extends State.Transformable<Editor> {
  readonly resolve: (input: ResolveInput) => Effect.Effect<string>
  readonly list?: () => Effect.Effect<Item[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ShellSelect") {}

function stat(file: string) {
  return statSync(file, { throwIfNoEntry: false }) ?? undefined
}

function findExecutable(name: string, bin?: string) {
  return which(name, undefined, bin)
}

function meta(file: string) {
  return META[name(file)]
}

function compatible(file: string) {
  return meta(file)?.deny !== true
}

function rooted(file: string) {
  return path.isAbsolute(file)
}

function executable(file: string, bin?: string) {
  if (rooted(file)) {
    if (stat(file)?.isFile()) return file
    return
  }
  return findExecutable(file, bin) ?? undefined
}

async function unix() {
  const text = await readFile("/etc/shells", "utf8").catch(() => "")
  if (text) return Array.from(new Set(text.split("\n").filter((line) => line.trim() && !line.startsWith("#"))))
  return ["/bin/bash", "/bin/zsh", "/bin/sh"]
}

function select(file: string | undefined, opts?: { compatible?: boolean }, bin?: string) {
  if (file && (!opts?.compatible || compatible(file))) {
    const shell = executable(file, bin)
    if (shell) return shell
  }
  return fallback(bin)
}

function fallback(bin?: string) {
  if (process.platform === "darwin") return "/bin/zsh"
  const bash = findExecutable("bash", bin)
  if (bash) return bash
  return "/bin/sh"
}

export function name(file: string) {
  return path.basename(file).toLowerCase()
}

export function login(file: string) {
  return meta(file)?.login === true
}

export function ps(file: string) {
  return meta(file)?.ps === true
}

function info(file: string, bin?: string): Item {
  const n = name(file)
  return {
    path: file,
    name: executable(n, bin) ? n : file,
    acceptable: compatible(file),
  }
}

export function args(file: string, command: string) {
  if (ps(file)) return ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command]
  return ["-c", command]
}

// Resolve afresh so removing a shell does not leave terminals using a stale cached path.
export function environment(bin?: string, filter?: { compatible?: boolean }) {
  return select(process.env.SHELL, filter, bin)
}

let defaultConfigured: { bin?: string; value: string } | undefined
let defaultCompatible: { bin?: string; value: string } | undefined

export function resolve(input: ResolveInput, configShell?: string, bin?: string) {
  const filter = input.priority === "compat" ? { compatible: true } : undefined
  if (configShell) return select(configShell, filter, bin)
  const cached = input.priority === "compat" ? defaultCompatible : defaultConfigured
  if (cached && cached.bin === bin) return cached.value
  const value = environment(bin, filter)
  if (input.priority === "compat") defaultCompatible = { bin, value }
  if (input.priority === "config") defaultConfigured = { bin, value }
  return value
}
resolve.reset = () => {
  defaultConfigured = undefined
  defaultCompatible = undefined
}

export async function list(bin?: string): Promise<Item[]> {
  return (await unix()).filter((shell) => executable(shell, bin)).map((shell) => info(shell, bin))
}

const layer = () =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const global = yield* Global.Service
      const state = State.create<Data, Editor>({
        name: "shell-select",
        initial: () => ({}),
        editor: (editor) => ({
          configure: (shell) => {
            editor.shell = shell
          },
        }),
      })
      return Service.of({
        transform: state.transform,
        reload: state.reload,
        resolve: (input) => Effect.sync(() => resolve(input, state.get().shell, global.bin)),
        list: () => Effect.promise(() => list(global.bin)),
      })
    }),
  )

export const node = makeLocationNode({ service: Service, layer: layer(), deps: [Global.node] })
