import { defineConfig } from "vite-plus"

export default defineConfig({
  lint: {
    jsPlugins: [
      { name: "anti-slop", specifier: "./script/oxlint/anti-slop/index.ts" },
      { name: "anti-slop-effect", specifier: "./script/oxlint/anti-slop/effect/index.ts" },
    ],
    categories: {
      correctness: "off",
      suspicious: "off",
      pedantic: "off",
      perf: "off",
      style: "off",
      restriction: "off",
      nursery: "off",
    },
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "Reflect",
          message: "Use typed property access or direct invocation. Suppress this rule only for genuine reflection.",
        },
      ],
    },
    ignorePatterns: [
      "**/node_modules",
      "**/dist",
      "**/.build",
      "**/*.d.ts",
      "**/sdk.gen.ts",
      ".agent/**",
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".continue/**",
      ".cursor/**",
      ".gemini/**",
      ".opencode/**",
      ".pi/**",
      ".roo/**",
      ".windsurf/**",
      "script/oxlint/anti-slop/**",
    ],
  },
  // Evaluate Oxfmt without making formatting a new requirement for existing files.
  fmt: {
    semi: false,
    printWidth: 120,
    sortPackageJson: false,
    sortImports: false,
    ignorePatterns: ["packages/client/src/generated/", "packages/client/src/generated-effect/"],
  },
  check: { fmt: false },
})
