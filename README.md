# easycode

An open source AI coding agent with a core runtime and terminal UI, based on OpenCode.

---

### Installation

```bash
curl -fsSL https://github.com/xLongLink/easycode/releases/latest/download/install | bash
```

#### Installation Directory

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

Learn more about [agents](https://opencode.ai/docs/agents).

### Releases

The initial easycode version is **0.0.0**. Push a matching `v0.0.0` tag or run
**Release easycode** in GitHub Actions with version `0.0.0`. The workflow checks
the repository, builds binaries for Linux and macOS, and publishes a
GitHub Release with the installer and `SHA256SUMS`. Binaries are not signed or
notarized. No npm packages are published.

For subsequent releases, update the root and CLI package versions before tagging.

The command is `easycode`. Runtime data is isolated under the `easycode` XDG
directories. Existing `opencode.json(c)`, `.opencode` project configuration,
`OPENCODE_*` runtime variables, and internal `@opencode/*` imports remain
compatible; existing OpenCode data is not migrated automatically.
