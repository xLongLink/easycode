# Easycode

Two independent local integrations. This repository no longer contains or builds
an OpenCode runtime: text connects to your existing installed OpenCode.

| Integration | Install | Uninstall |
| --- | --- | --- |
| [Text](text/README.md) | `make up:text` | `make down:text` |
| [Voice](voice/README.md) | `make up:voice` | `make down:voice` |

Run all Make commands from the repository root.

## Text

Requires [Bun](https://bun.sh), Bash 4.4+, and an already configured OpenCode on
PATH (or set `OPENCODE_BIN` to its absolute executable path).

```sh
make up:text
```

Open a new Bash terminal. Commands run normally; natural-language input goes to
installed OpenCode. Each terminal keeps a separate conversation. Prefix a line
with `cmd` to force Bash execution. Installation replaces the old checkout-based
shell hook while preserving unrelated settings and installed OpenCode data.

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

No npm dependencies or repository runtime build are required.

```sh
bun run check
make test:text
make test:voice
VOICE_NATIVE_TEST=1 make test:voice
```

The optional native test downloads Whistle assets if absent. Ordinary tests never
contact an AI provider. OpenCode installation, provider setup, and updates are
managed separately, outside this repository.
