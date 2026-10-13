import { EOL } from "node:os"
import { Effect } from "effect"

export const reportPlainError = Effect.catch((error: unknown) =>
  Effect.sync(() => {
    process.stderr.write(errorMessage(error) + EOL)
    process.exitCode = 1
  }),
)

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return String(error)
}
