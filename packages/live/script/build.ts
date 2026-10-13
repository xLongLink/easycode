#!/usr/bin/env bun

import { cp } from "node:fs/promises"
import { compile } from "../../../script/build.js"

await compile(new URL("..", import.meta.url))
await cp(new URL("../src/server/prompts", import.meta.url), new URL("../dist/server/prompts", import.meta.url), {
  recursive: true,
})
