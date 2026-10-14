import { defineConfig } from "vite-plus"

export default defineConfig({
  lint: {
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ["dist/**", "text/**", "voice/**"],
    overrides: [
      {
        files: ["**/tests/*.test.ts"],
        // Bun's assertion types return void, but rejects matchers are asynchronous.
        rules: { "typescript/await-thenable": "off" },
      },
    ],
  },
  fmt: {
    semi: false,
    ignorePatterns: ["dist/**", "text/**", "voice/**", "bun.lock"],
  },
})
