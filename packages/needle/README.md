# Needle

Local speech-to-text using Cactus Compute's Whistle model and the official
`needle.js` / `needle.wasm` engine. No Python or pip installation is needed.

Run `/dictate` in the TUI. The engine and 16.9 MB model download automatically
on first use (about 18 MB total), then stay cached for offline use under
`$XDG_CACHE_HOME/uncode/needle` or `~/.cache/uncode/needle`. Engine and model
revisions are pinned together.

Wait for “Recording”, speak, then press Enter to transcribe or Escape to cancel.
Capture stops automatically after 30 seconds. The transcript is inserted into
the prompt, never automatically submitted. Inference runs in a local worker so
the terminal stays responsive. Audio stays in memory and is never uploaded.

Terminal microphone capture uses the first installed tool:

- **Linux:** `pw-record` (PipeWire), `parec` (PulseAudio), or `arecord` (ALSA).
- **macOS:** `rec` (SoX) or FFmpeg. If neither is installed, run `brew install sox`.

Allow microphone access in your OS settings. Whistle detects English, German,
French, Spanish, Italian, Dutch, and Polish; it transcribes rather than translates.

`Needle.transcribe(audio)` accepts 16 kHz mono `Float32Array` samples.
`Needle.record()` captures the default microphone and returns `result`, `stop()`,
and `cancel()`. Both automatically download/cache the WASM runtime and model.
