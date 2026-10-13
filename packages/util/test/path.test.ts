import { describe, expect, test } from "bun:test"
import { comparablePath, containsDirectory, sameDirectory } from "../src/path.js"

describe("directory paths", () => {
  test.each([
    ["/repo/src///", "/repo/src"],
    ["///", "/"],
    ["C:\\", "C:/"],
    ["c:/", "c:/"],
    ["C:\\repo/src\\", "C:/repo/src"],
    ["\\\\server\\share\\", "//server/share"],
    ["relative/path/", "relative/path"],
    ["", ""],
  ])("normalizes %j to %j", (input, expected) => {
    expect(comparablePath(input)).toBe(expected)
  })

  test.each([
    ["/repo/", "/repo/src", true],
    ["/", "/repo", true],
    ["/repo", "/repository", false],
    ["/repo/src", "/repo", false],
    ["/Repo", "/repo/src", false],
    ["C:\\", "c:/Repo", true],
    ["C:\\Repo", "c:/repo/src", true],
    ["C:\\Repo", "D:/repo/src", false],
    ["\\\\Server\\Share", "//server/share/src", true],
    ["\\\\Server\\Share", "//server/shared/src", false],
  ])("checks whether %j contains %j", (parent, child, expected) => {
    expect(containsDirectory(parent, child)).toBe(expected)
  })

  test.each([
    ["/repo/", "/repo", true],
    ["/", "///", true],
    ["/Repo", "/repo", false],
    ["/repo", "/repo/src", false],
    ["C:\\", "c:/", true],
    ["C:\\Repo\\", "c:/repo", true],
    ["\\\\Server\\Share\\", "//server/share", true],
    ["\\\\Server\\Share", "//server/share/src", false],
  ])("compares %j and %j", (left, right, expected) => {
    expect(sameDirectory(left, right)).toBe(expected)
    expect(sameDirectory(right, left)).toBe(expected)
  })
})
