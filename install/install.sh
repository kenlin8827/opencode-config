#!/usr/bin/env bash
# Lightweight bootstrap launcher for OpenCode Config installer

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENTRY_FILE="$SCRIPT_DIR/src/index.ts"

# 1. Try Bun (fastest, native TS support)
if command -v bun >/dev/null 2>&1; then
    exec bun run "$ENTRY_FILE" "$@"
fi

# 2. Try Node.js + tsx
if command -v node >/dev/null 2>&1; then
    if [ ! -d "$REPO_ROOT/node_modules" ]; then
        echo "Installing installer dependencies via npm..."
        npm install --prefix "$REPO_ROOT"
    fi
    exec npx --prefix "$REPO_ROOT" tsx "$ENTRY_FILE" "$@"
fi

# 3. Neither found — print friendly instructions
echo ""
echo "============================================================"
echo "  Runtime Missing: Bun or Node.js is required to install"
echo "============================================================"
echo ""
echo "Please install Bun (recommended) or Node.js:"
echo "  • Bun: curl -fsSL https://bun.sh/install | bash"
echo "  • Node: https://nodejs.org/"
echo ""
exit 1