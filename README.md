# easycode

An open source AI coding agent with a core runtime and terminal UI, based on OpenCode.


### Installation

Supports Linux and macOS (x64 and ARM64). Native Windows is not supported; use WSL on Windows.

```bash
curl -fsSL https://github.com/xLongLink/easycode/releases/latest/download/install | bash
```

#### Installation Directory

For local development, build and install from this repository:

```bash
make install
make easycode
make uninstall
```

The install script respects the following priority order for the installation path:

1. `$EASYCODE_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/.easycode/bin` - Default fallback

```bash
# Examples
curl -fsSL https://github.com/xLongLink/easycode/releases/latest/download/install | EASYCODE_INSTALL_DIR=$HOME/.local/bin bash
```

### Agents

easycode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

### Releases

Set the root `package.json` version to the intended stable release and push the changes to `dev`, then run `bun script/release.ts` to confirm and dispatch the release workflow. A matching `v<version>` tag also triggers it.

The workflow owns GitHub publication. For local archive preparation only, run `bun packages/cli/script/package.ts` after building the binaries. The legacy `script/publish.ts` and CLI direct-publishing script have been removed; releases do not publish workspace packages to npm.
