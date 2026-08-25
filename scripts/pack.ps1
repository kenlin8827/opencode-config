#requires -Version 7.0
<#
.SYNOPSIS
    scripts/pack.ps1 — build a release archive from the current repo state.

.DESCRIPTION
    PowerShell equivalent of scripts/pack.sh. Produces two archives in dist/:
      opencode-config-<version>.tar.gz   (for macOS / Linux / WSL)
      opencode-config-<version>.zip       (for Windows)

    Each archive contains:
      install/VERSION
      install/options.jsonc
      install/install.sh
      install/install.ps1
      install/versions/<ver>.manifest.txt   (auto-generated if missing)
      bin/opencode-config                   (bash dispatcher)
      bin/opencode-config.ps1               (PowerShell dispatcher)
      <every file listed in the manifest>    (agents/, plugins/, etc.)

.PARAMETER OutDir
    Output directory for archives (default: ./dist).

.PARAMETER TarOnly
    Build only the tar.gz archive.

.PARAMETER ZipOnly
    Build only the zip archive.

.EXAMPLE
    pwsh scripts/pack.ps1
    pwsh scripts/pack.ps1 -OutDir C:\temp\dist
    pwsh scripts/pack.ps1 -TarOnly
#>
[CmdletBinding()]
param(
    [string]$OutDir,
    [switch]$TarOnly,
    [switch]$ZipOnly,
    [Alias('h')][switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) { Get-Help $PSCommandPath -Detailed; exit 0 }

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$VersionFile = Join-Path $RepoRoot 'install/VERSION'
$InstDir = Join-Path $RepoRoot 'install/versions'

# --- read version --------------------------------------------------------

function Read-Version {
    if (Test-Path $VersionFile) {
        return (Get-Content $VersionFile -TotalCount 1).Trim()
    }
    $sha = (git -C $RepoRoot rev-parse --short HEAD 2>$null)
    if ($sha) { return $sha.Trim() } else { return 'unknown' }
}

# --- read manifest -------------------------------------------------------

function Read-Manifest([string]$path) {
    if (-not (Test-Path $path)) { return @() }
    Get-Content $path |
        Where-Object { $_ -and $_ -notmatch '^\s*#' } |
        ForEach-Object { $_.Trim() -replace '\\', '/' } |
        Where-Object { $_ -ne '' }
}

# --- generate manifest if missing ----------------------------------------

$includePrefixes = @('agents/', 'commands/', 'plugins/', 'instructions/', 'opencode.jsonc', 'tui.json', 'tiers.json', 'profiles/', 'providers/', 'scripts/')
$excludePatterns = @('^scripts/pack\.', '^scripts/verify\.')

function Generate-Manifest([string]$ver) {
    $out = Join-Path $InstDir "$ver.manifest.txt"
    $lines = @()
    Get-ChildItem -Path $RepoRoot -Recurse -File -Force | ForEach-Object {
        $rel = $_.FullName.Substring($RepoRoot.Length).TrimStart('\','/') -replace '\\','/'
        $include = $false
        foreach ($p in $includePrefixes) {
            if ($rel -eq $p.TrimEnd('/') -or $rel.StartsWith($p)) { $include = $true; break }
        }
        if ($include) {
            foreach ($ex in $excludePatterns) {
                if ($rel -match $ex) { $include = $false; break }
            }
        }
        if ($include) { $lines += $rel }
    }
    $lines | Sort-Object | Set-Content -Path $out -Encoding UTF8
    Write-Host ("wrote install/versions/{0}.manifest.txt ({1} files)" -f $ver, $lines.Count)
}

# --- main ----------------------------------------------------------------

$ver = Read-Version
$manifestPath = Join-Path $InstDir "$ver.manifest.txt"

# Ensure manifest exists
if (-not (Test-Path $manifestPath)) {
    Write-Host "manifest missing for version $ver, generating..."
    if (-not (Test-Path $InstDir)) { New-Item -ItemType Directory -Path $InstDir -Force | Out-Null }
    Generate-Manifest $ver
}

if (-not $OutDir) { $OutDir = Join-Path $RepoRoot 'dist' }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

# Build staging directory
$stage = New-Item -ItemType Directory -Path ([IO.Path]::Combine([IO.Path]::GetTempPath(), "oc-pack-$(Get-Random)")) -Force
$pkgDir = Join-Path $stage.FullName "opencode-config-$ver"
New-Item -ItemType Directory -Path $pkgDir -Force | Out-Null

# 1. Copy install scripts
$installDest = Join-Path $pkgDir 'install'
$versionsDest = Join-Path $installDest 'versions'
New-Item -ItemType Directory -Path $versionsDest -Force | Out-Null
Copy-Item (Join-Path $RepoRoot 'install/install.sh') $installDest -Force
Copy-Item (Join-Path $RepoRoot 'install/install.ps1') $installDest -Force
Copy-Item $VersionFile $installDest -Force
$compSrc = Join-Path $RepoRoot 'install/options.jsonc'
if (Test-Path $compSrc) { Copy-Item $compSrc $installDest -Force }
Copy-Item (Join-Path $InstDir '*.manifest.txt') $versionsDest -Force

# 2. Copy bin dispatchers
$binDest = Join-Path $pkgDir 'bin'
New-Item -ItemType Directory -Path $binDest -Force | Out-Null
Copy-Item (Join-Path $RepoRoot 'bin/opencode-config') $binDest -Force
Copy-Item (Join-Path $RepoRoot 'bin/opencode-config.ps1') $binDest -Force

# 3. Copy every file listed in the manifest
$manifestFiles = Read-Manifest $manifestPath
$fileCount = 0
foreach ($f in $manifestFiles) {
    $src = Join-Path $RepoRoot $f
    $dst = Join-Path $pkgDir $f
    if (-not (Test-Path $src)) {
        Write-Warning "missing source: $f"
        continue
    }
    $dstDir = Split-Path $dst -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
    $fileCount++
}

Write-Host "staged $fileCount manifest file(s) + install scripts + bin dispatchers"

# 4. Build archives
$buildTar = -not $ZipOnly
$buildZip = -not $TarOnly
$tarName = "opencode-config-$ver.tar.gz"
$zipName = "opencode-config-$ver.zip"

if ($buildTar) {
    $tarPath = Join-Path $OutDir $tarName
    # bsdtar (Windows default) supports creating tar.gz
    & tar -czf $tarPath -C $stage.FullName "opencode-config-$ver"
    if ($LASTEXITCODE -ne 0) { throw "tar failed (exit $LASTEXITCODE)" }
    Write-Host "built: $tarPath"
}

if ($buildZip) {
    $zipPath = Join-Path $OutDir $zipName
    Compress-Archive -Path $pkgDir -DestinationPath $zipPath -Force
    Write-Host "built: $zipPath"
}

# Clean up staging
Remove-Item -LiteralPath $stage.FullName -Recurse -Force

Write-Host "done (version: $ver, files: $fileCount)"
