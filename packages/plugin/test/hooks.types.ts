import { Effect } from "effect"
import type { SessionDomain } from "@opencode/plugin/effect/session"
import type { SessionHooks } from "@opencode/plugin/promise/session"
import type { ShellDomain } from "@opencode/plugin/effect/shell"
import type { ShellHooks } from "@opencode/plugin/promise/shell"
import type { PermissionDomain } from "@opencode/plugin/effect/permission"
import type { PermissionHooks } from "@opencode/plugin/promise/permission"
import type { AISDKDomain } from "@opencode/plugin/effect/aisdk"
import type { AISDKHooks } from "@opencode/plugin/promise/aisdk"

// Augmentation belongs to one public flavor, including its nested payload references.
declare module "@opencode/plugin/effect/session" {
  interface SessionPrompt {
    effectPrompt: string
  }
  interface SessionRequest {
    effectRequest: string
  }
  interface SessionContext {
    effectContext: string
  }
  interface SessionCompactionResult {
    effectSummary: string
  }
  interface SessionModelRequest {
    effectModelRequest: string
  }
  interface SessionHttpRequest {
    effectHttpRequest: string
  }
  interface SessionHttpResponse {
    effectHttpResponse: string
  }
  interface SessionWebSocketHandshake {
    effectHandshake: string
  }
  interface SessionWebSocketSend {
    effectSend: string
  }
  interface SessionWebSocketReceive {
    effectReceive: string
  }
  interface SessionRetry {
    effectRetry: string
  }
}

declare module "@opencode/plugin/effect/shell" {
  interface ShellCreateBefore {
    effectShell: string
  }
}

declare module "@opencode/plugin/effect/permission" {
  interface PermissionEvaluation {
    effectPermission: string
  }
}

declare module "@opencode/plugin/effect/aisdk" {
  interface AISDKHooks {
    effectSDK: { value: string }
  }
}

declare const session: SessionDomain
declare const shell: ShellDomain
declare const permission: PermissionDomain
declare const aisdk: AISDKDomain
declare const promiseSession: SessionHooks
declare const promiseShell: ShellHooks
declare const promisePermission: PermissionHooks
declare const promiseAISDK: AISDKHooks

session.hook("prompt", (event) => {
  event.effectPrompt = "local"
  event.delivery = "queue"
  event.prompt.text = "mutable prompt"
  event.prompt.files = []
  event.prompt.files.push({ uri: "file:///example" })
  // @ts-expect-error Prompt identity remains readonly.
  event.messageID = event.messageID
  return Effect.void
})

session.hook("context", (event) => {
  event.effectRequest = "inherited request"
  event.effectContext = "local context"
  event.options.temperature = 0.5
  event.messages.push(...event.messages)
  // @ts-expect-error Session identity remains readonly.
  event.sessionID = event.sessionID
  return Effect.void
})

session.hook("compaction", (event) => {
  event.effectRequest = "inherited request"
  event.effectContext = "inherited context"
  event.result = { summary: "local result", effectSummary: "augmentation" }
  event.result.effectSummary = "updated"
  return Effect.void
})

session.hook("generate", (event) => {
  event.effectRequest = "inherited request"
  event.effectContext = "inherited context"
  return Effect.void
})

session.hook("title", (event) => {
  event.effectRequest = "inherited request"
  event.result = "mutable title"
  return Effect.void
})

session.hook("model.request", (event) => {
  event.effectModelRequest = "local"
  return Effect.void
})
session.hook("http.request", (event) => {
  event.effectHttpRequest = "local"
  return Effect.void
})
session.hook("http.response", (event) => {
  event.effectHttpResponse = "local"
  return Effect.void
})
session.hook("experimental.ws.handshake", (event) => {
  event.effectHandshake = "local"
  return Effect.void
})
session.hook("experimental.ws.send", (event) => {
  event.effectSend = "local"
  return Effect.void
})
session.hook("experimental.ws.receive", (event) => {
  event.effectReceive = "local"
  return Effect.void
})
session.hook("retry", (event) => {
  event.effectRetry = "local"
  return Effect.void
})

shell.hook("create.before", (event) => {
  event.effectShell = "local"
  event.command = "mutable"
  event.env.PATH = undefined
  return Effect.void
})

permission.hook("evaluate", (event) => {
  event.effectPermission = "local"
  event.effect = "allow"
  event.message = "mutable"
  // @ts-expect-error Permission resources remain readonly.
  event.resources.push("changed")
  return Effect.void
})

aisdk.hook("effectSDK", (event) => {
  event.value = "local"
  return Effect.void
})
aisdk.hook("sdk", (event) => {
  event.sdk = { arbitrarySDKShape: true }
  // @ts-expect-error SDK options binding remains readonly.
  event.options = {}
  return Effect.void
})

// @ts-expect-error Effect prompt augmentation must not leak to Promise.
promiseSession.prompt.effectPrompt
// @ts-expect-error Effect request augmentation must not leak to Promise context.
promiseSession.context.effectRequest
// @ts-expect-error Effect context augmentation must not leak to Promise compaction.
promiseSession.compaction.effectContext
// @ts-expect-error Effect request augmentation must not leak to Promise title.
promiseSession.title.effectRequest
// @ts-expect-error Effect context augmentation must not leak to Promise generate.
promiseSession.generate.effectContext
// @ts-expect-error Effect result augmentation must not leak to Promise compaction results.
promiseSession.compaction.result?.effectSummary
// @ts-expect-error Effect shell augmentation must not leak to Promise.
promiseShell["create.before"].effectShell
// @ts-expect-error Effect permission augmentation must not leak to Promise.
promisePermission.evaluate.effectPermission
// @ts-expect-error Effect AISDK hook augmentation must not leak to Promise.
promiseAISDK.effectSDK

promiseSession.context.options.temperature = 0.5
promiseShell["create.before"].command = "mutable"
promisePermission.evaluate.effect = "allow"
promiseAISDK.sdk.sdk = { arbitrarySDKShape: true }
// @ts-expect-error Promise Session identity remains readonly.
promiseSession.context.sessionID = promiseSession.context.sessionID
// @ts-expect-error Promise permission resources remain readonly.
promisePermission.evaluate.resources.push("changed")
