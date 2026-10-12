import { defineConfig } from "vite-plus"

// Keep Bun's package scripts usable directly; Vite+ task names must not overlap scripts.
export function workspaceTasks(pkg: { name: string; scripts: Record<string, string> }) {
  return defineConfig({
    run: {
      tasks: Object.fromEntries(
        Object.entries(pkg.scripts)
          .filter(
            ([name]) =>
              ["typecheck", "build"].includes(name) ||
              (name === "test" &&
                ["ai", "codemode", "core", "httpapi-codegen", "server", "cli", "tui", "latex"].some(
                  (name) => pkg.name === `@opencode/${name}`,
                )),
          )
          .map(([name]) => [
            name === "typecheck" ? "check:types" : `workspace:${name}`,
            {
              command: `bun run ${name}`,
              dependsOn:
                name === "typecheck" &&
                ["cli", "server", "simulation", "tui"].some((name) => pkg.name === `@opencode/${name}`)
                  ? ["@opencode/core#check:types"]
                  : name === "test" &&
                      ["ai", "codemode", "core", "server", "cli", "tui", "latex"].some(
                        (name) => pkg.name === `@opencode/${name}`,
                      )
                    ? [{ task: "workspace:build", from: ["dependencies", "devDependencies"] as const }]
                    : [],
              cache: {
                env: ["CI", "OPENCODE_DISABLE_SHARE"],
                input: [
                  { auto: true },
                  "**/*",
                  "!node_modules/**",
                  "!dist/**",
                  "!.build/**",
                  "!.turbo/**",
                  "!**/*.tsbuildinfo",
                  ...[
                    "patches/**",
                    "bunfig.toml",
                    ".npmrc",
                    ".github/actions/setup-bun/**",
                    ".github/workflows/test.yml",
                    "package.json",
                    "bun.lock",
                    "tsconfig.json",
                    "script/vite-tasks.ts",
                    "script/build.ts",
                  ].map((pattern) => ({ pattern, base: "workspace" as const })),
                ],
                // Composite checks emit declarations needed by dependent projects.
                output:
                  name === "build"
                    ? ["dist/**"]
                    : name === "typecheck"
                      ? ["node_modules/.ts-dist/**", "**/*.tsbuildinfo"]
                      : [],
              },
            },
          ]),
      ),
    },
  })
}
