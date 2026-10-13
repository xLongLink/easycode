import type { Plugin } from "@opencode/plugin"
import { z } from "zod"

import type { Auth } from "./live.js"

type Context = Plugin.Context

export type AuthResult = { ok: true; auth: Auth; plan?: string } | { ok: false; reason: string }

const Claims = z.object({
  chatgpt_account_id: z.string().min(1).optional(),
  chatgpt_plan_type: z.string().optional(),
})
const TokenClaims = Claims.extend({ "https://api.openai.com/auth": Claims.optional() })

export function claims(token: string): z.infer<typeof Claims> {
  const part = token.split(".")[1]
  if (!part) return {}
  try {
    const payload = TokenClaims.safeParse(JSON.parse(Buffer.from(part, "base64url").toString()))
    if (!payload.success) return {}
    return {
      chatgpt_account_id:
        payload.data["https://api.openai.com/auth"]?.chatgpt_account_id ?? payload.data.chatgpt_account_id,
      chatgpt_plan_type:
        payload.data["https://api.openai.com/auth"]?.chatgpt_plan_type ?? payload.data.chatgpt_plan_type,
    }
  } catch {
    return {}
  }
}

const CONNECT = 'Run /connect, choose OpenAI, then "Codex browser (legacy)" or "Codex device code (legacy)".'

/**
 * Finds the ChatGPT sign-in among the OpenAI connections. OpenCode refreshes the
 * access token during resolve when it is close to expiring, so resolve before each call.
 */
export async function resolveAuth(ctx: Context): Promise<AuthResult> {
  const integration = await ctx.integration.get({ integrationID: "openai" }).catch(() => undefined)
  if (!integration)
    return { ok: false, reason: "Could not read OpenAI connections. Check the OpenCode service and try again." }
  const oauth = integration.data.connections.filter(
    (connection): connection is Extract<typeof connection, { type: "credential" }> =>
      connection.type === "credential" && connection.method === "oauth",
  )
  if (oauth.length === 0) return { ok: false, reason: `GPT-Live needs a ChatGPT Codex connection. ${CONNECT}` }
  const active = await ctx.integration.connection.active("openai").catch(() => undefined)
  const activeID = active?.type === "credential" ? active.id : undefined
  const ordered = oauth.toSorted((a, b) => Number(b.id === activeID) - Number(a.id === activeID))
  // Resolve every connection at once, then take the first usable one in priority order.
  const credentials = await Promise.all(
    ordered.map((connection) => ctx.integration.connection.resolve(connection).catch(() => undefined)),
  )
  for (const credential of credentials) {
    if (!credential || credential.type !== "oauth") continue
    // Token sharing authorizes the public model API, not this Codex voice endpoint.
    if (credential.methodID === "chatgpt-token-sharing") continue
    const claim = claims(credential.access)
    const metadata = credential.metadata ?? {}
    const accountID =
      (typeof metadata.accountID === "string" && metadata.accountID) ||
      (typeof metadata.accountId === "string" && metadata.accountId) ||
      claim.chatgpt_account_id
    if (!accountID) continue
    return { ok: true, auth: { token: credential.access, accountID }, plan: claim.chatgpt_plan_type }
  }
  if (credentials.some((credential) => credential?.type === "oauth" && credential.methodID === "chatgpt-token-sharing"))
    return {
      ok: false,
      reason: `Your ChatGPT token-sharing sign-in is connected, but GPT-Live needs a separate legacy Codex connection. ${CONNECT} You can keep your token-sharing account selected for coding.`,
    }
  if (credentials.every((credential) => !credential))
    return { ok: false, reason: `Could not resolve your saved ChatGPT credentials. ${CONNECT}` }
  return { ok: false, reason: `Your saved ChatGPT connection has no Codex account ID. ${CONNECT}` }
}
