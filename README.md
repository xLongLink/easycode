<div align="center">

<img src="banner.png" alt="LongLink banner" />


<h3>
Build with an AI coding agent in your terminal
</h3>


unCode is an open source AI coding agent based on OpenCode, with a core runtime and terminal UI to help you explore, write, and improve code.

[![Tests](https://github.com/xLongLink/uncode/actions/workflows/test.yml/badge.svg)](https://github.com/xLongLink/uncode/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/xLongLink/uncode)](https://github.com/xLongLink/uncode/releases/latest)


</div>


<br />

## Installation

Supports Linux and macOS (x64 and ARM64). For windows see [instructions](https://ubuntu.com/download/desktop).

```bash
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/install | bash
```



<details>
<summary>Installation options</summary>

The install script uses `$UNCODE_INSTALL_DIR`, defaulting to `$HOME/.uncode/bin`.

It installs the latest release without command-line options or changing shell
configuration. Add the installation directory to your `PATH` if needed.

```bash
# Examples
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/install | UNCODE_INSTALL_DIR=$HOME/.local/bin bash
```

</details>

<br />

## 📝 Changes

Changes from OpenCode, focused on keeping the core runtime and terminal UI.

**Removed**:

- 🖥️ Desktop and browser interfaces.
- 🪟 Native Windows and Workerd support.
- 🔗 Device pairing and remote tunnels.
- 📦 Self-updates, release channel selection, and package-manager distribution.
- 🗂️ Session tabs, mini interactive mode, and the getting-started sidebar card.
- 🎨 Light mode and additional terminal themes.
- ⌨️ `/init` and `/editor` slash commands.
- 🧹 Mermaid and LaTeX rendering packages, TUI Storybook demos, and unused tooling.

**Added**:

- 🔁 Built-in **Loop** agent for iterative repository review and improvements.
- 🛠️ Simplified GitHub release installation and a `make uncode` local build/install command.

<br />

## Agents

uncode includes three built-in agents you can switch between with the `Tab` key.

- 🔨 **build** - Default, full-access agent for development work
- 📋 **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes
- 🔁 **loop** - Reviews the repository and presents numbered improvement options
  - Waits for you to select which improvements to implement
  - Implements selected changes, verifies them, and summarizes the results
  - Repeats with a fresh list of options; has the same permissions as Build


<br />

## Local Development

For local development, build and install from this repository:

```bash
make uncode
```


<br />


---

<div align="center">
LongLink 2026

[See another cool project](https://github.com/XLongLink/longlink)
</div>

---
