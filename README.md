![Uncode — terminal AI assistance and local voice dictation](banner.png)

[![Release](https://img.shields.io/github/v/release/xLongLink/uncode)](https://github.com/xLongLink/uncode/releases/latest)
[![Release workflow](https://github.com/xLongLink/uncode/actions/workflows/release.yml/badge.svg)](https://github.com/xLongLink/uncode/actions/workflows/release.yml)
[![Bun](https://img.shields.io/badge/runtime-Bun-14151a)](https://bun.sh)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

AI assistance in your Bash terminal and local voice dictation for your desktop.

| Integration              | What it does                                                                                              | Requirements                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Text](text/README.md)   | Routes natural-language input to [Pi](https://github.com/earendil-works/pi); shell commands run normally. | Bun, Bash 4.4+ in Emacs editing mode, a configured Pi provider            |
| [Voice](voice/README.md) | Hold Copilot to record; release to transcribe locally and paste. Never submits the text.                  | Bun, Ubuntu/Debian Wayland, x86_64 or ARM64, a supported Copilot keyboard |

## Install

Install [Bun](https://bun.sh), then run the command for your integration:

**Text**

```sh
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/text.sh | bash
```

**Voice**

```sh
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/voice.sh | bash
```

Installers verify the archive's SHA-256 checksum and keep release files under
`${XDG_DATA_HOME:-~/.local/share}/uncode/releases`. They print the uninstall command.
Voice uses sudo for system setup; do not move its installed directory.
See each integration's README for setup and permissions.

These commands execute a downloaded script; inspect it first if needed. To pin
a version, replace `latest/download` with `download/v0.0.0`. Archives and checksums
are also available for manual installation on the [releases page](https://github.com/xLongLink/uncode/releases).

### From source

```sh
git clone https://github.com/xLongLink/uncode.git
cd uncode
bun run up:text     # or bun run up:voice
```

Use `bun run up` to install both. Uninstall with `bun run down:text`,
`bun run down:voice`, or `bun run down`.

## Development

```sh
bun install
bun install --cwd text
bun install --cwd voice
bun run check
bun run fmt
```

`text/` and `voice/` are independent Bun packages with their own dependencies,
lockfiles, checks, tests, licenses, and release tooling. Either folder can be copied
out and developed without the root or the other package. Inside either folder,
run `bun install`, `bun run check`, `bun test`, or `bun run build`.
Root commands are convenience wrappers; this is not a Bun workspace.

Checks cover formatting, linting, types, builds, Bash syntax, and both integration
test suites. Run suites separately with `bun run test:text` or `bun run test:voice`.
Ordinary tests do not contact AI providers. For native inference, run
`VOICE_NATIVE_TEST=1 bun test` inside `voice/`.

## Release

Commit and push changes, then push an annotated version tag:

```sh
git tag -a v0.0.1
git push origin v0.0.1
```
