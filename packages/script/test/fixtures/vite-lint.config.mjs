import { fileURLToPath } from "node:url"
import config from "../../../../vite.config.ts"

export default {
  lint: {
    ...config.lint,
    jsPlugins: config.lint.jsPlugins.map((plugin) => ({
      ...plugin,
      specifier: fileURLToPath(new URL(`../../../../${plugin.specifier}`, import.meta.url)),
    })),
    rules: {
      "anti-slop/no-reflect-get": "error",
      "anti-slop-effect/no-service-constructor-imports": "error",
    },
  },
}
