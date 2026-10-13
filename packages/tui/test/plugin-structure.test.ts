import { expect, test } from "bun:test"
import { contains, emptySlotted, resolveSlots, type Claim, type PlacementKind } from "../src/plugin/structure"

function claim(plugin: string, kind: PlacementKind, target: string): Claim<() => string> {
  return { plugin, placement: { kind, target }, render: () => plugin }
}

test("last-enabled replacement wins while sibling contributions keep enable order", () => {
  const first = claim("first", "replace", "home.footer")
  const last = claim("last", "replace", "home.footer")
  const before = claim("before", "before", "home.footer")
  const next = claim("next", "before", "home.footer")
  const after = claim("after", "after", "home.footer")
  const result = resolveSlots({
    paths: new Set(["home.footer"]),
    claims: [
      first,
      before,
      claim("inside", "append", "home.footer"),
      claim("start", "prepend", "home.footer"),
      last,
      next,
      after,
    ],
  })

  expect(result.slotted.get("home.footer")).toEqual({
    before: [before, next],
    prepend: [],
    append: [],
    after: [after],
    replace: last,
  })
  expect(result.slotted.get("home.footer")?.replace).toBe(last)
})

test("unreplaced mounted slots keep each additive placement and claim order", () => {
  const kinds = ["before", "prepend", "append", "after"] as const
  const claims = kinds.flatMap((kind) => [claim(`${kind}-first`, kind, "home"), claim(`${kind}-last`, kind, "home")])
  const result = resolveSlots({ paths: new Set(["home", "home.untargeted"]), claims })
  for (const kind of kinds) {
    expect(result.slotted.get("home")?.[kind]).toEqual(claims.filter((item) => item.placement.kind === kind))
  }
  expect(result.slotted.get("home")?.replace).toBeUndefined()
  expect(result.slotted.has("home.untargeted")).toBe(false)
})

test("outer replacement suppresses nested boundaries and all their placements regardless of enable order", () => {
  const outer = claim("outer", "replace", "home.footer")
  const nested = claim("nested", "replace", "home.footer.details")
  const adjacent = claim("adjacent", "append", "home.footer-extra")
  const additions = (["before", "after", "prepend", "append"] as const).map((kind) =>
    claim(kind, kind, "home.footer.details"),
  )
  for (const replacements of [
    [outer, nested],
    [nested, outer],
  ]) {
    const result = resolveSlots({
      paths: new Set(["home.footer", "home.footer.details", "home.footer-extra"]),
      claims: [...replacements, ...additions, claim("missing", "after", "home.footer.missing"), adjacent],
    })
    expect([...result.slotted.keys()]).toEqual(["home.footer-extra", "home.footer"])
    expect(result.slotted.get("home.footer")?.replace).toBe(outer)
    expect(result.slotted.get("home.footer-extra")?.append).toEqual([adjacent])
  }
  expect(contains("home.footer", "home.footer-extra")).toBe(false)
})

test("missing additive targets append to the nearest mounted ancestor; replacements never degrade", () => {
  const additions = (["before", "after", "prepend", "append"] as const).map((kind) =>
    claim(kind, kind, "home.footer.details.missing"),
  )
  const result = resolveSlots({
    paths: new Set(["home", "home.footer"]),
    claims: [
      ...additions,
      claim("replace", "replace", "home.footer.details"),
      claim("orphan", "append", "other.child"),
    ],
  })
  expect([...result.slotted.keys()]).toEqual(["home.footer"])
  expect(result.slotted.get("home.footer")).toEqual({ before: [], prepend: [], append: additions, after: [] })
})

test("target mount and remount move the same claim references between fallback and requested placement", () => {
  const item = claim("plugin", "before", "home.footer")
  const replacement = claim("replacement", "replace", "home.footer")
  const resolve = (paths: string[]) => resolveSlots({ paths: new Set(paths), claims: [item, replacement] }).slotted

  expect(resolve(["home"]).get("home")?.append[0]).toBe(item)
  expect(resolve([]).size).toBe(0)
  for (const paths of [["home", "home.footer"], ["home"], ["home", "home.footer"]]) {
    const result = resolve(paths)
    if (!paths.includes("home.footer")) {
      expect(result.get("home")?.append[0]).toBe(item)
      continue
    }
    expect(result.get("home.footer")?.before[0]).toBe(item)
    expect(result.get("home.footer")?.replace).toBe(replacement)
    expect(result.has("home")).toBe(false)
  }
  expect(emptySlotted()).toBe(emptySlotted())
})
