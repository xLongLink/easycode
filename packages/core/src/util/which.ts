import whichPkg from "which"
import path from "path"

export function which(cmd: string, env?: NodeJS.ProcessEnv, bin?: string) {
  const base = env?.PATH ?? process.env.PATH ?? ""
  const full = base && bin ? base + path.delimiter + bin : base || bin
  return whichPkg.sync(cmd, {
    nothrow: true,
    path: full,
  })
}
