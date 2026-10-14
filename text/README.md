# Text

Standalone Bash integration using your **already-installed OpenCode**. No bundled
OpenCode runtime, local AI model, API server setup, or npm dependencies.

```sh
make up:text
make down:text
```

Run from the repository root. Requires Bun and Bash 4.4+ with Emacs
editing mode. OpenCode must already be configured with your preferred provider.
No sudo is needed.

Setup resolves `opencode` on PATH. To select a specific installation:

```sh
OPENCODE_BIN="$HOME/.opencode/bin/opencode" make up:text
```

Open a **new Bash terminal**, then use the normal prompt:

```text
$ git status
…normal command output…
$ explain the files in this directory
…OpenCode's answer…
$ what should I change first?
…answer continuing this terminal's conversation…
```

Known executables, aliases, functions, builtins, and recognized shell syntax run
normally. Other text goes to `opencode run --thinking`, showing thinking blocks
when the selected model/provider supplies them. Each terminal gets a unique session;
its working directory is the directory of its first message, even after `cd`.
OpenCode handles its own connection, provider configuration, permissions, and
questions. The hook does not auto-approve tool permissions.

Routing is a convenience, not a Bash parser: `find` is treated as a command and a
typo such as `gti status` is treated as an AI message. Prefix a line with `cmd` to
force shell execution (`cmd gti status`). `text`, `voice`, and other existing shell
commands are not intercepted. Voice pastes text but does not submit it.

The installer copies the hook and JavaScript launcher to
`${XDG_DATA_HOME:-~/.local/share}/uncode/text` and adds one marked block to
`~/.bashrc`. It replaces the previous checkout-based hook and removes that hook's
launcher/classifier files, without touching other shell settings or OpenCode
configuration, credentials, or session data. Reinstalling does not duplicate blocks.
The installed integration does not depend on this checkout remaining in place.

Uninstall removes the copied files and marked Bash block. Open a new Bash terminal
afterwards. To start a new AI conversation, open a new terminal.

Tests: `make test:text` from the repository root; these never contact an AI provider.
