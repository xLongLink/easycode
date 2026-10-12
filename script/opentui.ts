const keys = ["@opentui/core", "@opentui/keymap", "@opentui/solid"] as const

export function editVersions(
  obj: unknown,
  kind: "dep" | "peer" | "catalog" | "override",
  version: string,
  snapshot: boolean,
) {
  if (!obj || typeof obj !== "object") return false
  // SAFETY: An object can be read as a dictionary of unknown values; each edited value is checked below.
  const map = obj as Record<string, unknown>
  return keys
    .map((key) => {
      const cur = map[key]
      if (typeof cur !== "string") return false
      const next = selectVersion(cur, kind, version, snapshot)
      if (next === cur) return false
      map[key] = next
      return true
    })
    .some(Boolean)
}

function selectVersion(
  current: string,
  kind: "dep" | "peer" | "catalog" | "override",
  version: string,
  snapshot: boolean,
) {
  if (kind === "catalog") return version
  if (kind === "override") return snapshot ? version : "catalog:"
  if (current === "catalog:" || current.startsWith("workspace:")) return current
  if (snapshot) return version
  if (kind === "peer" || current.startsWith(">=")) return `>=${version}`
  if (current.startsWith("^")) return `^${version}`
  if (current.startsWith("~")) return `~${version}`
  return version
}
