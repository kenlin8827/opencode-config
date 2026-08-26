#requires -Version 5.1
<#
.SYNOPSIS
    Lightweight bootstrap launcher for OpenCode Config installer.
#>

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$EntryFile = Join-Path $ScriptDir 'src/index.ts'

# 1. Try Bun (fastest, native TS support)
if (Get-Command bun -ErrorAction SilentlyContinue) {
    & bun run "$EntryFile" @args
    exit $LASTEXITCODE
}

# 2. Try Node.js + tsx
if (Get-Command node -ErrorAction SilentlyContinue) {
    # Ensure dependencies installed if node_modules is missing
    $NodeModules = Join-Path $RepoRoot 'node_modules'
    if (-not (Test-Path $NodeModules)) {
        Write-Host "Installing installer dependencies via npm..." -ForegroundColor Cyan
        & npm install --prefix "$RepoRoot"
    }

    & npx --prefix "$RepoRoot" tsx "$EntryFile" @args
    exit $LASTEXITCODE
}

# 3. Neither found — print friendly instructions
Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  Runtime Missing: Bun or Node.js is required to install"     -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Please install Bun (recommended) or Node.js:"
Write-Host "  • Bun: powershell -c `"irm bun.sh/install.ps1 | iex`""
Write-Host "  • Node: https://nodejs.org/"
Write-Host ""
exit 1