<div align="center">

<h3 >
unCode
</h3>

An open source AI coding agent with a core runtime and terminal UI, based on OpenCode.

</div >


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
