import type { PermissionApi } from "@opencode/client/effect/api"
import type { HookPayload } from "../hooks.js"
import type { Hooks } from "./registration.js"

export interface PermissionEvaluation extends HookPayload.PermissionEvaluation {}

export interface PermissionHooks extends HookPayload.PermissionHooks {
  readonly evaluate: PermissionEvaluation
}

export type PermissionDomain = Pick<PermissionApi<unknown>, "list" | "get" | "reply"> & {
  readonly hook: Hooks<PermissionHooks>
}
