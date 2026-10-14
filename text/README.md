# Text

Standalone Bash integration using upstream [Pi](https://github.com/earendil-works/pi).
No bundled AI runtime, local AI model, or API server setup.

```sh
bun run up:text
bun run down:text
```

Run from the repository root. Requires Bun and Bash 4.4+ with Emacs
editing mode. When Pi is absent, setup uses Bun to install
`@earendil-works/pi-coding-agent@1.2.0` under `~/.local` with lifecycle scripts
disabled. No sudo is needed. Existing Pi installations are reused, not upgraded.
Node-shebang Pi executables run with Bun, so Node.js and npm are not required.
Run `bun ~/.local/bin/pi` and use `/login` to configure your preferred provider before chatting.
Make targets remain available; inside `text/`, use `bun run up` or `bun run down`.

Setup resolves `pi` on PATH or under `~/.local/bin`. To select a specific installation:

```sh
PI_BIN="$HOME/.local/bin/pi" bun run up:text
```

Open a **new Bash terminal**, then use the normal prompt:

```text
$ git status
…normal command output…
$ explain the files in this directory
…Pi's answer…
$ what should I change first?
…answer continuing this terminal's conversation…
```

Known executables, aliases, functions, builtins, and recognized shell syntax run
normally. Other text goes to `pi --print --session-id <id> --thinking high`, which
runs once and prints the final response. A small `AI thinking...` spinner is shown
in the terminal while Pi is working, then cleared before the response is printed.
Each terminal gets a unique session; its working directory is the directory of its
first message, even after `cd`.
Pi handles provider configuration and session persistence. **Pi has no built-in
tool permission system:** it can read/write files and run commands with your
user's permissions. Use a sandbox if you need stronger isolation.

Routing is a convenience, not a Bash parser: `find` is treated as a command and a
typo such as `gti status` is treated as an AI message. Prefix a line with `cmd` to
force shell execution (`cmd gti status`). `text`, `voice`, and other existing shell
commands are not intercepted. Voice pastes text but does not submit it.

The installer copies the hook and TypeScript launcher to
`${XDG_DATA_HOME:-~/.local/share}/uncode/text` and adds one marked block to
`~/.bashrc`. It replaces the previous checkout-based hook and removes that hook's
launcher/classifier files, without touching other shell settings or OpenCode
configuration, credentials, or session data. Reinstalling does not duplicate blocks.
The installed integration does not depend on this checkout remaining in place.

Uninstall removes the copied files and marked Bash block, retaining Pi and its
credentials and sessions in `~/.pi`. Open a new Bash terminal
afterwards. To start a new AI conversation, open a new terminal.

Tests: `bun run test:text` from the repository root; these never contact an AI provider.
