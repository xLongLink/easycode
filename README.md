# Easycode

Two independent local integrations written in TypeScript on Bun, with Vite+
formatting, linting, and type checks. Text chats use upstream
[Pi](https://github.com/earendil-works/pi); voice transcribes locally.

| Integration              | Install         | Uninstall         |
| ------------------------ | --------------- | ----------------- |
| [Text](text/README.md)   | `make up:text`  | `make down:text`  |
| [Voice](voice/README.md) | `make up:voice` | `make down:voice` |

Run all Make commands from the repository root.

Use `make up` to install both integrations, or `make down` to uninstall both.

## Text

Requires [Bun](https://bun.sh) and Bash 4.4+. If Pi is not installed, setup uses
Node.js 22.19+ and npm to install Pi 1.2.0 under `~/.local` without sudo.
Set `PI_BIN` to select an existing executable instead.

```sh
make up:text
```

Open a new Bash terminal. Commands run normally; natural-language input goes to
Pi. Run `~/.local/bin/pi` (or your selected executable) and use `/login` to
configure a provider first. Each terminal keeps a separate conversation. Prefix a line
with `cmd` to force Bash execution. Installation replaces the old checkout-based
shell hook while preserving unrelated settings and installed OpenCode data.
Pi runs tools with your user's permissions, without built-in permission prompts.

## Voice

Requires Bun and an Ubuntu/Debian Wayland desktop.

```sh
make up:voice
```

Select the physical keyboard containing Copilot. Hold Copilot to record, then
release to transcribe locally with Whistle's native CPU engine and paste into
the focused text field or terminal. Voice never presses Enter. Installation uses
sudo for system packages and keyboard permissions; see [voice/README.md](voice/README.md).

## Development checks

Install the project-local Vite+ toolchain first. No bundled AI runtime build is required.

```sh
bun install
bun run check
bun run fmt
make test:text
make test:voice
VOICE_NATIVE_TEST=1 make test:voice
```

The optional native test downloads Whistle assets if absent. Ordinary tests never
contact an AI provider. `bun run check` runs Vite+ format/lint/strict type checks,
Bun build checks, Bash syntax checks, and both integration test suites.
Use `vp run check` with a global Vite+ CLI; tests use Bun rather than `vp test`
because the implementation relies on Bun APIs and native FFI. Text uninstall
retains Pi and its provider credentials and sessions; manage Pi separately.
