#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
    install|uninstall) ;;
    *) printf 'Usage: %s install|uninstall\n' "$0" >&2; exit 1 ;;
esac

root="$(cd "$(dirname "$0")" && pwd)"
data="${XDG_DATA_HOME:-$HOME/.local/share}/uncode"
hook="$data/text/hook.sh"
rc="$HOME/.bashrc"
start='# >>> easycode text hook >>>'
end='# <<< easycode text hook <<<'
legacy_start='# >>> uncode bash input hook >>>'
legacy_end='# <<< uncode bash input hook <<<'

if [[ "$1" == install ]]; then
    command -v bun >/dev/null || { printf 'Install Bun first: https://bun.sh\n' >&2; exit 1; }
    opencode="$(command -v -- "${OPENCODE_BIN:-opencode}" || true)"
    if [[ "$opencode" != /* || ! -x "$opencode" ]]; then
        printf 'Installed OpenCode not found. Put it on PATH or set OPENCODE_BIN to its absolute path.\n' >&2
        exit 1
    fi
fi

if [[ -e "$rc" || "$1" == install ]]; then
    temp=$(mktemp "${rc}.text.XXXXXX")
    trap 'rm -f "$temp"' EXIT
    if [[ -e "$rc" ]]; then
        if ! awk -v start="$start" -v end="$end" -v legacy_start="$legacy_start" -v legacy_end="$legacy_end" '
            $0 == start { closing = end; next }
            $0 == legacy_start { closing = legacy_end; next }
            closing && $0 == closing { closing = ""; next }
            !closing { print }
            END { if (closing) exit 1 }
        ' "$rc" > "$temp"; then
            printf 'Unterminated text/legacy hook block in %s; leaving it unchanged.\n' "$rc" >&2
            exit 1
        fi
    fi
    if [[ "$1" == install ]]; then
        mkdir -p "$(dirname "$hook")"
        install -m 644 "$root/hook.sh" "$hook"
        install -m 644 "$root/launch.js" "$(dirname "$hook")/launch.js"
        bun "$root/setup.js" "$opencode" "$(dirname "$hook")/config.json"
        printf '%s\n' "$start" >> "$temp"
        printf 'if [[ -r %q ]]; then source %q; fi\n' "$hook" "$hook" >> "$temp"
        printf '%s\n' "$end" >> "$temp"
    fi
    cat "$temp" > "$rc"
fi

# Remove only the files owned by the previous checkout-based Bash integration.
rm -f "$data/bash-hook.sh" "$data/bash-ai.sh" "$data/bash-classify.js"
if [[ "$1" == uninstall ]]; then
    rm -f "$hook" "$(dirname "$hook")/launch.js" "$(dirname "$hook")/config.json"
    rmdir "$(dirname "$hook")" 2>/dev/null || true
fi
printf 'Text integration %sed. Open a new Bash terminal to apply it.\n' "$1"
if [[ "$1" == install ]]; then printf 'Connected executable: %s\n' "$opencode"; fi
