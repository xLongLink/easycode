import type { SessionApi } from "@opencode/client/promise/api"
import type { HookPayload } from "../hooks.js"
import type { ModelHooks } from "./registration.js"

export type { SessionRequestOptions, SessionRequestKind, SessionRetryDecision } from "../hooks.js"

export interface SessionPrompt extends HookPayload.SessionPrompt {}

export interface SessionRequest extends HookPayload.SessionRequest {}

export interface SessionContext extends HookPayload.SessionContext, SessionRequest {}

export interface SessionCompactionResult extends HookPayload.SessionCompactionResult {}

export interface SessionCompaction extends HookPayload.SessionCompaction, SessionContext {
  result?: SessionCompactionResult
}

export interface SessionGenerate extends HookPayload.SessionGenerate, SessionContext {}

export interface SessionTitle extends HookPayload.SessionTitle, SessionRequest {}

export interface SessionModelRequest extends HookPayload.SessionModelRequest {}

export interface SessionHttpRequest extends HookPayload.SessionHttpRequest {}

export interface SessionHttpResponse extends HookPayload.SessionHttpResponse {}

export interface SessionWebSocketHandshake extends HookPayload.SessionWebSocketHandshake {}

export interface SessionWebSocketSend extends HookPayload.SessionWebSocketSend {}

export interface SessionWebSocketReceive extends HookPayload.SessionWebSocketReceive {}

export interface SessionRetry extends HookPayload.SessionRetry {}

export interface SessionHooks extends HookPayload.SessionHooks {
  readonly prompt: SessionPrompt
  readonly context: SessionContext
  readonly compaction: SessionCompaction
  readonly generate: SessionGenerate
  readonly title: SessionTitle
  readonly "model.request": SessionModelRequest
  readonly "http.request": SessionHttpRequest
  readonly "http.response": SessionHttpResponse
  readonly "experimental.ws.handshake": SessionWebSocketHandshake
  readonly "experimental.ws.send": SessionWebSocketSend
  readonly "experimental.ws.receive": SessionWebSocketReceive
  readonly retry: SessionRetry
}

export type SessionDomain = Pick<
  SessionApi,
  | "create"
  | "get"
  | "remove"
  | "switchAgent"
  | "switchModel"
  | "prompt"
  | "generate"
  | "command"
  | "compact"
  | "synthetic"
  | "interrupt"
  | "update"
  | "move"
  | "wait"
  | "context"
> & {
  readonly hook: ModelHooks<SessionHooks>
}
