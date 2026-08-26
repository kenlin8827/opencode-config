#!/usr/bin/env bash
# Verify release artifacts against the version manifest.
#
# Cross-checks dist/opencode-prime-<version> and opencode-config-<version>
# archives against install/versions/<version>.manifest.txt:
#
#   1. File-list completeness — every manifest entry plus the bundled
#      install/bin companion files must exist in the archive, with no
#      unexpected extras.
#   2. Content integrity — sha256 of every manifest file inside the
#      archive must match the repository working tree.
#
# Reads install/VERSION to pick the version, exactly like pack.sh.
# Run this after scripts/pack.sh and before publishing a release.
#
# Usage: bash scripts/verify.sh [dist-dir]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="${1:-$REPO_ROOT/dist}"
VERSION_FILE="$REPO_ROOT/install/VERSION"
INST_DIR="$REPO_ROOT/install/versions"

# --- read version ---------------------------------------------------------

[[ -f "$VERSION_FILE" ]] || { echo "missing install/VERSION" >&2; exit 1; }
VER="$(tr -d '\r\n ' < "$VERSION_FILE")"
MANIFEST="$INST_DIR/$VER.manifest.txt"
[[ -f "$MANIFEST" ]] || { echo "missing manifest for version $VER: $MANIFEST" >&2; exit 1; }

# manifest entries (skip comments/blank lines)
manifest_entries() {
    grep -v '^[[:space:]]*#' "$MANIFEST" | sed 's/[[:space:]]*$//' | grep -v '^$' | sort -u
}

# dynamically scan all companion files (install/, bin/, package.json)
extras() {
    (cd "$REPO_ROOT" && find install -type f ! -path '*/.*' ! -path '*/node_modules/*' ! -path '*/tests/*' ! -path '*/.tmp/*')
    (cd "$REPO_ROOT" && find bin -type f ! -path '*/.*')
    [[ -f "$REPO_ROOT/package.json" ]] && echo "package.json"
}

EXPECTED="$( { manifest_entries; extras; } | sort -u )"

WORK="$DIST_DIR/.verify-tmp"
rm -rf "$WORK"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

FAILURES=0

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    else
        shasum -a 256 "$1" | cut -d' ' -f1
    fi
}

verify_archive() {
    local archive="$1" extract_dir="$2" name
    name="$(basename "$archive")"
    if [[ ! -f "$archive" ]]; then
        echo "=== $name === NOT FOUND"
        FAILURES=$((FAILURES + 1))
        return
    fi

    mkdir -p "$extract_dir"
    case "$archive" in
        *.zip)  unzip -q "$archive" -d "$extract_dir" ;;
        *.tar.gz) tar -xzf "$archive" -C "$extract_dir" ;;
        *) echo "unsupported archive type: $archive" >&2; exit 1 ;;
    esac

    # package root is the single top-level directory inside the archive
    local pkg_root
    pkg_root="$(find "$extract_dir" -mindepth 1 -maxdepth 1 | head -1)"
    [[ -d "$pkg_root" ]] || pkg_root="$extract_dir"

    local actual missing extra
    actual="$(cd "$pkg_root" && find . -type f | sed 's|^\./||' | sort -u)"

    missing="$(comm -23 <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$actual"))"
    extra="$(comm -13 <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$actual"))"

    echo "=== $name ==="
    echo "expected: $(printf '%s\n' "$EXPECTED" | wc -l | tr -d ' '), actual: $(printf '%s\n' "$actual" | wc -l | tr -d ' ')"
    if [[ -n "$missing" ]]; then
        while IFS= read -r f; do echo "  MISSING: $f"; FAILURES=$((FAILURES + 1)); done <<< "$missing"
    fi
    if [[ -n "$extra" ]]; then
        while IFS= read -r f; do echo "  UNEXPECTED: $f"; FAILURES=$((FAILURES + 1)); done <<< "$extra"
    fi
    [[ -z "$missing" && -z "$extra" ]] && echo "file list: OK"

    # content integrity: hash every manifest file against the repo source
    local diffs=0 rel h1 h2
    while IFS= read -r rel; do
        [[ -f "$pkg_root/$rel" ]] || continue # already reported as missing
        h1="$(sha256_of "$REPO_ROOT/$rel")"
        h2="$(sha256_of "$pkg_root/$rel")"
        if [[ "$h1" != "$h2" ]]; then
            echo "  CONTENT DIFF: $rel"
            diffs=$((diffs + 1))
            FAILURES=$((FAILURES + 1))
        fi
    done < <(manifest_entries)
    [[ $diffs -eq 0 ]] && echo "content integrity: OK ($(manifest_entries | wc -l | tr -d ' ') files)"
    echo ''
}

verify_archive "$DIST_DIR/opencode-prime-$VER.zip" "$WORK/prime-zip"
verify_archive "$DIST_DIR/opencode-prime-$VER.tar.gz" "$WORK/prime-tgz"

if [[ $FAILURES -gt 0 ]]; then
    echo "verify: FAILED ($FAILURES problem(s))" >&2
    exit 1
fi
echo "verify: OK (version $VER)"
