import { beforeAll, expect, test } from "bun:test"
import path from "path"
import { mkdir, mkdtemp, readdir, rm } from "fs/promises"
import { tmpdir } from "os"
import { appendText, readJson, readText, writeJsonAtomic, writeText } from "../../src/util/persistence"

const temporaryRoot = path.join(tmpdir(), "uncode")
beforeAll(() => mkdir(temporaryRoot, { recursive: true }))

test("persistence creates parent directories and supports text, append, and JSON", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opencode-tui-persistence-"))
  try {
    const textPath = path.join(root, "nested", "state.jsonl")
    await writeText(textPath, "one\n")
    await appendText(textPath, "two\n")
    expect(await readText(textPath)).toBe("one\ntwo\n")

    const jsonPath = path.join(root, "other", "state.json")
    await writeJsonAtomic(jsonPath, { value: 1 })
    expect(await readJson<{ value: number }>(jsonPath)).toEqual({ value: 1 })
    await writeJsonAtomic(jsonPath, { value: 2 })
    expect(await readJson<{ value: number }>(jsonPath)).toEqual({ value: 2 })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("atomic JSON rename failure removes the temporary file and preserves the rename error", async () => {
  const root = await mkdtemp(path.join(temporaryRoot, "opencode-tui-persistence-"))
  const destination = path.join(root, "state.json")
  try {
    await mkdir(destination)
    const error = await writeJsonAtomic(destination, { value: 1 }).then(
      () => undefined,
      (error: NodeJS.ErrnoException) => error,
    )
    expect(error).toMatchObject({ code: "EISDIR", syscall: "rename", dest: destination })
    expect(await readdir(root)).toEqual(["state.json"])
    expect(await readdir(destination)).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("JSON serialization failure creates no temporary file and preserves the original error", async () => {
  const root = await mkdtemp(path.join(temporaryRoot, "opencode-tui-persistence-"))
  const error = new Error("Cannot serialize")
  try {
    await expect(
      writeJsonAtomic(path.join(root, "state.json"), {
        toJSON() {
          throw error
        },
      }),
    ).rejects.toBe(error)
    expect(await readdir(root)).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("atomic JSON write failure preserves the original error when temporary cleanup also fails", async () => {
  const root = await mkdtemp(path.join(temporaryRoot, "opencode-tui-persistence-"))
  try {
    // Supported local filesystems reject this component for both writing and removal.
    const destination = path.join(root, "x".repeat(300))
    const error = await writeJsonAtomic(destination, { value: 1 }).then(
      () => undefined,
      (error: NodeJS.ErrnoException) => error,
    )
    expect(error).toMatchObject({ code: "ENAMETOOLONG", syscall: "open" })
    expect(error?.path?.startsWith(`${destination}.${process.pid}.`)).toBe(true)
    expect(error?.path?.endsWith(".tmp")).toBe(true)
    expect(await readdir(root)).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
