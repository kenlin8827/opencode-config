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
#   ./install/install.sh init           # backup + clear target (fresh start)
#   ./install/install.sh init --no-backup  # clear without backup
#   ./install/install.sh init -y        # skip confirmation prompt
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
INCLUDE_PREFIXES=("agents/" "commands/" "plugins/" "instructions/" "opencode.jsonc" "profiles/")
PRESERVE_KEYS=("baseURL" "apiKey")

# --- arg parse ----------------------------------------------------------
MODE="install"
FORCE=0
NO_BACKUP=0
YES=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        generate|status|install|init|register|unregister) MODE="$1"; shift ;;
        -f|--force) FORCE=1; shift ;;
        --no-backup) NO_BACKUP=1; shift ;;
        -y|--yes) YES=1; shift ;;
        -t|--target) TARGET="$2"; shift 2 ;;
        --bin-dir) BIN_DIR="$2"; shift 2 ;;
        -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
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

# snapshots user state from the target's existing opencode.jsonc before the
# copy overwrites it: provider credentials, root model, and per-tier model
# refs (agents of a tier share one ref — same tier semantics as config.sh).
# outputs a JSON object: {creds: [...], rootModel: "...", tiers: {"code": "..."}}
read_preserve() {
    rp_f="$1/opencode.jsonc"
    [[ -f "$rp_f" ]] || { unset rp_f; return 0; }
    jq -c '
        {
          creds: [ .provider // {} | to_entries[] as $p |
                   ($p.value.options // {}) | to_entries[] |
                   select(.key == "baseURL" or .key == "apiKey") |
                   {provider: $p.key, key: .key, value: .value} ],
          rootModel: (.model // null),
          tiers: ([ .agent // {} | to_entries[] |
                    select((.value.tier // null) != null and (.value.model // null) != null) |
                    {(.value.tier): .value.model} ] | add // {})
        }
    ' "$rp_f" 2>/dev/null || echo '{"creds":[],"rootModel":null,"tiers":{}}'
    unset rp_f
}

# restores preserved credentials + model picks into the freshly-copied opencode.jsonc
# reads the JSON object from stdin
restore_preserve() {
    rp_dst="$1"
    rp_f="$rp_dst/opencode.jsonc"
    rp_bag_file="$(mktemp)"
    cat > "$rp_bag_file"
    rp_tmp="$(mktemp)"
    jq --slurpfile b "$rp_bag_file" '
        ($b[0].creds // []) as $c |
        ($b[0].tiers // {}) as $t |
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
                 (.value.tier // "") as $tier
                 | if ($t | has($tier)) then .value.model = $t[$tier] else . end)
           else . end)
    ' "$rp_f" > "$rp_tmp"
    mv "$rp_tmp" "$rp_f"
    rm -f "$rp_bag_file"
    unset rp_dst rp_f rp_bag_file rp_tmp
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
        # config files, then config.sh (interactive) to set credentials.
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
        echo "  ./install/config.sh            # set credentials + models"
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