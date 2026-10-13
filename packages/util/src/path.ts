const isDrive = (value: string) => {
  if (value.length !== 2) return false
  const code = value.charCodeAt(0)
  return value[1] === ":" && ((code >= 65 && code <= 90) || (code >= 97 && code <= 122))
}

const trimTrailingSlashes = (value: string) => {
  for (let i = value.length - 1; i >= 0; i--) {
    if (value[i] !== "/") return value.slice(0, i + 1)
  }
  return ""
}

const isWindowsPath = (value: string) => value[1] === ":" || value.startsWith("\\\\")

/** A comparable form of a directory path: forward slashes for Windows paths, no trailing slash except on roots. */
export function comparablePath(path: string) {
  const value = isWindowsPath(path) ? path.replaceAll("\\", "/") : path
  const trimmed = trimTrailingSlashes(value)
  if (!trimmed && value.startsWith("/")) return "/"
  if (isDrive(trimmed)) return `${trimmed}/`
  return trimmed
}

/** `child` is `parent` or inside it. Windows drive and UNC paths compare case-insensitively. */
export function containsDirectory(parent: string, child: string) {
  const normalize = (value: string) => {
    const key = comparablePath(value)
    return /^[a-z]:\//i.test(key) || key.startsWith("//") ? key.toLowerCase() : key
  }
  const root = normalize(parent)
  const target = normalize(child)
  return target === root || target.startsWith(root.endsWith("/") ? root : `${root}/`)
}

export function sameDirectory(a: string, b: string) {
  return containsDirectory(a, b) && containsDirectory(b, a)
}
