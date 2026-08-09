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
#
# Mirrors install.ps1's three modes + credential preservation in opencode.jsonc.

set -eo pipefail

# --- locate paths -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="${HOME}/.config/opencode"
VERSION_FILE="$SCRIPT_DIR/VERSION"
INST_DIR="$SCRIPT_DIR/versions"
MARKER=".CONFIG_VERSION"

# ponytail: whitelist of 5 runtime paths; nothing else ships
INCLUDE_PREFIXES=("agents/" "commands/" "plugins/" "instructions/" "opencode.jsonc")
PRESERVE_KEYS=("baseURL" "apiKey")
MODEL_NAMES=("default" "code" "advisor" "explorer" "vision")

# --- arg parse ----------------------------------------------------------
MODE="install"
FORCE=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        generate|status|install) MODE="$1"; shift ;;
        -f|--force) FORCE=1; shift ;;
        -t|--target) TARGET="$2"; shift 2 ;;
        -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
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
    grep -v '^\s*#' "$1" | grep -v '^\s*$' | sed 's/\\/\//g'
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

# removes every file listed in $1 from $TARGET (skips the marker itself)
remove_manifest_files() {
    rm_label="$1"; shift
    rm_base="$1"; shift
    [[ $# -eq 0 || "$1" == "" ]] && { echo "[$rm_label] no files to remove"; return; }
    while IFS= read -r f; do
        [[ -z "$f" || "$f" == "$MARKER" ]] && continue
        rm_p="$rm_base/$f"
        if [[ -e "$rm_p" ]]; then
            rm -rf "$rm_p"
            echo "[$rm_label] rm $f"
        fi
    done
    unset rm_label rm_base rm_p
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

# preserves provider.*.options.{baseURL,apiKey} for every provider in the
# target's existing opencode.jsonc before the copy overwrites it
# outputs a JSON array: [{"provider":"llm-router","key":"baseURL","value":"..."}, ...]
read_preserve() {
    rp_f="$1/opencode.jsonc"
    [[ -f "$rp_f" ]] || { unset rp_f; return 0; }
    jq -c '
        [ .provider // {} | to_entries[] as $p |
          ($p.value.options // {}) | to_entries[] |
          select(.key == "baseURL" or .key == "apiKey") |
          {provider: $p.key, key: .key, value: .value}
        ]
    ' "$rp_f" 2>/dev/null || echo "[]"
    unset rp_f
}

# restores preserved baseURL/apiKey into the freshly-copied opencode.jsonc
# reads JSON array from stdin
restore_preserve() {
    rp_dst="$1"
    rp_f="$rp_dst/opencode.jsonc"
    rp_bag_file="$(mktemp)"
    cat > "$rp_bag_file"
    rp_size=$(wc -c < "$rp_bag_file" | tr -d ' ')
    [[ "$rp_size" -le 3 ]] && { rm -f "$rp_bag_file"; unset rp_dst rp_f rp_bag_file rp_size; return 0; }
    rp_tmp="$(mktemp)"
    jq --slurpfile b "$rp_bag_file" '
        reduce ($b[0][] | .provider) as $pn (.;
            .provider[$pn] //= {} |
            .provider[$pn].options //= {} |
            reduce ($b[0][] | select(.provider == $pn) | .key) as $k (.;
                .provider[$pn].options[$k] = ($b[0] | map(select(.provider == $pn and .key == $k))[0].value)
            )
        )
    ' "$rp_f" > "$rp_tmp"
    mv "$rp_tmp" "$rp_f"
    rm -f "$rp_bag_file"
    unset rp_dst rp_f rp_bag_file rp_size rp_tmp
}

mask_key() {
    local k="$1"
    [[ -z "$k" || "${#k}" -le 6 ]] && { echo "***"; return; }
    echo "${k:0:3}***${k: -3}"
}

# --- main ---------------------------------------------------------------
VER="$(read_version)"
CUR_MAN="$INST_DIR/$VER.manifest.txt"

case "$MODE" in
    generate)
        if [[ -f "$CUR_MAN" ]]; then
            echo "install/versions/$VER.manifest.txt already exists; remove it first to regenerate" >&2
            exit 1
        fi
        generate_manifest "$VER"
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

        # 1) remove files listed by previous version's manifest
        if [[ -n "$installed" ]]; then
            prev_man="$INST_DIR/$installed.manifest.txt"
            prev_count="$(read_manifest "$prev_man" | wc -l | tr -d ' ')"
            echo "[prev: $installed] removing $prev_count files"
            read_manifest "$prev_man" | remove_manifest_files "prev" "$TARGET"
        else
            echo "[prev: none] skipping removal"
        fi

        # 2) copy current manifest over target (preserve credentials)
        cur_count="$(read_manifest "$CUR_MAN" | wc -l | tr -d ' ')"
        echo "[cur: $VER] copying $cur_count files"
        # snapshot existing credentials BEFORE overwriting
        preserve_bag="$(mktemp)"
        read_preserve "$TARGET" > "$preserve_bag" || true
        read_manifest "$CUR_MAN" | copy_manifest_files "$REPO_ROOT" "$TARGET" "cur"
        # restore them into the freshly-copied opencode.jsonc
        if [[ -s "$preserve_bag" ]]; then
            restore_preserve "$TARGET" < "$preserve_bag"
            n="$(jq 'length' "$preserve_bag" 2>/dev/null || echo 0)"
            echo "[cur: $VER] preserved $n credential field(s) in opencode.jsonc"
        fi
        rm -f "$preserve_bag"

        # 3) write the new version marker
        write_marker "$VER"
        echo "installed $VER"
        ;;
esac