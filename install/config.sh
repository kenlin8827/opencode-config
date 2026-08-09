#!/usr/bin/env bash
# config.sh — bash equivalent of install/config.ps1
#
# Single source of truth for tier mapping: agent.<name>.tier (in the repo
# template). The script rewrites agent.<name>.model and
# provider.llm-router.options.{baseURL,apiKey}.
#
# Requires: bash 4+, jq, opencode (CLI; for `opencode models`)
#
# Usage:
#   ./install/config.sh                                # interactive
#   ./install/config.sh get
#   ./install/config.sh set baseURL https://api...
#   ./install/config.sh set apiKey sk-xxx
#   ./install/config.sh set model code claude-sonnet-4-5 [-p anthropic]
#   ./install/config.sh reset                           # restore baseURL/apiKey and model refs from repo template
#   ./install/config.sh set ... -t FILE                     # target a different file
#
# Interactive flow:
#   1. Pick provider from `opencode models` output.
#   2. If the chosen provider is `llm-router`, prompt for baseURL + apiKey
#      (Enter=keep current). Other providers rely on the opencode CLI's auth.
#   3. For each tier (in template order), pick a
#      model from `opencode models <provider>`. Enter keeps the current id.
#   4. Every agent whose `.model` matches `<old_provider>/<tier_name>` (current
#      value) is rewritten to `<selected_provider>/<new_model_id>` in lockstep.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$REPO_ROOT/opencode.jsonc"
TARGET="${HOME}/.config/opencode/opencode.jsonc"

# Tier names and agent -> tier mapping are derived from the repo template
# (../opencode.jsonc). The template is the single source of truth.
[[ -f "$TEMPLATE" ]] || { echo "not found: $TEMPLATE" >&2; exit 1; }

readarray -t TIER_NAMES < <(
    jq -r '.agent | to_entries[] | .value.tier' "$TEMPLATE" | awk '!seen[$0]++'
)

[[ ${#TIER_NAMES[@]} -gt 0 ]] || { echo "template $TEMPLATE defines no tiers" >&2; exit 1; }

declare -A AGENT_TIERS=()
while IFS=$'\t' read -r name tier; do
    [[ -n "$tier" ]] && AGENT_TIERS[$name]="$tier"
done < <(jq -r '.agent | to_entries[] | [.key, .value.tier] | @tsv' "$TEMPLATE")

JQ="jq"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"

mask_key() {
    local k="$1"
    [[ -z "$k" || "${#k}" -le 6 ]] && { echo "***"; return; }
    echo "${k:0:3}***${k: -3}"
}

mask_url_if_sensitive() {
    local u="$1"
    [[ -z "$u" || "$u" != *\?* ]] && { echo "$u"; return; }
    mask_key "$u"
}

# Backup then atomically replace $1 with stdin contents.
atomic_write() {
    local f="$1"
    cp "$f" "$f.bak"
    cat > "$f.tmp"
    mv "$f.tmp" "$f"
}

# --- opencode CLI helpers ----------------------------------------------

opencode_available() {
    command -v "$OPENCODE_BIN" >/dev/null 2>&1 && "$OPENCODE_BIN" models >/dev/null 2>&1
}

# Print one model id per line for provider $1 via `opencode models <provider>`.
provider_models() {
    local p="$1"
    opencode_available || return 0
    "$OPENCODE_BIN" models "$p" 2>/dev/null | awk -v p="$p/" '$1 ~ "^"p { sub("^"p"", ""); print }'
}

# Parse `opencode models` output: each line "<provider>/<model_id>". Print
# distinct provider names, sorted, one per line.
providers_from_opencode() {
    opencode_available || return 1
    # Preserve first-seen order from `opencode models`, then move llm-router
    # to the top (custom provider; most likely target for this repo).
    "$OPENCODE_BIN" models 2>/dev/null | awk -F/ '
        !seen[$1]++ { order[++n] = $1 }
        END {
            for (i = 1; i <= n; i++) if (order[i] == "llm-router") { first = i; break }
            if (first) { print order[first]; for (i = 1; i <= n; i++) if (i != first) print order[i] }
            else for (i = 1; i <= n; i++) print order[i]
        }
    '
}

# --- migration: backfill agent.tier on legacy opencode.jsonc -----------

# For any agent missing a `tier` field, fill it in from $AGENT_TIERS.
# Returns count of agents backfilled.
backfill_tier() {
    local f="$1"
    local count
    count="$($JQ '[.agent | to_entries[] | select(.value | has("tier") | not) | .key] | length' "$f")"
    [[ "$count" -eq 0 ]] && { echo 0; return; }
    # Pass AGENT_TIERS to jq as --arg K_<name> <tier>, then look up per agent.
    local args=()
    for k in "${!AGENT_TIERS[@]}"; do
        args+=(--arg "K_$k" "${AGENT_TIERS[$k]}")
    done
    $JQ "${args[@]}" '
        .agent |= with_entries(
            if .value | has("tier") then .
            else .value.tier = ($ARGS.named["K_" + .key] // null)
            end
        )
    ' "$f" | atomic_write "$f"
    echo "$count"
}

# --- agent model rewrite -----------------------------------------------

# Walk the config tree; for every agent.<name>.model where
# agent.<name>.tier == $tier, set it to $new_ref ("<p>/<id>"). Echoes count.
relink_tier() {
    local f="$1" tier="$2" new_ref="$3"
    local n
    n="$($JQ --arg t "$tier" \
        '[.agent | to_entries[] | select(.value.tier == $t)] | length' "$f")"
    [[ "$n" -eq 0 ]] && { echo 0; return; }
    # Root "model" tracks tier.default — keep it in sync so a fresh agent with
    # no `.model` falls back to the default-tier choice.
    if [[ "$tier" == "default" ]]; then
        $JQ --arg t "$tier" --arg v "$new_ref" '
            .agent |= with_entries(if .value.tier == $t then .value.model = $v else . end)
            | .model = $v
        ' "$f" | atomic_write "$f"
    else
        $JQ --arg t "$tier" --arg v "$new_ref" \
            '.agent |= with_entries(if .value.tier == $t then .value.model = $v else . end)' \
            "$f" | atomic_write "$f"
    fi
    echo "$n"
}

# --- show ---------------------------------------------------------------

show_current() {
    local f="$1"
    echo "[root + tier mapping] (current)"
    local root_model
    root_model="$($JQ -r '.model // empty' "$f")"
    [[ -z "$root_model" ]] && root_model="(unset)"
    printf '  %-9s %s  <- tracks tier.default\n' "model" "$root_model"
    for tier in "${TIER_NAMES[@]}"; do
        local ref
        ref="$($JQ -r --arg t "$tier" \
            '[.agent | to_entries[] | select(.value.tier == $t)] | first.value.model // empty' \
            "$f")"
        if [[ -n "$ref" ]]; then
            printf '  %-9s %s\n' "tier.$tier" "$ref"
        else
            printf '  %-9s (unset)\n' "tier.$tier"
        fi
    done
    echo
    echo "[provider: llm-router]"
    if ! $JQ -e '.provider["llm-router"]' "$f" >/dev/null 2>&1; then
        echo "  (provider llm-router not configured)"
    else
        local opts
        opts="$($JQ -r '.provider["llm-router"].options // {}' "$f")"
        echo "  baseURL: $(echo "$opts" | $JQ -r '.baseURL // ""' | mask_url_if_sensitive)"
        echo "  apiKey:  $(echo "$opts" | $JQ -r '.apiKey // ""' | mask_key)"
    fi
    echo
}

# --- arg parse ----------------------------------------------------------
ACTION=""
KEY=""
VALUE=""
NAME=""
TARGET_PROVIDER="llm-router"  # -p override for `set`/`reset`
while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            sed -n '2,30p' "$0"; exit 0 ;;
        -t|--target) TARGET="$2"; shift 2 ;;
        -p|--provider) TARGET_PROVIDER="$2"; shift 2 ;;
        -n|--name) NAME="$2"; shift 2 ;;
        get|reset) ACTION="$1"; shift ;;
        set)
            ACTION="set"; shift
            KEY="${1:-}"; [[ $# -gt 0 ]] && shift
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
    # interactive: pick provider, then model for each tier

    # Backfill `tier` on any agent missing it (legacy opencode.jsonc). Persist
    # immediately so subsequent operations see the right group membership.
    backfilled="$(backfill_tier "$TARGET")"
    if [[ "$backfilled" -gt 0 ]]; then
        echo "backfilled tier field on $backfilled agent(s)"
    fi

    # Show current state up front so the user knows what they're about to change.
    show_current "$TARGET"

    # Provider menu: single source = `opencode models`. llm-router is a custom
    # provider (not in models.dev); always include it if it's in the config.
    if providers_raw="$(providers_from_opencode)"; then
        mapfile -t providers < <(printf '%s\n' "$providers_raw" | awk '!seen[$0]++')
    else
        providers=()
    fi
    if ! printf '%s\n' "${providers[@]}" | grep -Fxq "llm-router"; then
        if $JQ -e '.provider["llm-router"]' "$TARGET" >/dev/null 2>&1; then
            providers=("llm-router" "${providers[@]}")
        fi
    fi

    if [[ ${#providers[@]} -eq 0 ]]; then
        echo "no providers available — run 'opencode' first to authenticate, then re-run" >&2
        exit 1
    fi

    echo "[providers]"
    for i in "${!providers[@]}"; do
        printf "  %2d) %s\n" "$((i+1))" "${providers[$i]}"
    done

    default_idx=0
    for i in "${!providers[@]}"; do
        [[ "${providers[$i]}" == "$TARGET_PROVIDER" ]] && { default_idx="$i"; break; }
    done

    # Use plain read (no subshell) so trailing whitespace and Ctrl-D propagate correctly
    printf 'pick provider (1-%d) [Enter=%s]: ' "${#providers[@]}" "${providers[$default_idx]}"
    if ! read -r pick; then echo; exit 0; fi
    if [[ -z "$pick" ]]; then
        selected="${providers[$default_idx]}"
    elif [[ "$pick" =~ ^[0-9]+$ ]] && (( pick >= 1 && pick <= ${#providers[@]} )); then
        selected="${providers[$((pick-1))]}"
    else
        echo "invalid selection: $pick" >&2; exit 1
    fi

    # Credentials: only ask for llm-router. Other providers rely on opencode CLI auth.
    changed=0
    if [[ "$selected" == "llm-router" ]]; then
        echo
        echo "[llm-router credentials]"
        if ! $JQ -e '.provider["llm-router"]' "$TARGET" >/dev/null 2>&1; then
            echo "warning: provider.llm-router is missing from opencode.jsonc — please re-install" >&2
            exit 1
        fi
        if ! $JQ -e '.provider["llm-router"].options' "$TARGET" >/dev/null 2>&1; then
            $JQ '.provider["llm-router"].options = {}' "$TARGET" | atomic_write "$TARGET"
        fi
        for k in baseURL apiKey; do
            existing="$($JQ -r --arg k "$k" '.provider["llm-router"].options[$k] // ""' "$TARGET")"
            if [[ "$k" == "apiKey" ]]; then
                shown="$(mask_key "$existing")"
            else
                shown="$(mask_url_if_sensitive "$existing")"
            fi
            printf '%s (%s) (Enter=keep): ' "$k" "$shown"
            if ! read -r v; then echo; continue; fi
            [[ -z "$v" ]] && continue
            $JQ --arg k "$k" --arg v "$v" '.provider["llm-router"].options[$k] = $v' "$TARGET" | atomic_write "$TARGET"
            changed=1
        done
    fi

    # per-tier model picker for the selected provider.
    mapfile -t provider_models_list < <(provider_models "$selected")
    if [[ ${#provider_models_list[@]} -eq 0 ]]; then
        echo "'opencode models $selected' returned nothing — choose a different provider" >&2
        exit 1
    fi
    echo
    echo "[models for provider: $selected]"
    relinked=0
    for tier in "${TIER_NAMES[@]}"; do
        echo
        echo "--- tier.$tier ---"
        current_ref="$($JQ -r --arg t "$tier" \
            '[.agent | to_entries[] | select(.value.tier == $t)] | first.value.model // empty' \
            "$TARGET")"
        if [[ -n "$current_ref" ]]; then
            echo "current: $current_ref"
        else
            echo "current: (unset)"
        fi

        for i in "${!provider_models_list[@]}"; do
            printf '  %2d) %s\n' "$((i+1))" "${provider_models_list[$i]}"
        done
        printf 'pick model for tier.%s (1-%d, Enter=keep): ' "$tier" "${#provider_models_list[@]}"
        if ! read -r v; then echo; continue; fi
        [[ -z "$v" ]] && continue

        if [[ "$v" =~ ^[0-9]+$ ]] && (( v >= 1 && v <= ${#provider_models_list[@]} )); then
            new_id="${provider_models_list[$((v-1))]}"
        else
            echo "invalid selection: $v (must be 1-${#provider_models_list[@]})" >&2
            exit 1
        fi

        new_ref="$selected/$new_id"
        if [[ "$current_ref" != "$new_ref" ]]; then
            relinked=$((relinked + $(relink_tier "$TARGET" "$tier" "$new_ref")))
        fi
        changed=1
    done

    if [[ $changed -gt 0 ]]; then
        echo
        echo "saved (relinked $relinked agent ref(s))"
    else
        echo "no changes"
    fi
    exit 0
fi

case "$ACTION" in
    get)
        backfilled="$(backfill_tier "$TARGET")"
        [[ "$backfilled" -gt 0 ]] && echo "backfilled tier field on $backfilled agent(s)"
        show_current "$TARGET"
        ;;
    reset)
        if ! $JQ -e --arg p "$TARGET_PROVIDER" '.provider[$p]' "$TARGET" >/dev/null 2>&1; then
            echo "provider.$TARGET_PROVIDER not configured" >&2; exit 1
        fi
        for k in baseURL apiKey; do
            v="$($JQ -r --arg p "$TARGET_PROVIDER" --arg k "$k" '.provider[$p].options[$k] // ""' "$TEMPLATE")"
            if [[ -n "$v" ]]; then
                $JQ --arg p "$TARGET_PROVIDER" --arg k "$k" --arg v "$v" \
                    '.provider[$p].options[$k] = $v' "$TARGET" | atomic_write "$TARGET"
            fi
        done
        # Restore model refs from the template (source of truth for tier -> model mapping).
        root_model="$($JQ -r '.model // ""' "$TEMPLATE")"
        if [[ -n "$root_model" ]]; then
            $JQ --arg v "$root_model" '.model = $v' "$TARGET" | atomic_write "$TARGET"
        fi
        while IFS=$'\t' read -r name src_model; do
            [[ -z "$src_model" ]] && continue
            $JQ --arg n "$name" --arg v "$src_model" \
                '.agent[$n].model = $v' "$TARGET" | atomic_write "$TARGET"
        done < <($JQ -r '.agent | to_entries[] | [.key, .value.model // ""] | @tsv' "$TEMPLATE")
        echo "reset credentials and model refs from template"
        ;;
    set)
        [[ -z "$KEY" ]] && { echo "set requires <key> <value>" >&2; exit 1; }
        if [[ -z "$VALUE" ]]; then
            echo "skipped (empty value)"
            exit 0
        fi
        if [[ "$KEY" == "model" ]]; then
            [[ " ${TIER_NAMES[*]} " != *" $NAME "* ]] && {
                echo "unknown tier: $NAME (one of: ${TIER_NAMES[*]})" >&2; exit 1
            }
            new_ref="$TARGET_PROVIDER/$VALUE"
            n="$(relink_tier "$TARGET" "$NAME" "$new_ref")"
            [[ "$n" -eq 0 ]] && { echo "no agent currently uses tier $NAME" >&2; exit 1; }
            echo "tier.$NAME -> $new_ref ($n agent(s) updated)"
        else
            if ! $JQ -e --arg p "$TARGET_PROVIDER" '.provider[$p]' "$TARGET" >/dev/null 2>&1; then
                echo "provider.$TARGET_PROVIDER not configured — run: config.sh (interactive)" >&2
                exit 1
            fi
            $JQ --arg p "$TARGET_PROVIDER" --arg k "$KEY" --arg v "$VALUE" \
                '.provider[$p].options[$k] = $v' "$TARGET" | atomic_write "$TARGET"
            if [[ "$KEY" == "apiKey" ]]; then
                echo "$KEY set ($(mask_key "$VALUE"))"
            else
                echo "$KEY set"
            fi
        fi
        ;;
esac