export * as SessionGenerate from "./generate.js"

import type { FileSystem } from "../filesystem.js"
import { LLMClient, Message, type AIError } from "@opencode/ai"
import { Effect } from "effect"
import { Instance } from "../instance/service.js"
import { Plugin } from "../plugin/service.js"
import type { Instructions } from "../instructions/index.js"
import { SessionContext } from "./context.js"
import type { AgentNotFoundError } from "./error.js"
import { SessionModelRequest } from "./model-request.js"
import type { SessionRunnerModel } from "./runner/model.js"
import type { SessionSchema } from "./schema.js"

export type Error =
  | AgentNotFoundError
  | Instructions.InitializationBlocked
  | SessionRunnerModel.Error
  | AIError
  | FileSystem.DirectoryNotFoundError

/** Generates text from current Session context without mutating the Session. */
export const generate = Effect.fn("SessionGenerate.generate")(function* (input: {
  session: SessionSchema.Info
  prompt: string
}) {
  const instances = yield* Instance.Service
  const llm = yield* LLMClient.Service

  return yield* Effect.gen(function* () {
    yield* Plugin.awaitActivation
    const context = yield* SessionContext.Service
    const request = yield* SessionModelRequest.Service
    const loaded = yield* context.preview(input.session.id)
    const transcript = SessionModelRequest.baseTranscript({
      agent: loaded.agent.info,
      model: loaded.model,
      tools: loaded.tools,
      initial: loaded.initial,
      messages: loaded.messages,
    })
    const prepared = yield* request.generate({
      session: loaded.session,
      agent: loaded.agent.id,
      model: loaded.model,
      tools: loaded.tools,
      system: transcript.system,
      messages: [
        ...transcript.messages,
        ...(loaded.instructionUpdate ? [Message.system(loaded.instructionUpdate)] : []),
        Message.user(input.prompt),
      ],
    })
    yield* Effect.logInfo("sending session generation request", {
      sessionID: loaded.session.id,
      providerID: loaded.model.ref.providerID,
      modelID: loaded.model.ref.id,
    })
    const response = yield* llm.generate(prepared.request, prepared.options)
    yield* Effect.logInfo("session generation usage diagnostic", { usage: response.usage })
    return response.text
  }).pipe(instances.provide(input.session))
})
