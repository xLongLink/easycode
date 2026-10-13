# Development

Install dependencies from the workspace root, then run checks from `packages/live`:

```sh
bun typecheck
bun test
bun run build
```

Run `bun run check` from the workspace root for full lint and type checks.
Do not format the model prompt sections; formatting changes what the models read.

## Audio

The helper is TypeScript compiled to JavaScript and runs in Node.js 22+.
It uses `werift` for WebRTC, `opusscript` for Opus, and user-installed FFmpeg/FFplay
for microphone and speaker access. There is no Rust toolchain or platform binary download.
Use headphones: the Node helper does not implement echo cancellation.

Linux capture uses PulseAudio/PipeWire; `GPT_LIVE_AUDIO_BACKEND=alsa` selects ALSA.
macOS capture uses AVFoundation. Linux ducking uses `pactl`; other platforms do not duck audio.

The server and terminal plugins load as built-ins. Restart the development CLI after edits
to the plugin. Source checkouts prepare the Node helper when starting a call; package builds
include `dist/host/index.js`.
CLI executable builds embed a self-contained helper and the built-in prompts; the helper
is extracted to the user cache before Node launches it. No npm install is needed at call time.

## Developer switches

| Variable | Effect |
| --- | --- |
| `GPT_LIVE_INPUT_FILE` | PCM16 48 kHz mono/stereo WAV instead of the microphone |
| `GPT_LIVE_OUTPUT` | `none` discards output; a path records a stereo WAV |
| `GPT_LIVE_FFMPEG` | FFmpeg executable path |
| `GPT_LIVE_FFPLAY` | FFplay executable path |
| `GPT_LIVE_AUDIO_BACKEND` | Linux capture backend (`pulse` or `alsa`) |
| `GPT_LIVE_INPUT_DEVICE` | FFmpeg input device (`default` on Linux, `:default` on macOS) |
| `GPT_LIVE_HOST` | Alternative JavaScript helper entrypoint |
| `GPT_LIVE_AUTOSTART` | Start a call automatically once a session opens |
| `GPT_LIVE_VISUAL` | Force `kitty`, `herdr`, or `blocks` |
| `GPT_LIVE_DEBUG` | UI diagnostics JSONL path |

Headless WAV input and WAV/discarded output work without FFmpeg or audio hardware.
`test/host.test.ts` tests the real Node process against a local WebRTC peer, including
audio, data-channel events, mute, clear and shutdown. No ChatGPT credentials are used.

## Real calls

With the OpenCode service running and ChatGPT signed in:

```sh
bun run e2e /path/to/project --devices
```

Without `--devices`, the smoke script synthesizes a WAV with macOS `say` and FFmpeg.
Call logs are written to `~/.local/state/opencode-gpt-live/calls/` when logging is enabled.

## Aura

`bun script/render-aura.ts` renders the aura asset with ImageMagick.
`GPT_LIVE_VISUAL=blocks` tests the half-block fallback in any terminal.
