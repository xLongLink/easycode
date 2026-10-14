if [[ $- == *i* ]] && [[ -o emacs ]]; then
    _text_ai_launcher="${BASH_SOURCE[0]%/*}/launch.js"

    text_ai() {
        bun "$_text_ai_launcher" "$1" "$2" "$3"
    }

    text_before_submit() {
        [[ -n "$1" ]] || return 0
        local line="${1#"${1%%[![:space:]]*}"}"
        [[ -n "$line" ]] || return 0
        local first="${line%%[[:space:];|&<>]*}"
        local executable="$first"
        case "$first" in
            \"*\"|\'*\') executable="${first:1:${#first}-2}" ;;
        esac
        case "$first" in
            cmd|/*|./*|../*|\~/*|\#*|\$*) return 0 ;;
        esac
        if command -v -- "$executable" >/dev/null 2>&1 ||
            [[ "$line" =~ ^[a-zA-Z_][a-zA-Z0-9_]*= ]] ||
            [[ "$line" == \(* || "$line" == \<* || "$line" == \>* ]]; then
            return 0
        fi
        return 1
    }

    text_handle_enter() {
        bind '"\C-x\C-h":"\C-j"'
        if text_before_submit "$READLINE_LINE"; then
            local line="${READLINE_LINE#"${READLINE_LINE%%[![:space:]]*}"}"
            if [[ "$line" == cmd || "$line" == cmd[[:space:]]* ]]; then
                line="${line#cmd}"
                READLINE_LINE="${line#"${line%%[![:space:]]*}"}"
                READLINE_POINT=${#READLINE_LINE}
            fi
            return
        fi
        bind '"\C-x\C-h":""'
        local message="$READLINE_LINE"
        local prompt="${PS1@P}"
        prompt="${prompt//$'\001'/}"
        prompt="${prompt//$'\002'/}"
        printf '%s%s\n' "$prompt" "$message"
        [[ -o history ]] && history -s "$message"
        READLINE_LINE=''
        READLINE_POINT=0
        if [[ -z "${_text_session:-}" ]]; then
            if ! _text_session=$(bun "$_text_ai_launcher" --new-session-id); then
                return
            fi
            _text_directory="$PWD"
        fi
        text_ai "$_text_session" "$_text_directory" "$message"
    }

    bind -x '"\C-x\C-g":text_handle_enter'
    bind '"\C-x\C-h":"\C-j"'
    bind '"\C-m":"\C-x\C-g\C-x\C-h"'
fi
