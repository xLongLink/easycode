import type { HookPayload } from "../hooks.js"
import type { Hooks } from "./registration.js"

export interface ShellCreateBefore extends HookPayload.ShellCreateBefore {}

export interface ShellHooks extends HookPayload.ShellHooks {
  readonly "create.before": ShellCreateBefore
}

export interface ShellDomain {
  readonly hook: Hooks<ShellHooks>
}
