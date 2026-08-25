<#
.SYNOPSIS
    Verify release artifacts against the version manifest.

.DESCRIPTION
    Cross-checks dist/opencode-config-<version>.zip and .tar.gz against
    install/versions/<version>.manifest.txt:

      1. File-list completeness — every manifest entry plus the bundled
         install/bin companion files must exist in the archive, with no
         unexpected extras.
      2. Content integrity — SHA256 of every manifest file inside the
         archive must match the repository working tree.

    Reads install/VERSION to pick the version, exactly like pack.ps1.
    Run this after scripts/pack.ps1 and before publishing a release.

.PARAMETER DistDir
    Directory containing the archives (default: ./dist).

.EXAMPLE
    pwsh -NoProfile -File scripts/verify.ps1
#>

param(
    [string]$DistDir = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $DistDir) { $DistDir = Join-Path $RepoRoot 'dist' }
$VersionFile = Join-Path $RepoRoot 'install/VERSION'
$InstDir = Join-Path $RepoRoot 'install/versions'

# --- read version ---------------------------------------------------------

function Read-Version {
    if (-not (Test-Path $VersionFile)) { throw "missing install/VERSION" }
    ((Get-Content $VersionFile -Raw) -replace '[\r\n\s]', '')
}

$ver = Read-Version
$manifestPath = Join-Path $InstDir "$ver.manifest.txt"
if (-not (Test-Path $manifestPath)) { throw "missing manifest for version $ver : $manifestPath" }

$manifest = Get-Content $manifestPath |
    Where-Object { $_ -and $_ -notmatch '^\s*#' } |
    ForEach-Object { $_.Trim() -replace '\\', '/' } |
    Where-Object { $_ -ne '' }

# Companion files bundled by pack.ps1 outside the manifest
$manifestFiles = @(Get-ChildItem -Path $InstDir -Filter '*.manifest.txt' | ForEach-Object { "install/versions/$($_.Name)" })
$extras = @(
    'install/VERSION',
    'install/options.jsonc',
    'install/install.sh',
    'install/install.ps1',
    'bin/opencode-config',
    'bin/opencode-config.ps1'
) + $manifestFiles
$expected = ($manifest + $extras) | Sort-Object -Unique

$Work = Join-Path $DistDir '.verify-tmp'
if (Test-Path $Work) { Remove-Item $Work -Recurse -Force }
New-Item -ItemType Directory -Path $Work | Out-Null

$failures = 0

function Verify-Archive([string]$archive, [string]$extractDir) {
    $script:failures += 0
    if (-not (Test-Path $archive)) {
        Write-Host ("=== {0} === NOT FOUND" -f (Split-Path $archive -Leaf))
        $script:failures += 1
        return
    }
    if ($archive -match '\.zip$') {
        Expand-Archive -Path $archive -DestinationPath $extractDir -Force
    } else {
        New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
        tar -xzf $archive -C $extractDir
        if ($LASTEXITCODE -ne 0) { throw "failed to extract $archive" }
    }

    # package root is the single top-level directory inside the archive
    $top = Get-ChildItem $extractDir
    $pkgRoot = if ($top.Count -eq 1 -and $top.PSIsContainer) { $top.FullName } else { $extractDir }

    $actual = Get-ChildItem -Path $pkgRoot -Recurse -File -Force | ForEach-Object {
        $_.FullName.Substring($pkgRoot.Length).TrimStart('\', '/') -replace '\\', '/'
    } | Sort-Object -Unique

    $missing = $expected | Where-Object { $_ -notin $actual }
    $extra = $actual | Where-Object { $_ -notin $expected }

    Write-Host ("=== {0} ===" -f (Split-Path $archive -Leaf))
    Write-Host ("expected: {0}, actual: {1}" -f $expected.Count, $actual.Count)
    foreach ($m in $missing) { Write-Host ("  MISSING: {0}" -f $m); $script:failures++ }
    foreach ($x in $extra) { Write-Host ("  UNEXPECTED: {0}" -f $x); $script:failures++ }
    if (-not $missing -and -not $extra) { Write-Host "file list: OK" }

    # content integrity: hash every manifest file against the repo source
    $diffs = 0
    foreach ($rel in $manifest) {
        $src = Join-Path $RepoRoot ($rel -replace '/', '\')
        $dst = Join-Path $pkgRoot ($rel -replace '/', '\')
        if (-not (Test-Path $dst)) { continue } # already reported as missing
        $h1 = (Get-FileHash $src -Algorithm SHA256).Hash
        $h2 = (Get-FileHash $dst -Algorithm SHA256).Hash
        if ($h1 -ne $h2) { Write-Host ("  CONTENT DIFF: {0}" -f $rel); $diffs++; $script:failures++ }
    }
    if ($diffs -eq 0) { Write-Host ("content integrity: OK ({0} files)" -f $manifest.Count) }
    Write-Host ''
}

try {
    Verify-Archive (Join-Path $DistDir "opencode-config-$ver.zip") (Join-Path $Work 'zip')
    Verify-Archive (Join-Path $DistDir "opencode-config-$ver.tar.gz") (Join-Path $Work 'tgz')
} finally {
    Remove-Item $Work -Recurse -Force
}

if ($failures -gt 0) {
    Write-Host "verify: FAILED ($failures problem(s))" -ForegroundColor Red
    exit 1
}
Write-Host "verify: OK (version $ver)" -ForegroundColor Green
