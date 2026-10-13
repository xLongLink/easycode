import { plugin } from "bun"

// The CLI exports a fixed version, so --define cannot override its local binding.
plugin({
  name: "old-cli-version",
  setup(build) {
    build.onLoad({ filter: /[/\\]cli[/\\]src[/\\]version\.ts$/ }, () => ({
      contents: 'export const OPENCODE_VERSION = "2.0.0-old"; export const OPENCODE_ARTIFACT = "cli"',
      loader: "ts",
    }))
  },
})
