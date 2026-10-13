declare const OPENCODE_VERSION: string
declare const OPENCODE_ARTIFACT: string

const version = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
const artifact = typeof OPENCODE_ARTIFACT === "string" ? OPENCODE_ARTIFACT : "cli"

export { version as OPENCODE_VERSION, artifact as OPENCODE_ARTIFACT }
