import { createSignal, onCleanup, onMount } from "solid-js"
import { Keymap } from "../context/keymap"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"

export function DialogDictate(props: { onText: (text: string) => void }) {
  const dialog = useDialog()
  const theme = useTheme().surface("dialog")
  const toast = useToast()
  const [status, setStatus] = createSignal<"loading" | "recording" | "transcribing">("loading")
  let recording: { stop: () => void; cancel: () => void } | undefined
  let closed = false

  onCleanup(() => {
    closed = true
    recording?.cancel()
  })
  onMount(() => {
    void (async () => {
      const { Needle } = await import("@opencode/needle")
      if (closed) return
      const capture = Needle.record({ onStatus: setStatus })
      recording = capture
      const result = await capture.result
      if (closed) return
      if (result.text.trim()) props.onText(result.text.trim())
      if (!result.text.trim()) toast.show({ message: "No speech detected", variant: "warning" })
      dialog.clear()
    })().catch((error) => {
      if (closed) return
      toast.error(error)
      dialog.clear()
    })
  })

  function stop() {
    if (status() !== "recording") return
    setStatus("transcribing")
    recording?.stop()
  }

  Keymap.createLayer(() => ({
    mode: "modal",
    commands: [{ bind: "return", title: "Stop recording", group: "Dictation", run: stop }],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text.base}>Dictate</text>
        <text fg={theme.text.muted} onMouseUp={() => dialog.clear()}>
          esc cancel
        </text>
      </box>
      <text fg={theme.text.base}>
        {status() === "loading"
          ? "Loading Whistle (first use downloads the model)…"
          : status() === "recording"
            ? "Recording locally · up to 30 seconds"
            : "Transcribing locally…"}
      </text>
      <text fg={theme.text.muted} onMouseUp={stop}>
        {status() === "recording" ? "Enter to stop and insert transcript" : "Audio is never sent to the server"}
      </text>
    </box>
  )
}
