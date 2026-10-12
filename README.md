# easycode

An open source AI coding agent with a core runtime and terminal UI, based on OpenCode.


### Installation

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
