export * as WebSearchIntegration from "./integration.js"

import type { IntegrationDomain } from "@opencode/plugin/effect/integration"

export function register(integration: Pick<IntegrationDomain, "transform">, id: string, name: string, env: string) {
  return integration.transform((editor) => {
    editor.update(id, (integration) => (integration.name = name))
    editor.method.update({ integrationID: id, method: { type: "key" } })
    editor.method.update({ integrationID: id, method: { type: "env", names: [env] } })
  })
}
