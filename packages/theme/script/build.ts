#!/usr/bin/env bun

import { compile } from "../../../script/build.js"

await compile(new URL("..", import.meta.url))
