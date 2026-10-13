import { createEffect, createSignal, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { createSimpleContext } from "./helper"
import { useClient } from "./client"
import { useData } from "./data"
import { useEvent } from "./event"
import { useRoute } from "./route"
import { createSessionRetention } from "./session-retention"
import { anchorKey, type AnchorTarget } from "../routes/session/anchors"

export type ScrollAnchor = {
  target: AnchorTarget
  screenY: number
}

const VIEW_RETRY_DELAY = 250
const VIEW_RETRY_MAX_DELAY = 5_000

export const { use: useSessionView, provider: SessionViewProvider } = createSimpleContext({
  name: "SessionView",
  init: () => {
    const route = useRoute()
    const client = useClient()
    const data = useData()
    const event = useEvent()
    const renderer = useRenderer()
    const [focused, setFocused] = createSignal<boolean>()
    const scrollAnchors = new Map<string, ScrollAnchor>()
    const [expandedGroups, setExpandedGroups] = createStore<Record<string, Record<string, boolean> | undefined>>({})

    const onFocus = () => setFocused(true)
    const onBlur = () => setFocused(false)
    useKeyboard(onFocus)
    renderer.on("focus", onFocus)
    renderer.on("blur", onBlur)
    onCleanup(() => {
      renderer.off("focus", onFocus)
      renderer.off("blur", onBlur)
    })

    createSessionRetention({
      session: data.session,
      current: () =>
        route.data.type === "session" && route.data.sessionID !== "dummy" ? route.data.sessionID : undefined,
      limit: 3,
    })

    // Viewed state is server-global: other clients rely on reporting what this user has seen.
    const acknowledged = new Map<string, number>()
    const [viewRetry, setViewRetry] = createSignal(0)
    let viewRetryTimer: ReturnType<typeof setTimeout> | undefined
    let viewRetryAttempt = 0
    onCleanup(() => clearTimeout(viewRetryTimer))
    createEffect(() => {
      viewRetry()
      if (focused() !== true) return
      if (route.data.type !== "session" || route.data.sessionID === "dummy") return
      const sessionID = data.session.root(route.data.sessionID)
      const session = data.session.get(sessionID)
      const idle = session?.time.idle
      if (
        idle === undefined ||
        (session.time.viewed !== undefined && idle <= session.time.viewed) ||
        acknowledged.get(sessionID) === idle
      )
        return
      // Record before the request so event-driven re-runs don't re-post the same watermark.
      acknowledged.set(sessionID, idle)
      void client.api.session.view({ sessionID, idle }).then(
        () => {
          clearTimeout(viewRetryTimer)
          viewRetryTimer = undefined
          viewRetryAttempt = 0
        },
        () => {
          if (acknowledged.get(sessionID) !== idle) return
          acknowledged.delete(sessionID)
          if (viewRetryTimer) return
          const delay = Math.min(VIEW_RETRY_DELAY * 2 ** viewRetryAttempt, VIEW_RETRY_MAX_DELAY)
          viewRetryAttempt++
          viewRetryTimer = setTimeout(() => {
            viewRetryTimer = undefined
            setViewRetry((value) => value + 1)
          }, delay)
        },
      )
    })

    onCleanup(
      event.on("session.deleted", (evt) => {
        data.session.family(evt.data.sessionID).forEach((id) => {
          scrollAnchors.delete(id)
          setExpandedGroups(id, undefined)
          acknowledged.delete(id)
        })
      }),
    )

    return {
      attention(sessionID: string) {
        const root = data.session.root(sessionID)
        const members = [root, ...data.session.family(root)]
        if (members.some((id) => (data.session.permission.list(id)?.length ?? 0) > 0)) return "permission" as const
        if (members.some((id) => (data.session.form.list(id)?.length ?? 0) > 0)) return "question" as const
        return false as const
      },
      scrollAnchor(sessionID: string) {
        return scrollAnchors.get(sessionID)
      },
      setScrollAnchor(sessionID: string, anchor: ScrollAnchor | undefined) {
        if (anchor === undefined) {
          scrollAnchors.delete(sessionID)
          return
        }
        const current = scrollAnchors.get(sessionID)
        if (current && anchorKey(current.target) === anchorKey(anchor.target) && current.screenY === anchor.screenY)
          return
        scrollAnchors.set(sessionID, anchor)
      },
      groupExpanded(sessionID: string, groupID: string) {
        return expandedGroups[sessionID]?.[groupID]
      },
      setGroupExpanded(sessionID: string, groupID: string, expanded: boolean) {
        setExpandedGroups(sessionID, (current) => ({ ...current, [groupID]: expanded }))
      },
    }
  },
})
