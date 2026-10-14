# Uncode Text

[![Bun](https://img.shields.io/badge/runtime-Bun-14151a)](https://bun.sh)
[![Bash](https://img.shields.io/badge/shell-Bash%204.4%2B-4eaa25)](https://www.gnu.org/software/bash/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/xLongLink/uncode/blob/main/LICENSE)

Use natural language at your Bash prompt with upstream
[Pi](https://github.com/earendil-works/pi). Commands continue to run normally.

## Install

Requires Bun and Bash 4.4+ with Emacs editing mode (`set -o emacs`).

```sh
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/text.sh | bash
```

Alternatively, from this directory or an extracted release archive:

```sh
bun run up
```

From the repository root, use `bun run up:text` instead. Setup installs Pi 1.2.0
under `~/.local` if absent, without sudo or lifecycle scripts. Existing Pi
installations are reused. Node.js and npm are not required.

Configure a provider with `bun ~/.local/bin/pi` and `/login`, then open a **new
Bash terminal**. To use another executable, set `PI_BIN` when installing:

```sh
PI_BIN=/absolute/path/to/pi bun run up
```

Configure that executable's provider before chatting.

## Use

```text
$ git status
$ explain the files in this directory
$ what should I change first?
```

- Executables, aliases, functions, builtins, and recognized shell syntax run in Bash.
- Other input goes to Pi; prefix a line with `cmd` to force shell execution.
- Each terminal has its own conversation, anchored to the first message's directory.
  Open a new terminal to start a new conversation.
- Routing is not a full Bash parser: a typo such as `gti status` goes to Pi.

**Security:** Pi can read and write files and execute commands with your user's
permissions, without built-in permission prompts. Use a sandbox for isolation.

## Uninstall

```sh
bun run down
```

From the repository root, use `bun run down:text`. Open a new Bash terminal afterward.
Setup manages only its marked `~/.bashrc` block and files under
`${XDG_DATA_HOME:-~/.local/share}/uncode/text`. Pi, credentials, sessions, and
unrelated shell settings are retained. The installed hook does not depend on this
source directory remaining in place.
