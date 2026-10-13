declare const OPENCODE_ARTIFACT: string

const version = "2.0.0"
const artifact = typeof OPENCODE_ARTIFACT === "string" ? OPENCODE_ARTIFACT : "cli"

export { version as OPENCODE_VERSION, artifact as OPENCODE_ARTIFACT }
