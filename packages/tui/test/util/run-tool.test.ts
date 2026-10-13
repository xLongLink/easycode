import { describe, expect, test } from "bun:test"
import { normalizeTool, readDisplayText, toolInlineInfo, toolOutputText, toolPath } from "../../src/util/run-tool"
import { canonicalToolPart } from "./fixture/tool-part"

describe("Run tool presentation", () => {
  test("unwraps read pages and directory entries without changing plain output", () => {
    expect(readDisplayText('{"type":"text-page","content":"file content"}')).toBe("file content")
    expect(readDisplayText('{"entries":["a.ts",{"path":"b.ts"}]}')).toBe("a.ts\nb.ts")
    expect(readDisplayText("plain output")).toBeUndefined()
    expect(readDisplayText("{invalid")).toBeUndefined()
    expect(toolOutputText("read", [{ type: "text", text: "plain output" }])).toBe("plain output")
  })

  test("uses V2 shell output without the model-facing status", () => {
    expect(
      toolOutputText("shell", [
        { type: "text", text: "command-output\n" },
        { type: "text", text: "Command exited with code 0." },
      ]),
    ).toBe("command-output\n")

    expect(
      toolOutputText("shell", [
        { type: "text", text: "" },
        { type: "text", text: "Command exited with code 0." },
      ]),
    ).toBe("")
  })

  test("normalizes only persisted tool aliases into current fields", () => {
    expect(
      normalizeTool({
        type: "tool",
        id: "call-patch",
        name: "apply_patch",
        state: {
          status: "completed",
          input: { patchText: "*** Begin Patch\n*** End Patch" },
          metadata: {
            files: [
              {
                type: "update",
                filePath: "/tmp/project/src/a.ts",
                relativePath: "src/a.ts",
                patch: "@@ -1 +1 @@\n-old\n+new",
              },
            ],
          },
          content: [{ type: "text", text: "patched" }],
        },
        time: { created: 1, ran: 1, completed: 2 },
      }),
    ).toMatchObject({
      name: "patch",
      state: {
        metadata: {
          files: [
            {
              status: "modified",
              file: "src/a.ts",
              patch: "@@ -1 +1 @@\n-old\n+new",
            },
          ],
        },
        content: [{ type: "text", text: "patched" }],
      },
    })

    expect(
      normalizeTool({
        type: "tool",
        id: "call-subagent",
        name: "task",
        state: {
          status: "running",
          input: { subagent_type: "explore", description: "Inspect" },
          metadata: {},
        },
        time: { created: 1, ran: 1 },
      }),
    ).toMatchObject({ name: "subagent", state: { input: { agent: "explore" } } })
  })

  test("renders the skill name from tool metadata with the input id as fallback", () => {
    const skill = (metadata: { name?: string }) =>
      canonicalToolPart(
        "skill",
        {
          status: "completed",
          input: { id: "tigerstyle" },
          metadata,
          content: [{ type: "text", text: "" }],
        },
        "call-skill",
      )

    expect(toolInlineInfo(skill({ name: "effect" })).title).toBe('Skill "effect"')
    expect(toolInlineInfo(skill({})).title).toBe('Skill "tigerstyle"')
  })

  test("renders compact search metadata", () => {
    expect(
      toolInlineInfo(
        canonicalToolPart("glob", {
          status: "completed",
          input: { pattern: "*.ts" },
          metadata: { count: 3 },
          content: [{ type: "text", text: "" }],
        }),
      ).description,
    ).toBe("3 matches")
    expect(
      toolInlineInfo(
        canonicalToolPart("grep", {
          status: "completed",
          input: { pattern: "needle" },
          metadata: { matches: 1 },
          content: [{ type: "text", text: "" }],
        }),
      ).description,
    ).toBe("1 match")
  })

  test("keeps segment-safe contained tool paths relative", () => {
    expect(toolPath("..cache/result.txt", { directory: "/work/project" })).toBe("..cache/result.txt")
    expect(toolPath("../shared/result.txt", { directory: "/work/project" })).toBe("/work/shared/result.txt")
  })
})
