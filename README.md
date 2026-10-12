<div align="center">

<h3 >
unCode
</h3>

An open source AI coding agent with a core runtime and terminal UI, based on OpenCode.

</div >


<br />

### Installation

Supports Linux and macOS (x64 and ARM64). For windows see [instructions](https://ubuntu.com/download/desktop).

```bash
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/install | bash
```



The install script respects the following priority order for the installation path:

1. `$UNCODE_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/.uncode/bin` - Default fallback

It installs the latest release without command-line options or changing shell
configuration. Add the installation directory to your `PATH` if needed.

```bash
# Examples
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/install | UNCODE_INSTALL_DIR=$HOME/.local/bin bash
```

<br />

### OpenCode compatibility

OpenCode configuration filenames (`opencode.json`, `opencode.jsonc`, and `.opencode/`),
`OPENCODE_*` environment variables, and `@opencode/*` package names remain unchanged.
The executable is `uncode`; global data, configuration, cache, and state use `uncode`
directories. Existing Easycode data is not automatically migrated or removed.

### Agents

uncode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

<br />

#### Local Development

For local development, build and install from this repository:

```bash
make install
make uncode
make uninstall
```
