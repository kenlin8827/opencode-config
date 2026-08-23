#!/usr/bin/env bash
# install.sh — bash equivalent of install/install.ps1
#
# Requires: bash 4+, jq, coreutils
# Install jq:  sudo apt install jq   |   brew install jq
#
# Usage:
#   ./install/install.sh                # install (default)
#   ./install/install.sh generate       # generate manifest only
#   ./install/install.sh status         # show installed vs repo
#   ./install/install.sh install -f     # force reinstall same version
#   ./install/install.sh install -t DIR # target a different directory
#   Component switches (rtk, MCPs, external plugins) live in
#   install/options.jsonc — the single source of truth; it overwrites the
#   target on every install. Edit the file, then re-run install.
#   ./install/install.sh init           # backup + clear target (fresh start)
#   ./install/install.sh init --no-backup  # clear without backup
#   ./install/install.sh init -y        # skip confirmation prompt
#   ./install/install.sh uninstall      # remove installed files (precise, manifest-driven)
#   ./install/install.sh uninstall -y   # skip confirmation prompt
#   ./install/install.sh register       # install global shim to ~/.local/bin
#   ./install/install.sh unregister     # remove global shim
#
# Typically invoked via the global `opencode-config` command (after
# `register`). All modes mirror install.ps1.

set -eo pipefail

# --- locate paths -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="${HOME}/.config/opencode"
VERSION_FILE="$SCRIPT_DIR/VERSION"
INST_DIR="$SCRIPT_DIR/versions"
MARKER=".CONFIG_VERSION"
# Default directory for the global `opencode-config` shim. $OPENCODE_BIN_DIR
# overrides; --bin-dir overrides the env.
BIN_DIR="${OPENCODE_BIN_DIR:-$HOME/.local/bin}"

# Whitelist of runtime paths; nothing else ships.
# providers/ ships as merge sources: install folds each providers/*.json into
# opencode.jsonc's `provider` node (see merge_providers). options.jsonc
# stays in install/ and NEVER ships to the target — apply_options reads it
# in place and applies its switches to opencode.jsonc.
INCLUDE_PREFIXES=("agents/" "commands/" "plugins/" "instructions/" "opencode.jsonc" "tui.json" "tiers.json" "profiles/" "providers/")
PRESERVE_KEYS=("baseURL" "apiKey")

# rtk (https://github.com/rtk-ai/rtk) — CLI proxy that compresses command
# output before it reaches the LLM (60-90% smaller bash output). Install
# provisions it out of the box: if the binary is missing it's downloaded
# into ~/.local/bin (PATH note printed when needed). The opencode
# integration ships in-tree as plugins/openrtk.ts (vendored openrtk) —
# no `rtk init` step; the official rtk.ts plugin is removed if present.
RTK_VERSION="0.45.0"

# --- arg parse ----------------------------------------------------------
MODE="install"
FORCE=0
NO_BACKUP=0
YES=0
# rtk decision from options.jsonc (apply_options overrides; 1 = enabled)
OPT_RTK=1
while [[ $# -gt 0 ]]; do
    case "$1" in
        generate|status|install|init|uninstall|register|unregister) MODE="$1"; shift ;;
        -f|--force) FORCE=1; shift ;;
        --no-backup) NO_BACKUP=1; shift ;;
        -y|--yes) YES=1; shift ;;
        -t|--target) TARGET="$2"; shift 2 ;;
        --bin-dir) BIN_DIR="$2"; shift 2 ;;
        -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
        *) echo "unknown arg: $1" >&2; exit 1 ;;
    esac
done

# --- helpers ------------------------------------------------------------
read_version() {
    if [[ -f "$VERSION_FILE" ]]; then
        head -1 "$VERSION_FILE" | tr -d '\r\n '
    else
        git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown"
    fi
}

read_manifest() {
    [[ -f "$1" ]] || return 0
    grep -v '^\s*#' "$1" | grep -v '^\s*$' | sed 's/\\/\//g' | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

read_installed_version() {
    local f="$TARGET/$MARKER"
    [[ -f "$f" ]] || return 1
    head -1 "$f" | tr -d '\r\n '
}

write_marker() {
    mkdir -p "$TARGET"
    printf '%s' "$1" > "$TARGET/$MARKER"
}

# generates the manifest for the current version (must NOT already exist)
generate_manifest() {
    gen_ver="$1"
    gen_out="$INST_DIR/$gen_ver.manifest.txt"
    mkdir -p "$INST_DIR"
    : > "$gen_out"
    while IFS= read -r -d '' file; do
        gen_rel="${file#"$REPO_ROOT"/}"
        gen_rel="${gen_rel//\\//}"
        gen_include=0
        for p in "${INCLUDE_PREFIXES[@]}"; do
            [[ "$gen_rel" == "${p%/}" || "$gen_rel" == "$p"* ]] && gen_include=1 && break
        done
        [[ $gen_include -eq 1 ]] && printf '%s\n' "$gen_rel" >> "$gen_out"
    done < <(find "$REPO_ROOT" -type f -print0 | sort -z)
    gen_n=$(wc -l < "$gen_out" | tr -d ' ')
    echo "wrote install/versions/$gen_ver.manifest.txt ($gen_n files)"
    unset gen_ver gen_out gen_rel gen_include gen_n
}

# removes every file listed on stdin from $TARGET (skips the marker itself)
remove_manifest_files() {
    rm_label="$1"; shift
    rm_base="$1"; shift
    rm_any=0
    while IFS= read -r f; do
        [[ -z "$f" || "$f" == "$MARKER" ]] && continue
        rm_p="$rm_base/$f"
        if [[ -e "$rm_p" ]]; then
            rm -rf "$rm_p"
            echo "[$rm_label] rm $f"
            rm_any=1
        fi
    done
    [[ $rm_any -eq 0 ]] && echo "[$rm_label] no files to remove"
    unset rm_label rm_base rm_any rm_p
}

# copies every file in $1 from $2 to $3
copy_manifest_files() {
    cp_from="$1"; shift
    cp_to="$1"; shift
    cp_label="$1"; shift
    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        cp_src="$cp_from/$f"
        cp_dst="$cp_to/$f"
        if [[ ! -e "$cp_src" ]]; then
            echo "WARN [$cp_label] missing source: $f" >&2
            continue
        fi
        mkdir -p "$(dirname "$cp_dst")"
        cp -R "$cp_src" "$cp_dst"
        echo "[$cp_label] cp $f"
    done
    unset cp_from cp_to cp_label cp_src cp_dst
}

# snapshots user state from the target before the copy overwrites it:
# provider credentials, root model, and per-tier model refs (agents of a
# tier share one ref — same tier semantics as the /profile plugin).
# Option switches are NOT snapshotted — the repo's install/options.jsonc
# is the single source of truth and overwrites the target on every install.
# Agent→tier mapping: agent-level `tier` fields are gone (opencode forwards
# unknown agent fields to the provider as model options — strict gateways
# reject them). The mapping now lives in tiers.json; the snapshot reads the
# target's copy, falling back to the repo's for pre-migration targets, and a
# legacy agent-level tier field still wins for agents it lists.
# outputs a JSON object: {creds: [...], rootModel: "...", tiers: {...}}
read_preserve() {
    rp_f="$1/opencode.jsonc"
    # fresh target: emit the empty bag so callers can --argjson it unconditionally
    [[ -f "$rp_f" ]] || { echo '{"creds":[],"rootModel":null,"tiers":{}}'; unset rp_f; return 0; }
    rp_tm="$1/tiers.json"
    rp_tm_tmp=""
    if [[ ! -f "$rp_tm" ]]; then rp_tm="$REPO_ROOT/tiers.json"; fi
    if [[ ! -f "$rp_tm" ]]; then rp_tm_tmp="$(mktemp)"; echo '{}' > "$rp_tm_tmp"; rp_tm="$rp_tm_tmp"; fi
    # strip comment lines so plain jq can parse the JSONC
    grep -v '^[[:space:]]*//' "$rp_f" | jq -c --slurpfile tm "$rp_tm" '
        ($tm[0] // {}) as $map |
        {
          creds: [ .provider // {} | to_entries[] as $p |
                   ($p.value.options // {}) | to_entries[] |
                   select(.key == "baseURL" or .key == "apiKey") |
                   {provider: $p.key, key: .key, value: .value} ],
          rootModel: (.model // null),
          tiers: ([ .agent // {} | to_entries[] |
                    (.value.tier // $map[.key] // null) as $tier |
                    select($tier != null and (.value.model // null) != null) |
                    {($tier): .value.model} ] | add // {})
        }
    ' 2>/dev/null || echo '{"creds":[],"rootModel":null,"tiers":{}}'
    [[ -n "$rp_tm_tmp" ]] && rm -f "$rp_tm_tmp"
    unset rp_f rp_tm rp_tm_tmp
}

# restores preserved credentials + model picks into the freshly-copied opencode.jsonc.
# mcp/plugin switches are NOT restored here — apply_options owns them via
# the repo's options.jsonc.
# reads the JSON object from stdin
restore_preserve() {
    rp_dst="$1"
    rp_f="$rp_dst/opencode.jsonc"
    rp_bag_file="$(mktemp)"
    cat > "$rp_bag_file"
    rp_tmp="$(mktemp)"
    # Agent→tier comes from the freshly-copied target tiers.json (the new
    # manifest ships it); a legacy agent-level tier field still fills in.
    rp_tm="$rp_dst/tiers.json"
    rp_tm_tmp=""
    if [[ ! -f "$rp_tm" ]]; then rp_tm_tmp="$(mktemp)"; echo '{}' > "$rp_tm_tmp"; rp_tm="$rp_tm_tmp"; fi
    jq --slurpfile b "$rp_bag_file" --slurpfile tm "$rp_tm" '
        ($b[0].creds // []) as $c |
        ($b[0].tiers // {}) as $t |
        ($tm[0] // {}) as $map |
        reduce ($c[] | .provider) as $pn (.;
            .provider[$pn] //= {} |
            .provider[$pn].options //= {} |
            reduce ($c[] | select(.provider == $pn) | .key) as $k (.;
                .provider[$pn].options[$k] = ($c | map(select(.provider == $pn and .key == $k))[0].value)
            )
        )
        | (if ($b[0].rootModel // null) != null then .model = $b[0].rootModel else . end)
        | (if ($t | length) > 0 and ((.agent // {}) | length) > 0 then
             .agent |= with_entries(
                 (.key) as $aname
                 | (.value.tier // $map[$aname] // "") as $tier
                 | if ($t | has($tier)) then .value.model = $t[$tier] else . end)
           else . end)
    ' "$rp_f" | style_json > "$rp_tmp"
    mv "$rp_tmp" "$rp_f"
    rm -f "$rp_bag_file"
    [[ -n "$rp_tm_tmp" ]] && rm -f "$rp_tm_tmp"
    unset rp_dst rp_f rp_bag_file rp_tmp rp_tm rp_tm_tmp
}

# Pretty-prints JSON (stdin -> stdout) while keeping every provider model
# entry on one line, mirroring providers/*.json and the hand-written
# opencode.jsonc — plain jq expands each model into ~15 lines.
# Trick: jq stringifies model entries (tojson), pretty-prints, then awk
# strips the string wrapper back off exactly those lines. Wrapper detection
# uses index() instead of a regex: mawk/busybox awk interpret `\\"` inside
# a bracket/escaped pattern differently, which silently ate the key's
# closing quote and corrupted the output.
style_json() {
    jq '.provider |= with_entries(.value.models? |= with_entries(.value |= tojson))' \
    | awk '
        index($0, "\": \"{\\\"") > 0 && $0 ~ /}"[,]?$/ {
            # strip only the string-wrapper quotes (the old sub(/": "\{/)
            # variant also ate the closing quote of the key, corrupting output)
            sub(/"\{/, "{")
            if (!sub(/}",$/, "},")) sub(/}"$/, "}")
            gsub(/\\"/, "\"")
            # re-add the spaces the repo style uses ({ "name": "...", ... })
            gsub(/,"/, ", \"")
            gsub(/":/, "\": ")
            gsub(/\{/, "{ ")
            gsub(/\}/, " }")
            print; next
        }
        { print }
    '
}

# Merges providers/*.json definitions into opencode.jsonc's `provider` node:
# extract the existing node, layer shipped definitions on top (repo wins per
# provider key — user-added providers we don't ship survive), overwrite-write.
# Runs BEFORE restore_preserve so preserved baseURL/apiKey still land on top
# of any {env:...} placeholders the shipped definitions carry.
merge_providers() {
    mp_dst="$1"
    mp_cfg="$mp_dst/opencode.jsonc"
    mp_dir="$mp_dst/providers"
    if [[ ! -f "$mp_cfg" || ! -d "$mp_dir" ]]; then
        unset mp_dst mp_cfg mp_dir
        return 0
    fi
    # slurp every providers/*.json and fold them into one provider map
    mp_defs="$(cat "$mp_dir"/*.json 2>/dev/null | jq -s 'reduce .[] as $d ({}; . * $d)' 2>/dev/null || echo '{}')"
    mp_count="$(jq 'length' <<< "$mp_defs" 2>/dev/null || echo 0)"
    if [[ $mp_count -gt 0 ]]; then
        mp_tmp="$(mktemp)"
        grep -v '^[[:space:]]*//' "$mp_cfg" | jq --argjson defs "$mp_defs" '.provider = ((.provider // {}) + $defs)' | style_json > "$mp_tmp"
        mv "$mp_tmp" "$mp_cfg"
        echo "[cur: $VER] merged $mp_count provider(s) from providers/ into opencode.jsonc"
    fi
    unset mp_dst mp_cfg mp_dir mp_defs mp_count mp_tmp
}

# Provisions rtk out of the box: download the pinned release into
# ~/.local/bin when no rtk is on PATH (SHA256-verified). The opencode hook
# is the vendored openrtk plugin (plugins/openrtk.ts, shipped with the
# config copy) — this function only removes a leftover official rtk.ts
# plugin so commands aren't rewritten twice. Any failure only warns —
# install itself never fails because of rtk.
# Requires: curl, tar; sha256 verification uses sha256sum or shasum.
# NOTE: inlined PATH check (path_contains is defined later in this file).
ensure_rtk() {
    rtk_path_ok() {
        local IFS=':' d; for d in $PATH; do [[ "$d" == "$1" ]] && return 0; done; return 1
    }
    if [[ $OPT_RTK -eq 0 ]]; then
        # switched off in options.jsonc: the binary download is skipped AND
        # the vendored openrtk plugin leaves the target, so opencode no
        # longer rewrites commands through a (possibly absent) rtk
        rm -f "$1/plugins/openrtk.ts"
        rm -rf "$1/plugins/openrtk"
        echo "[rtk] disabled (options.jsonc) — removed vendored openrtk plugin"
        return 0
    fi
    local exe home_bin="$HOME/.local/bin"
    exe="$(command -v rtk 2>/dev/null || true)"
    if [[ -z "$exe" ]]; then
        # legacy location from the first 0.1.4 installer iteration
        if [[ -x "$1/bin/rtk" ]]; then
            mkdir -p "$home_bin"
            mv "$1/bin/rtk" "$home_bin/rtk"
            exe="$home_bin/rtk"
        else
            local os arch asset sha
            os="$(uname -s)"; arch="$(uname -m)"
            case "$os/$arch" in
                Linux/x86_64)  asset="rtk-x86_64-unknown-linux-musl.tar.gz";  sha="c4c036fbf181fc55ef329786c8c17e0d427972b053b825944d968a6aafef1ba4" ;;
                Linux/aarch64) asset="rtk-aarch64-unknown-linux-gnu.tar.gz";  sha="80a746dd305ef944ff50ef011ae4ce3878dd5ba88dfe35d859d05498191637c3" ;;
                Darwin/arm64)  asset="rtk-aarch64-apple-darwin.tar.gz";       sha="064151cfc2d50b24d810b06a0af2e41b9c945e83534e4c438c3d3eae607fc3f4" ;;
                Darwin/x86_64) asset="rtk-x86_64-apple-darwin.tar.gz";        sha="9ea02f889d5a2779e4fb700df4587824303c5a57cda22e903e30058079fca0ef" ;;
                *) echo "WARN [rtk] no prebuilt binary for $os/$arch — skipping" >&2
                   unset os arch asset sha home_bin exe; return 0 ;;
            esac
            local url="https://github.com/rtk-ai/rtk/releases/download/v$RTK_VERSION/$asset"
            local tmp_dir actual
            tmp_dir="$(mktemp -d)"
            if ! { curl -fsSL "$url" -o "$tmp_dir/$asset" \
                && { if command -v sha256sum >/dev/null 2>&1; then
                         actual="$(sha256sum "$tmp_dir/$asset" | awk '{print $1}')"
                     else
                         actual="$(shasum -a 256 "$tmp_dir/$asset" | awk '{print $1}')"
                     fi
                     [[ "$actual" == "$sha" ]] || { echo "checksum mismatch: expected $sha, got $actual" >&2; false; }; } \
                && tar -xzf "$tmp_dir/$asset" -C "$tmp_dir"; }
            then
                echo "WARN [rtk] download failed — continuing without rtk" >&2
                rm -rf "$tmp_dir"
                unset os arch asset sha url tmp_dir actual home_bin exe
                return 0
            fi
            mkdir -p "$home_bin"
            mv "$tmp_dir/rtk" "$home_bin/rtk"
            chmod +x "$home_bin/rtk"
            rm -rf "$tmp_dir"
            exe="$home_bin/rtk"
            echo "[rtk] installed: $exe"
            unset os arch asset sha url tmp_dir actual
        fi
        if ! rtk_path_ok "$home_bin"; then
            export PATH="$home_bin:$PATH"   # make it visible to rtk init below
            echo
            echo "NOTE: $home_bin is not on PATH — add it for bare \`rtk\` commands:"
            echo "  export PATH=\"\$HOME/.local/bin:\$PATH\"   # bash/zsh"
            echo "  set -gx PATH \$HOME/.local/bin \$PATH     # fish"
        fi
    else
        echo "[rtk] binary present: $exe"
    fi
    # The opencode hook ships in-tree (plugins/openrtk.ts). Remove a
    # leftover official plugin from a previous `rtk init -g --opencode`
    # so tool.execute.before doesn't rewrite commands twice. Only files
    # carrying the official marker are touched — user code stays put.
    local rtk_plugin="$1/plugins/rtk.ts"
    if [[ -f "$rtk_plugin" ]] && grep -qF 'RTK OpenCode plugin' "$rtk_plugin"; then
        rm -f "$rtk_plugin"
        echo "[rtk] removed official plugin plugins/rtk.ts (replaced by vendored openrtk)"
    fi
    # opt out of telemetry by default — users can re-enable with `rtk telemetry enable`.
    # Probe first: older builds (< ~0.40) have no telemetry subcommand and
    # would proxy `telemetry` as an external program (noisy error).
    if "$exe" --help 2>&1 | grep -qE '^[[:space:]]*telemetry\b'; then
        "$exe" telemetry disable 2>&1 | sed 's/^/[rtk] /' || true
    fi
    # Suppress rtk's "No hook installed" banner. The vendored openrtk
    # plugin replaces rtk's official hook mechanism, so the banner is
    # noise. rtk's hook_check rate-limits via a marker file at
    # dirs::data_local_dir()/rtk/.hook_warn_last — touching it silences
    # the warning for 24h; the vendored openrtk plugin refreshes it at
    # every opencode launch. Best-effort: any failure only warns.
    local rtk_data_dir
    if [[ "$(uname -s)" == "Darwin" ]]; then
        rtk_data_dir="$HOME/Library/Application Support/rtk"
    else
        rtk_data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/rtk"
    fi
    if mkdir -p "$rtk_data_dir" 2>/dev/null; then
        : > "$rtk_data_dir/.hook_warn_last" 2>/dev/null || true
    fi
    unset exe home_bin rtk_plugin rtk_data_dir
}

# Config-driven MCP CLI provisioning: walks opencode.jsonc's `mcp` block and
# runs each entry's `install` field when the entry is enabled and its CLI
# (command[0]) is missing from PATH. Adding a new MCP to the config is all it
# takes — no script changes. Idempotent (present → skip); disabled entries are
# skipped even if they pre-declare `install` (e.g. gitnexus — flipping
# enabled to true makes the next install provision it). Missing package
# managers or install failures only warn — opencode degrades to grep/glob.
# Never fails the install itself.
ensure_mcp() {
    local cfg="$TARGET/opencode.jsonc"
    [[ -f "$cfg" ]] || return 0
    local rows
    # strip comment lines so plain jq can parse the JSONC
    rows="$(grep -v '^[[:space:]]*//' "$cfg" | jq -r '
        (.mcp // {}) | to_entries[]
        | select((.value.enabled // false) == true)
        | select((.value.install // "") != "")
        | [.key,
           ((.value.command | if type == "array" then .[0] else . end) // ""),
           .value.install] | @tsv
    ' 2>/dev/null)" || { echo "WARN [mcp] cannot parse opencode.jsonc — skipping MCP provisioning" >&2; return 0; }
    [[ -n "$rows" ]] || return 0
    local name cli inst rc=0
    while IFS=$'\t' read -r name cli inst; do
        [[ -n "$name" && -n "$cli" ]] || continue
        if command -v "$cli" >/dev/null 2>&1; then
            echo "[mcp] $name already present"
            continue
        fi
        echo "[mcp] installing $name ($inst) ..."
        # shellcheck disable=SC2086 — install commands carry no quoted args
        if $inst; then
            if command -v "$cli" >/dev/null 2>&1; then
                echo "[mcp] $name installed"
            else
                echo "WARN [mcp] $name installed but '$cli' not on PATH yet — check its docs (e.g. 'uv tool update-shell'), then restart the shell" >&2
            fi
        else
            echo "WARN [mcp] $name install failed — continuing without it (set mcp.$name.enabled=false if unneeded)" >&2
        fi
    done <<< "$rows"
    unset name cli inst
    return 0
}

# Applies the repo's install/options.jsonc — the single source of truth for
# which MCPs and external plugins are active, plus the default agent — onto
# the target opencode.jsonc:
#   mcp.<name>    → mcp.<name>.enabled
#   plugin.<name> → membership in the `plugin` array
#   default_agent → root `default_agent` (validated against the `agent`
#                   block; unknown names are rejected, template value kept)
# The file is read IN PLACE from install/ and overwrites the target state on
# EVERY install — nothing is copied to the target, so there is no installed
# copy that could be mistaken for an editable config (user choices persist
# in the repo file itself, which the install runs from). Entries the options
# file doesn't list keep the shipped opencode.jsonc value; entries the
# target carries but the options file doesn't know survive as-is (user
# additions). Runs AFTER restore_preserve (options.jsonc wins over any
# preserved opencode.jsonc flags); ensure_mcp afterwards provisions newly
# enabled CLIs.
apply_options() {
    local cfg="$TARGET/opencode.jsonc" comp="$SCRIPT_DIR/options.jsonc"
    [[ -f "$comp" && -f "$cfg" ]] || return 0
    local merged tmp summary ao_da ao_cur comp_file
    # the repo file is authoritative — build the switch state straight from
    # it. Preprocess through grep/tr into a TEMP FILE which jq reads as a
    # file argument: comment lines must go, and jq chokes on CRLF line
    # endings (Windows-edited options.jsonc) — file input sidesteps any
    # shell-level mangling of the cleaned payload.
    comp_file="$(mktemp)"
    grep -v '^[[:space:]]*//' "$comp" | tr -d '\r' > "$comp_file" || return 0
    merged="$(jq -c '
        {
            mcp: (.mcp // {}),
            plugin: (.plugin // {}),
            default_agent: ((.default_agent | select(type == "string" and . != "")) // null),
            rtk: (.rtk != false)
        }
    ' "$comp_file" 2>/dev/null)" || { rm -f "$comp_file"; echo "WARN [options] cannot parse options.jsonc — skipping" >&2; return 0; }
    rm -f "$comp_file"
    # export the rtk decision for ensure_rtk (runs right after this)
    if [[ "$(jq -r '.rtk' <<< "$merged")" == "true" ]]; then OPT_RTK=1; else OPT_RTK=0; fi
    # apply onto opencode.jsonc: mcp.<name>.enabled (only entries the
    # options file lists get forced; unlisted keep the shipped value) +
    # plugin array membership (drop disabled, add enabled-but-missing,
    # keep unknown) + default_agent (only when it names an agent that
    # exists in the `agent` block — a typo would leave opencode without
    # an entry agent, so unknown names keep the template value)
    tmp="$(mktemp)"
    grep -v '^[[:space:]]*//' "$cfg" | jq --argjson c "$merged" '
        ($c.mcp // {}) as $cm | ($c.plugin // {}) as $cp
        | ($c.default_agent // null) as $da
        | .mcp = ((.mcp // {}) | with_entries(
            # inside with_entries `.` is the {key,value} entry — the flag
            # lives on .value.enabled
            .key as $k | if $cm[$k] != null then .value.enabled = $cm[$k] else . end))
        | .plugin = (
            ((.plugin // []) | map(select($cp[.] != false))) as $kept
            | $kept + ([ $cp | to_entries[] | select(.value != false)
                         | .key as $k | select(($kept | index($k)) == null) | $k ])
          )
        | if $da != null then
            if ((.agent // {}) | has($da)) then .default_agent = $da else . end
          else . end
    ' | style_json > "$tmp" || true
    # never clobber the config with an empty/broken file when jq aborted
    if jq -e '.' "$tmp" >/dev/null 2>&1; then
        mv "$tmp" "$cfg"
    else
        rm -f "$tmp"
        echo "WARN [options] failed to apply switches to opencode.jsonc" >&2
        return 0
    fi
    # warn about an invalid default_agent pick (jq above silently kept the
    # template value for it)
    ao_da="$(jq -r '.default_agent // ""' <<< "$merged")"
    if [[ -n "$ao_da" ]] && ! { grep -v '^[[:space:]]*//' "$cfg" | jq -e --arg a "$ao_da" '(.agent // {}) | has($a)' >/dev/null 2>&1; }; then
        ao_cur="$(grep -v '^[[:space:]]*//' "$cfg" | jq -r '.default_agent // ""' 2>/dev/null)"
        echo "WARN [options] default_agent '$ao_da' not found in the agent block — keeping '$ao_cur'" >&2
        ao_da=""
    fi
    [[ -n "$ao_da" ]] || ao_da="$(grep -v '^[[:space:]]*//' "$cfg" | jq -r '.default_agent // ""' 2>/dev/null)"
    summary="$(jq -r --arg da "$ao_da" '"mcp: \([.mcp[]? | select(. == true)] | length) on / \([.mcp[]? | select(. != true)] | length) off; plugins: \([.plugin[]? | select(. == true)] | length) on / \([.plugin[]? | select(. != true)] | length) off; rtk: \(if .rtk == false then "off" else "on" end); default_agent: \($da)"' <<< "$merged")"
    echo "[options] applied options.jsonc ($summary)"
    unset cfg comp merged tmp summary ao_da ao_cur comp_file
}

# --- install orchestration ----------------------------------------------

# 1) remove files listed by previous version's manifest
remove_old_files() {
    if [[ -n "$installed" ]]; then
        local prev_man prev_count
        prev_man="$INST_DIR/$installed.manifest.txt"
        prev_count="$(read_manifest "$prev_man" | wc -l | tr -d ' ')"
        echo "[prev: $installed] removing $prev_count files"
        read_manifest "$prev_man" | remove_manifest_files "prev" "$TARGET"
    else
        echo "[prev: none] skipping removal"
    fi
}

# 2) copy current manifest over target (preserve credentials + model picks)
copy_current_files() {
    local cur_count n
    cur_count="$(read_manifest "$CUR_MAN" | wc -l | tr -d ' ')"
    echo "[cur: $VER] copying $cur_count files"
    read_manifest "$CUR_MAN" | copy_manifest_files "$REPO_ROOT" "$TARGET" "cur"
    # fold shipped providers/*.json into the `provider` node before the
    # preserve-restore, so user credentials override {env:...} placeholders
    merge_providers "$TARGET"
    # options.jsonc never ships to the target — apply_options reads the
    # repo file in place. Older installers left a copy behind; delete it so
    # nobody mistakes it for an editable config
    rm -f "$TARGET/options.jsonc"
    # restore the snapshot taken before removal (only if there is anything)
    if [[ -s "$preserve_bag" ]]; then
        n="$(jq '(.creds | length) + (.tiers | length) + (if .rootModel != null then 1 else 0 end)' "$preserve_bag" 2>/dev/null || echo 0)"
        if [[ "$n" -gt 0 ]]; then
            restore_preserve "$TARGET" < "$preserve_bag"
            echo "[cur: $VER] preserved $n field(s) (credentials + models) in opencode.jsonc"
        fi
    fi
}

# 3) write the new version marker
write_new_marker() {
    write_marker "$VER"
    echo "installed $VER"
}

do_install() {
    # Snapshot the existing marker before any destructive work so a partial
    # failure leaves the target referencing the version that's actually still on disk
    prev_marker_backup=""
    if [[ -n "$installed" ]]; then
        prev_marker_backup="$(mktemp)"
        cp "$TARGET/$MARKER" "$prev_marker_backup"
    fi

    # Snapshot user state in opencode.jsonc BEFORE anything gets removed —
    # remove_old_files deletes it as part of the previous manifest
    preserve_bag="$(mktemp)"
    read_preserve "$TARGET" > "$preserve_bag" || true

    remove_old_files
    copy_current_files
    # options.jsonc decides which MCPs/plugins are active — the repo file
    # overwrites the target unconditionally (ensure_mcp below provisions
    # newly enabled entries)
    apply_options
    # provision rtk binary + clean up the official plugin (warns, never
    # fails) — runs after apply_options so the options.jsonc rtk switch
    # is already decided
    ensure_rtk "$TARGET"
    # Provision MCP CLIs for the `mcp` block (warns, never fails)
    ensure_mcp
    write_new_marker

    rm -f "$preserve_bag"
    if [[ -n "$prev_marker_backup" ]]; then
        rm -f "$prev_marker_backup"
    fi
}

restore_marker_on_error() {
    local rc=$?
    if [[ -n "$prev_marker_backup" && -f "$prev_marker_backup" ]]; then
        cp "$prev_marker_backup" "$TARGET/$MARKER"
        rm -f "$prev_marker_backup"
        echo "install failed; restored marker to $installed" >&2
    else
        echo "install failed; target may be in a partial state. Re-run with -f." >&2
    fi
    exit "$rc"
}

# --- global shim ---------------------------------------------------------

# Sentinel line embedded in trampolines we generate. unregister refuses to
# remove a file that doesn't carry it (so we never clobber someone else's
# binary that happens to share the same name).
SHIM_SENTINEL='generated by opencode-config register'
SHIM_NAME='opencode-config'
SHIM_SRC="$REPO_ROOT/bin/$SHIM_NAME"

# Returns 0 if $1 is one of the colon-separated dirs in $PATH.
path_contains() {
    local IFS=':'
    local d
    for d in $PATH; do
        [[ "$d" == "$1" ]] && return 0
    done
    return 1
}

# Writes a tiny exec-trampoline that re-runs the in-repo bin/$SHIM_NAME.
# Doing this — instead of copying — keeps the global shim automatically in
# sync with whatever the repo currently has (incl. future edits).
write_shim() {
    local dest="$1"
    mkdir -p "$(dirname "$dest")"
    # The trampoline is generated; carry the sentinel so unregister can
    # safely refuse to delete unrelated files.
    cat > "$dest" <<EOF
#!/usr/bin/env bash
# $SHIM_SENTINEL — do not edit; rewritten on the next \`register\`.
exec "$SHIM_SRC" "\$@"
EOF
    chmod +x "$dest"
}

# Returns 0 if $dest looks like a shim we created (sentinel present), or if
# the path doesn't exist. Returns 1 if the file exists but is not ours.
shim_owned() {
    local dest="$1"
    [[ ! -e "$dest" ]] && return 0
    # Sentinel sits on the comment line beneath the shebang. Read both
    # candidates — `head -2` is robust against future header edits.
    local head
    head="$(head -2 "$dest" 2>/dev/null | tr -d '\r' || true)"
    [[ "$head" == *"$SHIM_SENTINEL"* ]] && return 0
    return 1
}

VER="$(read_version)"
CUR_MAN="$INST_DIR/$VER.manifest.txt"

case "$MODE" in
    init)
        # Backup the entire target directory to a timestamped sibling, then clear it.
        # Designed for a fresh start: after init, run `install` to reinstall
        # the config files; credentials are then configured inside opencode.
        if [[ ! -d "$TARGET" ]]; then
            echo "target directory does not exist: $TARGET"
            echo "nothing to do"
            exit 0
        fi
        item_count="$(find "$TARGET" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
        if [[ "$item_count" -eq 0 ]]; then
            echo "target directory is already empty: $TARGET"
            exit 0
        fi

        # Timestamped backup as a sibling directory.
        timestamp="$(date +%Y%m%d-%H%M%S)"
        backup_dir="${TARGET}.backup.${timestamp}"

        if [[ $NO_BACKUP -eq 0 ]]; then
            cp -R "$TARGET" "$backup_dir"
            backup_count="$(find "$backup_dir" -mindepth 1 | wc -l | tr -d ' ')"
            echo "backed up $backup_count item(s) to: $backup_dir"
        else
            echo "skipping backup (--no-backup)"
        fi

        # Confirmation before destructive operation.
        if [[ $YES -eq 0 ]]; then
            printf 'clear all files in %s? (y/N): ' "$TARGET"
            if ! read -r confirm; then echo; echo "cancelled"; exit 0; fi
            if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
                echo "cancelled"
                exit 0
            fi
        fi

        # Clear everything in the target directory (keep the directory itself).
        find "$TARGET" -mindepth 1 -delete
        echo "cleared $TARGET ($item_count item(s) removed)"
        echo
        echo "next steps:"
        echo "  ./install/install.sh install   # reinstall config files"
        ;;
    uninstall)
        # Reverse of install: read the target's marker, delete exactly the
        # files that version's manifest lists (user-added files survive),
        # then drop the installer-owned extras (options.jsonc, marker, stale
        # marker backup). Refuses to guess when the manifest is missing.
        installed="$(read_installed_version || true)"
        if [[ -z "$installed" ]]; then
            echo "nothing installed at $TARGET (no $MARKER)"
            exit 0
        fi
        prev_man="$INST_DIR/$installed.manifest.txt"
        if [[ ! -f "$prev_man" ]]; then
            echo "manifest missing: install/versions/$installed.manifest.txt — cannot uninstall precisely." >&2
            echo "use 'init' to back up and clear the target instead." >&2
            exit 1
        fi
        # `|| true` guards: read_manifest's grep chain exits 1 on a comment-
        # only manifest, and pipefail would abort the whole uninstall on it
        prev_count="$( { read_manifest "$prev_man" || true; } | wc -l | tr -d ' ')"
        echo "installed: $installed ($prev_count manifest file(s))"
        if [[ $YES -eq 0 ]]; then
            printf 'remove these files from %s? (y/N): ' "$TARGET"
            if ! read -r confirm; then echo; echo "cancelled"; exit 0; fi
            if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
                echo "cancelled"
                exit 0
            fi
        fi
        { read_manifest "$prev_man" || true; } | remove_manifest_files "uninstall" "$TARGET"
        # Installer-owned extras that never live in the manifest (the
        # options.jsonc copy is a leftover of older installers — install
        # no longer ships it)
        for extra in options.jsonc "$MARKER" "$MARKER.bak"; do
            if [[ -e "$TARGET/$extra" ]]; then
                rm -f "$TARGET/$extra"
                echo "[uninstall] rm $extra"
            fi
        done
        # Prune directories the manifest shipped: deepest first, only when
        # empty — any user-added content keeps its folder alive
        { read_manifest "$prev_man" || true; } | while IFS= read -r f; do
            [[ -z "$f" ]] && continue
            dir="$(dirname "$TARGET/$f")"
            while [[ "$dir" != "$TARGET" && -d "$dir" ]]; do
                if [[ -z "$(find "$dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
                    rmdir "$dir" 2>/dev/null || break
                    echo "[uninstall] rmdir ${dir#"$TARGET"/}"
                    dir="$(dirname "$dir")"
                else
                    break
                fi
            done
        done
        echo "uninstalled $installed"
        echo
        echo "notes:"
        echo "  - files you added yourself were left in place; \`init\` clears everything"
        echo "  - the rtk binary + MCP CLIs are external tools and stay installed"
        echo "  - \`unregister\` removes the global opencode-config shim"
        ;;
    generate)
        if [[ -f "$CUR_MAN" ]]; then
            echo "install/versions/$VER.manifest.txt already exists; remove it first to regenerate" >&2
            exit 1
        fi
        generate_manifest "$VER"
        ;;
    register)
        # Install the global shim. Trampoline-only (no copy of bin/), so
        # `git pull` propagates updates instantly — re-running register is
        # only needed to fix a broken or removed shim.
        if [[ ! -f "$SHIM_SRC" ]]; then
            echo "missing: $SHIM_SRC" >&2
            echo "this repo is incomplete — expected bin/$SHIM_NAME" >&2
            exit 1
        fi
        dest="$BIN_DIR/$SHIM_NAME"
        # Refuse to silently overwrite an unrelated file at the same path.
        if ! shim_owned "$dest"; then
            echo "refusing to overwrite existing file at $dest (not our shim)" >&2
            echo "remove it manually, or pass --bin-dir to choose a different location" >&2
            exit 1
        fi
        write_shim "$dest"
        echo "registered: $dest"
        echo "           -> $SHIM_SRC"
        if ! path_contains "$BIN_DIR"; then
            echo
            echo "NOTE: $BIN_DIR is not on PATH."
            echo "  export PATH=\"\$HOME/.local/bin:\$PATH\"   # bash/zsh"
            echo "  set -gx PATH \$HOME/.local/bin \$PATH     # fish"
        fi
        ;;
    unregister)
        dest="$BIN_DIR/$SHIM_NAME"
        if [[ ! -e "$dest" ]]; then
            echo "not registered at $dest (nothing to do)"
            exit 0
        fi
        # Defensive: never delete a file we didn't create.
        if ! shim_owned "$dest"; then
            echo "refusing to remove $dest (does not look like an opencode-config shim)" >&2
            exit 1
        fi
        rm -f "$dest"
        echo "unregistered: $dest"
        ;;
    status)
        installed="$(read_installed_version || echo '(none)')"
        echo "installed: $installed"
        echo "repo:      $VER"
        if [[ -f "$CUR_MAN" ]]; then
            echo "manifest:  install/versions/$VER.manifest.txt (present)"
        else
            echo "manifest:  install/versions/$VER.manifest.txt (will auto-generate on next install)"
        fi
        ;;
    install)
        if [[ ! -f "$CUR_MAN" ]]; then
            echo "install/versions/$VER.manifest.txt missing, generating..." >&2
            generate_manifest "$VER"
        fi
        installed="$(read_installed_version || true)"
        if [[ -n "$installed" && "$installed" == "$VER" && $FORCE -eq 0 ]]; then
            echo "already at $VER, nothing to do (-f to reapply)"
            exit 0
        fi

        trap 'restore_marker_on_error' ERR
        do_install
        trap - ERR
        ;;
esac