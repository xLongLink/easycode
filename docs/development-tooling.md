# Development tooling

This is a partial Vite+ migration. Bun remains the runtime, package manager, and
test runner. Install with `bun install`; the pinned, project-local `vp` binary is
available through Bun scripts or `bun run vp`. Node must satisfy Vite+ 1.1.0's
engine requirement: `^22.18.0 || ^24.11.0 || >=26.0.0`. CI already uses Node 24.

## Checks and tasks

`bun run check` remains the full verification entrypoint: Vite+ lint, tooling
configuration type checks, and all 18 existing package type checks. Package
scripts still use their original `tsgo` projects and options. Vite+ orchestration
limits concurrency to three, and CLI, SDK, Server, Simulation, and TUI checks
explicitly wait for Core's declaration-emitting check.

Task names differ from package scripts because Vite+ disallows duplicate names:

| Vite+ task                 | Existing package script        |
| -------------------------- | ------------------------------ |
| `check:types`              | `bun run typecheck`            |
| `workspace:build`          | `bun run build`                |
| `workspace:test`           | `bun run test`                 |
| `workspace:verify:package` | SDK's `bun run verify:package` |

Package `vite.config.mjs` files share `script/vite-tasks.ts`; using JavaScript
configs keeps them outside the packages' existing TypeScript build projects.
The shared task factory reads script names from package manifests rather than
duplicating their commands. Direct package scripts continue to work unchanged.

Run tests from a package directory, never the repository root:

```sh
cd packages/core
bun run vp run --concurrency-limit 3 workspace:test
# Or orchestrate all of the previously configured CI suites:
bun run vp run -r --concurrency-limit 3 workspace:test
```

CI retains the previous test selection (AI, Codemode, Core, HTTP API Codegen,
Server, CLI, TUI, and LaTeX), including workspace dependency build prerequisites.
`vp test` is Vitest and must not replace these Bun scripts. Custom builds,
declaration generation, and the ast-grep checks are unchanged.

## Caching

The task cache is `node_modules/.vite/task-cache`, also cached in GitHub Actions.
No command writes Turbo caches anymore; `.turbo` remains ignored solely for old
local cache directories.

Tasks fingerprint package files, automatically tracked reads, the previous
global inputs (patches, Bun configuration, npm configuration, Bun setup action,
and test workflow), root manifests/lockfile, root TypeScript configuration, and
the shared task configuration. `CI` and `OPENCODE_DISABLE_SHARE` are both passed
through and fingerprinted. Generated build info is excluded from inputs.
Builds restore `dist/**`; type checks also restore declarations and incremental
build info, so cached Core checks can supply their referenced projects. Tests
and SDK verification cache logs without restoring output files.

Vite+ does not have Turbo's `--affected` option. CI selects all previously
configured tasks and lets the input cache skip unchanged work. A cold CI cache
therefore runs all selected suites. Use `--no-cache` to force execution or
`bun run vp cache clean` to clear the task cache.

The package profiling command still prints serial elapsed times and shares;
measurements now include Vite+ startup for each package. System profiling stays
macOS-only and accepts Vite+ runner flags, such as `--no-cache` and
`--concurrency-limit 1`, instead of Turbo flags.

## Linting and formatting

The root `vite.config.ts` replaces `.oxlintrc.json` without changing enabled
rules, categories, ignored paths, or custom plugin registration. Plugin imports
use `vite-plus/lint/plugins`, matching Vite+'s bundled Oxlint. Standalone direct
dependencies on Turbo, Oxlint, its authoring API, and tsgolint are removed.
Oxlint and its related packages remain transitive Vite+ dependencies.

Prettier remains the repository formatter. Oxfmt is available for evaluation
with `bun run vp fmt --check <paths>`, configured with `semi: false`, width 120,
the existing generated-code exclusions, and import/package sorting disabled.
Formatting remains disabled in `vp check`: introducing a format gate or
mass-formatting existing files is not part of this migration. In particular,
Oxfmt still reformats `packages/httpapi-codegen/src/index.ts` with these options.

Prettier is also used programmatically by HTTP API Codegen, Protocol OpenAPI
generation, CLI schema generation, and Core migration scripts (including
Prettier parser plugins). Those callers and dependencies remain unchanged.
`vp check` does **not** replace the full `bun run check` project coverage.

## Deferred TUI migration

The CLI's custom Vite/Bun environment and Solid refresh integration remain on
Vite 7.3.6. Vite+ has its own bundled Vite, installed separately; this migration
does not alias the CLI's `vite` dependency or modify its development entrypoints.
A later phase must upgrade the integration to Vite 8+, validate development,
refresh boundaries, recovery, and terminal handoff, and only then migrate that
integration to the Vite+ core alias.

## Migration validation snapshot

- `bun run check` passes, covering tooling and all 18 existing package checks;
  a repeat run reports 18/18 task cache hits.
- The 11 tooling tests pass, including real custom-plugin execution, cached
  output restoration, environment invalidation, and global-input invalidation.
- Both ast-grep rule suites pass (16 rule tests total).
- AI, Codemode, HTTP API Codegen, LaTeX, and CLI suites pass through Vite+;
  their required workspace builds also succeed. Frozen Bun installation passes.
- Full runtime validation is not green. Core and Server still expect old
  `opencode` paths instead of `easycode` paths; these failures reproduce with
  direct Bun scripts. The full Core run additionally encounters blocked ripgrep
  downloads and timing failures. Direct TUI tests report a SIGHUP timeout and
  two session-dialog frame timeouts. SDK verification references the absent
  `packages/plugin-browser` directory. These runtime/test/package issues are
  not changed by this tooling migration.
