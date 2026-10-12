// The process-wide id materializes on first use and stays stable afterwards.
let generated: string | undefined

export function runID(): string {
  generated ??= crypto.randomUUID().slice(0, 8)
  return generated
}
