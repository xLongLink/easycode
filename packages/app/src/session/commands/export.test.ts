import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import type { SessionInfo, SessionMessageInfo } from "@opencode/client/promise"
import type { ServerApi } from "@/runtime/server/api"
import type { Platform } from "@/runtime/platform/platform"
import { exportSession, fetchSessionExport, saveSessionExport, sessionExportFilename } from "./export"

const notifications = await import("@/shell/notifications/toast")

describe("sessionExportFilename", () => {
  test.each([
    [{ id: "ses_123", title: "Clone PR in worktree from fork" }, "clone-pr-in-worktree-from-fork.json"],
    [{ id: "ses_123", slug: "my-session-slug" }, "my-session-slug.json"],
    [{ id: "ses_123" }, "ses_123.json"],
  ])("names %o as %s", (session, filename) => {
    expect(sessionExportFilename(session)).toBe(filename)
  })
})

describe("fetchSessionExport", () => {
  test("fetches every native message page without exporting cursors", async () => {
    const info = { id: "ses_1", title: "Test Session" } as SessionInfo
    const first = { id: "msg_1", type: "model-selected" } as unknown as SessionMessageInfo
    const second = { id: "msg_2", type: "user" } as SessionMessageInfo
    const calls: unknown[] = []

    const api = {
      session: { get: async () => info },
      message: {
        list: async (input: { cursor?: string }) => {
          calls.push(input)

          if (!input.cursor) return { data: [first], cursor: { next: "page-2" } }

          return { data: [second], cursor: {} }
        },
      },
    } as unknown as Pick<ServerApi, "session" | "message">

    const result = await fetchSessionExport({ sessionID: "ses_1", api })

    expect(result).toEqual({ info, messages: [first, second] })
    expect(result).not.toHaveProperty("cursor")
    expect(calls).toEqual([
      { sessionID: "ses_1", limit: 200, order: "asc" },
      { sessionID: "ses_1", limit: 200, cursor: "page-2" },
    ])
  })
})

describe("saveSessionExport", () => {
  test.each([true, false])("writes pretty JSON to the native save dialog and returns %p", async (saved) => {
    const writes: string[][] = []

    const platform: Pick<Platform, "saveFile"> = {
      saveFile: async (options, content) => {
        writes.push([options.defaultPath ?? "", content])

        return saved
      },
    }

    expect(await saveSessionExport("session.json", { id: "ses_1" }, platform)).toBe(saved)
    expect(writes).toEqual([["session.json", '{\n  "id": "ses_1"\n}']])
  })
})

describe("exportSession", () => {
  afterEach(() => mock.restore())

  test.each([true, false])("uses fetched metadata and only notifies when native save returns %p", async (saved) => {
    const toast = spyOn(notifications, "showToast").mockImplementation(() => 1)
    const info = { id: "ses_1", title: "Fresh Title" } as SessionInfo
    const api = {
      session: { get: async () => info },
      message: { list: async () => ({ data: [], cursor: {} }) },
    } as unknown as Pick<ServerApi, "session" | "message">
    const writes: string[] = []

    await exportSession({
      sessionID: "ses_1",
      api,
      platform: {
        saveFile: async (options) => {
          writes.push(options.defaultPath ?? "")
          return saved
        },
      },
      t: (key, params) => `${key}${params ? `:${params.filename}` : ""}`,
    })

    expect(writes).toEqual(["fresh-title.json"])
    expect(toast.mock.calls).toEqual(saved ? [[{
      variant: "success",
      icon: "circle-check",
      title: "toast.session.export.success.title",
      description: "toast.session.export.success.description:fresh-title.json",
    }]] : [])
  })

  test.each([
    { stage: "metadata", cause: new Error("metadata failed"), description: "metadata failed" },
    { stage: "page", cause: new Error("page failed"), description: "page failed" },
    { stage: "save", cause: "save failed", description: "toast.session.export.failed.description" },
  ])("notifies and swallows $stage failures", async ({ stage, cause, description }) => {
    const toast = spyOn(notifications, "showToast").mockImplementation(() => 1)
    const api = {
      session: {
        get: async () => {
          if (stage === "metadata") throw cause
          return { id: "ses_1" }
        },
      },
      message: {
        list: async (input: { cursor?: string }) => {
          if (!input.cursor) return { data: [], cursor: { next: "page-2" } }
          if (stage === "page") throw cause
          return { data: [], cursor: {} }
        },
      },
    } as unknown as Pick<ServerApi, "session" | "message">

    await expect(exportSession({
      sessionID: "ses_1",
      api,
      platform: {
        saveFile: async () => {
          throw cause
        },
      },
      t: (key) => key,
    })).resolves.toBeUndefined()
    expect(toast.mock.calls).toEqual([[{
      variant: "error",
      title: "toast.session.export.failed.title",
      description,
    }]])
  })
})
