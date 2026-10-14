# Easycode

Two independent local integrations written in TypeScript on Bun, with Vite+
formatting, linting, and type checks. Text chats use upstream
[Pi](https://github.com/earendil-works/pi); voice transcribes locally.

| Integration              | Install            | Uninstall            |
| ------------------------ | ------------------ | -------------------- |
| [Text](text/README.md)   | `bun run up:text`  | `bun run down:text`  |
| [Voice](voice/README.md) | `bun run up:voice` | `bun run down:voice` |

Run these commands from the repository root. Make targets remain available as aliases.

Use `bun run up` to install both integrations, or `bun run down` to uninstall both.
Inside `text/` or `voice/`, use `bun run up` and `bun run down` for that integration only.

## Text

Requires [Bun](https://bun.sh) and Bash 4.4+. If Pi is not installed, setup uses
Bun to install Pi 1.2.0 under `~/.local` without sudo or lifecycle scripts.
The text integration runs Node-shebang Pi executables with Bun; Node.js and npm are not required.
Set `PI_BIN` to select an existing executable instead.

```sh
bun run up:text
```

Open a new Bash terminal. Commands run normally; natural-language input goes to
Pi. Run `bun ~/.local/bin/pi` (or your selected executable) and use `/login` to
configure a provider first. Each terminal keeps a separate conversation. Prefix a line
with `cmd` to force Bash execution. Installation replaces the old checkout-based
shell hook while preserving unrelated settings and installed OpenCode data.
Pi runs tools with your user's permissions, without built-in permission prompts.

## Voice

Requires Bun and an Ubuntu/Debian Wayland desktop.

```sh
bun run up:voice
```

Select the physical keyboard containing Copilot. Hold Copilot to record, then
release to transcribe locally with Whistle's native CPU engine and paste into
the focused text field or terminal. Voice never presses Enter. Installation uses
sudo for system packages and keyboard permissions; see [voice/README.md](voice/README.md).

## Releases

Push an annotated version tag to publish a GitHub release with two independent
archives and their SHA-256 checksums:

```sh
git tag -a v1.0.0 -m "Uncode v1.0.0"
git push origin v1.0.0
```

The workflow runs all checks, builds text and voice separately, then uploads
`uncode-text-v1.0.0.tar.gz` and `uncode-voice-v1.0.0.tar.gz` with generated release
notes. Tags like `v1.0.0-rc.1` publish prereleases. Commit and push your changes
before tagging; the tagged commit must include the release workflow.

Build locally with `bun run build` (development version), or use
`bun run build:text v1.0.0` and `bun run build:voice v1.0.0`. Output goes to
`dist/`; root Make targets `build`, `build:text`, and `build:voice` are aliases.
Building requires Bun and GNU tar, not provider credentials or native inference.

These are standalone Bun source distributions, not bundled AI runtimes or
self-contained executables. They include installers, runtime sources, documentation,
licenses, and a `VERSION` file; voice also includes the speech model. No caches,
credentials, tests, or dependencies are packaged. Voice downloads its pinned native
engine during installation and supports Linux x86_64/ARM64.

Download the chosen archive and its `.sha256` file into the same directory:

```sh
sha256sum -c uncode-text-v1.0.0.tar.gz.sha256
tar -xzf uncode-text-v1.0.0.tar.gz
cd uncode-text-v1.0.0
bun run up
# To uninstall later: bun run down
```

For voice, substitute `voice` for `text`. Keep the extracted voice directory at
its installed path because the systemd service runs from it. Existing integration
requirements and permissions still apply; see the included README.

## Development checks

Install the project-local Vite+ toolchain first. No bundled AI runtime build is required.

```sh
bun install
bun run check
bun run fmt
bun run test:text
bun run test:voice
VOICE_NATIVE_TEST=1 bun run test:voice
```

The optional native test downloads Whistle assets if absent. Ordinary tests never
contact an AI provider. `bun run check` runs Vite+ format/lint/strict type checks,
Bun build checks, Bash syntax checks, and both integration test suites.
Use `vp run check` with a global Vite+ CLI; tests use Bun rather than `vp test`
because the implementation relies on Bun APIs and native FFI. Text uninstall
retains Pi and its provider credentials and sessions; manage Pi separately.
