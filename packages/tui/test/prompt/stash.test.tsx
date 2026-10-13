import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { TuiPathsProvider } from "../../src/context/runtime"
import { emptyPrompt } from "../../src/prompt/history"
import { PromptStashProvider, usePromptStash } from "../../src/prompt/stash"

test("stash deletion preserves order, returned entries, and persisted JSONL", async () => {
  const root = await mkdtemp("/tmp/opencode/prompt-stash-")
  const file = Bun.file(path.join(root, "prompt-stash.jsonl"))
  const entries = ["first", "middle", "newest"].map((text, timestamp) => ({
    prompt: { ...emptyPrompt(), text },
    timestamp,
  }))
  // Missing final newline lets us wait for the mount's normalization write before deleting.
  await Bun.write(file, entries.map((entry) => JSON.stringify(entry)).join("\n"))
  let stash: ReturnType<typeof usePromptStash> | undefined

  function Consumer() {
    stash = usePromptStash()
    return <text>stash</text>
  }

  const app = await testRender(
    () => (
      <TuiPathsProvider value={{ cwd: root, home: root, state: root, worktree: root }}>
        <PromptStashProvider>
          <Consumer />
        </PromptStashProvider>
      </TuiPathsProvider>
    ),
    { width: 20, height: 3 },
  )
  const persisted = async (expected: typeof entries) => {
    const text = expected.length > 0 ? expected.map((entry) => JSON.stringify(entry)).join("\n") + "\n" : ""
    const deadline = Date.now() + 2_000
    while ((await file.text()) !== text && Date.now() < deadline) await Bun.sleep(10)
    expect(await file.text()).toBe(text)
  }

  try {
    await app.renderOnce()
    await persisted(entries)
    if (!stash) throw new Error("Stash provider did not mount")
    expect(stash.list()).toEqual(entries)
    expect(stash.remove(-1)).toBeUndefined()
    expect(stash.remove(entries.length)).toBeUndefined()
    expect(stash.list()).toEqual(entries)

    expect(stash.remove(1)).toBeUndefined()
    expect(stash.list()).toEqual([entries[0], entries[2]])
    await persisted([entries[0], entries[2]])

    expect(stash.pop()).toEqual(entries[2])
    expect(stash.list()).toEqual([entries[0]])
    await persisted([entries[0]])

    expect(stash.remove(0)).toBeUndefined()
    expect(stash.list()).toEqual([])
    await persisted([])
    expect(stash.pop()).toBeUndefined()
    expect(stash.remove(0)).toBeUndefined()
    expect(stash.list()).toEqual([])
    expect(await file.text()).toBe("")
  } finally {
    app.renderer.destroy()
    await rm(root, { recursive: true, force: true })
  }
})
