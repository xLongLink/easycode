import { expect, test } from "@playwright/test"
import { assistantMessage, setupTimeline, toolPart, userMessage } from "../utils/timeline"

test("projects English tool names for a saved non-English preference", async ({ page }) => {
  const ids = ["prt_locale_01_read", "prt_locale_02_glob"]
  await setupTimeline(page, {
    messages: [
      userMessage(),
      assistantMessage([
        toolPart(ids[0]!, "read", "completed", { path: "src/a.ts" }),
        toolPart(ids[1]!, "glob", "completed", { path: ".", pattern: "**/*.ts" }),
      ]),
    ],
    locale: "ar",
  })

  const group = page.locator(`[data-timeline-part-ids="${ids.join(",")}"]`)
  const label = "Used 2 Read, Glob"
  await expect(group.getByRole("button")).toHaveAccessibleName(label)
  await expect(group.locator('[data-component="context-tool-group-trigger"]')).toHaveAttribute("aria-label", label)
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
})
