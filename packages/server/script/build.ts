#!/usr/bin/env bun

import { bundle } from "../../../script/build.js"

await bundle(new URL("..", import.meta.url), "Server")
