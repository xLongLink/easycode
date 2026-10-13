# @opencode/live

Real-time GPT-Live voice calls with your OpenCode session, using your ChatGPT subscription.
Imported from [malhashemi/opencode-gpt-live](https://github.com/malhashemi/opencode-gpt-live) v0.3.0
([c23101c](https://github.com/malhashemi/opencode-gpt-live/commit/c23101cfdeb3feaf03f09aa678135ca01d72ed4e)).
The upstream MIT license and third-party notices are preserved in `LICENSE` and `NOTICE`.

## Usage

The server and TUI plugins are built in and load automatically; no plugin configuration is needed.

For voice, use `/connect` → OpenAI → **Codex browser (legacy)** or **Codex device code (legacy)**,
then run `/voice` to start or end a call. The newer **Sign in with ChatGPT** token-sharing connection
works for coding but is not supported by this Codex voice backend. You can keep token sharing selected
for coding; voice can resolve a separately saved legacy Codex connection without changing that selection.
All commands also appear in the command palette:

| Command | Action |
| --- | --- |
| `/voice` | Start or end a call |
| `/voice-stop`, `/hangup` | End a call |
| `/voice-new` | Start with a fresh voice conversation |
| `/voice-mute` | Mute or unmute your microphone |
| `/voice-panel` | Toggle the transcript panel |
| `/voice-pick` | Choose a voice |

Voice requires Node.js 22+, FFmpeg (both `ffmpeg` and `ffplay` on PATH), a microphone,
headphones, and an eligible ChatGPT plan. Linux capture uses PulseAudio/PipeWire by default;
set `GPT_LIVE_AUDIO_BACKEND=alsa` for ALSA. Linux audio ducking also uses `pactl`.
The Node helper does not provide echo cancellation; use headphones to prevent feedback.
On macOS, allow your terminal to access the microphone.

Options and architecture are described in the [upstream README](https://github.com/malhashemi/opencode-gpt-live#configuration)
and [architecture guide](docs/architecture.md).

## Development

Run from `packages/live`:

```sh
bun typecheck
bun test
bun run build
```

The Node helper lives in `src/host/` and is compiled with the package. Source checkouts
prepare it automatically on the first call. There are no Rust builds or native helper downloads.
Headless tests use PCM16 48 kHz WAV input and WAV output or `"none"` without FFmpeg or audio devices.

`bun run e2e` runs the optional live-call smoke test; see `script/e2e-call.ts` for prerequisites.
