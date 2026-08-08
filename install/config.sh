#!/usr/bin/env bash
# config.sh — bash equivalent of install/config.ps1
#
# Requires: bash 4+, jq
#
# Usage:
#   ./install/config.sh                              # interactive
#   ./install/config.sh get
#   ./install/config.sh set baseURL https://api...
#   ./install/config.sh set apiKey sk-xxx
#   ./install/config.sh set model advisor my-adv-v2
#   ./install/config.sh reset
#   ./install/config.sh set baseURL ... -t FILE       # target a different file

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$REPO_ROOT/opencode.json"
TARGET="${HOME}/.config/opencode/opencode.json"

PROVIDER="llm-router"
CRED_KEYS=("baseURL" "apiKey")
MODEL_NAMES=("default" "code" "advisor" "explorer" "vision")

mask_key() {
    local k="$1"
    [[ -z "$k" || "${#k}" -le 6 ]] && { echo "***"; return; }
    echo "${k:0:3}***${k: -3}"
}

show_current() {
    local j opts mname mid
    j="$(jq -r --arg p "$PROVIDER" '.provider[$p]' "$1")"
    opts="$(echo "$j" | jq -r '.options // {}')"
    echo "baseURL: $(echo "$opts" | jq -r '.baseURL // ""')"
    echo "apiKey:  $(echo "$opts" | jq -r '.apiKey // ""' | mask_key)"
    for m in "${MODEL_NAMES[@]}"; do
        mid="$(echo "$j" | jq -r --arg n "$m" '.models[$n].id // ""')"
        echo "model.$m: $mid"
    done
}

# args: file, kind (cred|model), value, name (model only)
# returns 0 on apply, 1 on skip (empty value)
apply_set() {
    local f="$1" kind="$2" value="$3" name="${4:-}"
    [[ -z "$value" ]] && return 1

    case "$kind" in
        baseURL|apiKey)
            jq --arg p "$PROVIDER" --arg k "$kind" --arg v "$value" \
               '.provider[$p].options[$k] = $v' "$f" > "$f.tmp"
            mv "$f.tmp" "$f"
            ;;
        model)
            [[ -z "$name" ]] && { echo "set model requires -n (one of: ${MODEL_NAMES[*]})" >&2; exit 1; }
            jq --arg p "$PROVIDER" --arg n "$name" --arg v "$value" \
               '.provider[$p].models[$n].id = $v' "$f" > "$f.tmp"
            mv "$f.tmp" "$f"
            ;;
        *) echo "unknown key: $kind (use baseURL, apiKey, or model)" >&2; exit 1 ;;
    esac
}

# --- arg parse ----------------------------------------------------------
ACTION=""
KEY=""
VALUE=""
NAME=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            sed -n '2,20p' "$0"; exit 0 ;;
        -t|--target) TARGET="$2"; shift 2 ;;
        -n|--name) NAME="$2"; shift 2 ;;
        get|reset) ACTION="$1"; shift ;;
        set)
            ACTION="set"; shift
            KEY="${1:-}"; [[ $# -gt 0 ]] && shift
            # For 'set model', KEY=model, next arg is the model name (NAME),
            # then the actual value. For creds, VALUE is just the next arg.
            if [[ "$KEY" == "model" ]]; then
                NAME="${1:-}"; [[ $# -gt 0 ]] && shift
            fi
            VALUE="${1:-}"; [[ $# -gt 0 ]] && shift
            ;;
        *) echo "unknown arg: $1" >&2; exit 1 ;;
    esac
done

[[ -f "$TARGET" ]] || { echo "not found: $TARGET" >&2; exit 1; }

# --- main ---------------------------------------------------------------
if [[ -z "$ACTION" ]]; then
    # interactive — empty line = skip
    # ponytail: use plain read (no subshell) so trailing whitespace and Ctrl-D propagate correctly
    show_current "$TARGET"
    echo
    changed=0
    for k in "${CRED_KEYS[@]}"; do
        existing="$(jq -r --arg p "$PROVIDER" --arg k "$k" '.provider[$p].options[$k] // ""' "$TARGET")"
        if [[ "$k" == "apiKey" ]]; then
            prompt="$k ($(mask_key "$existing"))"
        else
            prompt="$k ($existing)"
        fi
        printf '%s (Enter=keep): ' "$prompt"
        if ! read -r v; then echo; continue; fi
        if apply_set "$TARGET" "$k" "$v" ""; then changed=$((changed+1)); fi
    done
    for m in "${MODEL_NAMES[@]}"; do
        existing="$(jq -r --arg p "$PROVIDER" --arg n "$m" '.provider[$p].models[$n].id // ""' "$TARGET")"
        printf 'model.%s (%s) (Enter=keep): ' "$m" "$existing"
        if ! read -r v; then echo; continue; fi
        if apply_set "$TARGET" "model" "$v" "$m"; then changed=$((changed+1)); fi
    done
    if [[ $changed -gt 0 ]]; then
        echo "saved $changed field(s)"
    else
        echo "no changes"
    fi
    exit 0
fi

case "$ACTION" in
    get) show_current "$TARGET" ;;
    reset)
        for k in "${CRED_KEYS[@]}"; do
            v="$(jq -r --arg p "$PROVIDER" --arg k "$k" '.provider[$p].options[$k] // ""' "$TEMPLATE")"
            apply_set "$TARGET" "$k" "$v" ""
        done
        for m in "${MODEL_NAMES[@]}"; do
            v="$(jq -r --arg p "$PROVIDER" --arg n "$m" '.provider[$p].models[$n].id // ""' "$TEMPLATE")"
            apply_set "$TARGET" "model" "$v" "$m"
        done
        echo "reset to template defaults"
        ;;
    set)
        [[ -z "$KEY" ]] && { echo "set requires <key> <value>" >&2; exit 1; }
        if [[ -z "$VALUE" ]]; then
            echo "skipped (empty value)"
            exit 0
        fi
        apply_set "$TARGET" "$KEY" "$VALUE" "$NAME"
        case "$KEY" in
            apiKey) echo "$KEY set ($(mask_key "$VALUE"))" ;;
            model)  echo "$KEY set ($NAME = $VALUE)" ;;
            *)      echo "$KEY set" ;;
        esac
        ;;
esac