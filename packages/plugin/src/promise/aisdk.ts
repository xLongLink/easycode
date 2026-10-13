import type { HookPayload } from "../hooks.js"
import type { ModelHooks } from "./registration.js"

export interface AISDKHooks extends HookPayload.AISDKHooks {}

export interface AISDKDomain {
  readonly hook: ModelHooks<AISDKHooks>
}
