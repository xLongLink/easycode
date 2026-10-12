#!/usr/bin/env bun

import { $ } from "bun"

await $`bun run generate`.cwd("packages/protocol")

await $`bun script/schema.ts cli.schema.json`.cwd("packages/cli")
