import path from "node:path"

export function databasePath(data: string) {
  const filename = process.env.OPENCODE_DB ?? "opencode.db"
  return filename === ":memory:" ? filename : path.resolve(data, filename)
}
