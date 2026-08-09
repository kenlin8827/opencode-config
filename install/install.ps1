#requires -Version 5.1
<#
.SYNOPSIS
    Install/upgrade opencode config (~/.config/opencode) from this repo.

.DESCRIPTION
    - Generates a per-version file manifest under <repo>/install/versions/<version>.manifest.txt
      (auto-generated on install if missing).
    - On install: reads the target's .CONFIG_VERSION, deletes every file listed by
      THAT version's manifest, then overwrites the target with every file listed
      by the CURRENT manifest. Finally writes the new .CONFIG_VERSION.
    - Skipped paths (.git, node_modules, .metrics, install) are never shipped
      and never deleted from the target.

.PARAMETER Mode
    Generate | Install | Status

    - Generate  Scan repo, write install/versions/<ver>.manifest.txt (no install).
    - Install   Apply current manifest to $Target (auto-generates if missing). Default.
    - Status    Show installed version vs repo version, no changes.

.PARAMETER Target
    Install target (defaults to ~/.config/opencode).

.PARAMETER Force
    Install even when installed version equals repo version.

.EXAMPLE
    pwsh ./install/install.ps1 -Mode Generate        # before tagging a release
    pwsh ./install/install.ps1 -Mode Install         # apply current manifest
    pwsh ./install/install.ps1 -Mode Install -Force  # re-apply same version
    pwsh ./install/install.ps1 -Mode Status

.NOTES
    Manifest format: one repo-relative path per line, forward slashes.
    Lines starting with # are comments. Trailing whitespace ignored.
#>

[CmdletBinding()]
param(
    [ValidateSet('Generate', 'Install', 'Status')]
    [string]$Mode = 'Install',
    [string]$Target,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Target) { $Target = Join-Path $HOME '.config/opencode' }

# ponytail: whitelist the 5 paths opencode actually reads at runtime — nothing else ships
$includePrefixes = @('agents/', 'commands/', 'plugins/', 'instructions/', 'opencode.jsonc')
$markerRel = '.CONFIG_VERSION'  # active-version marker written into $Target (source is install/VERSION)

function Read-Version {
    # ponytail: VERSION lives next to the script (install/VERSION); never inside $skipDirs scan,
    # never in the manifest — its content is shipped as $markerRel via Write-Marker instead
    $f = Join-Path $PSScriptRoot 'VERSION'
    if (-not (Test-Path $f)) {
        # fallback: short sha so the script never breaks for lack of a tag
        return (git -C $RepoRoot rev-parse --short HEAD 2>$null).Trim()
    }
    (Get-Content $f -TotalCount 1).Trim()
}

function Read-Manifest([string]$path) {
    if (-not (Test-Path $path)) { return @() }
    Get-Content $path |
        Where-Object { $_ -and $_ -notmatch '^\s*#' } |
        ForEach-Object { $_.Trim() -replace '\\', '/' } |
        Where-Object { $_ -ne '' }
}

function Read-Installed-Version {
    $f = Join-Path $Target $markerRel
    if (-not (Test-Path $f)) { return $null }
    (Get-Content $f -TotalCount 1).Trim()
}

function Write-Marker([string]$ver) {
    $f = Join-Path $Target $markerRel
    Set-Content -Path $f -Value $ver -Encoding UTF8 -NoNewline
}

function Generate-Manifest([string]$ver) {
    $outDir = Join-Path $RepoRoot 'install/versions'
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    $out = Join-Path $outDir "$ver.manifest.txt"
    $lines = @()
    Get-ChildItem -Path $RepoRoot -Recurse -File -Force | ForEach-Object {
        $rel = $_.FullName.Substring($RepoRoot.Length).TrimStart('\','/') -replace '\\','/'
        $include = $false
        foreach ($p in $includePrefixes) {
            if ($rel -eq $p.TrimEnd('/') -or $rel.StartsWith($p)) { $include = $true; break }
        }
        if ($include) { $lines += $rel }
    }
    $lines | Sort-Object | Set-Content -Path $out -Encoding UTF8
    Write-Host ("wrote install/versions/{0}.manifest.txt ({1} files)" -f $ver, $lines.Count)
}

function Remove-ManifestFiles([string[]]$files, [string]$base, [string]$label) {
    if (-not $files -or $files.Count -eq 0) {
        Write-Host "[$label] no files to remove"
        return
    }
    foreach ($f in $files) {
        # ponytail: never delete the marker itself, even if a stale manifest listed it
        if ($f -eq $markerRel) { continue }
        $p = Join-Path $base $f
        if (Test-Path $p) {
            Remove-Item -LiteralPath $p -Recurse -Force
            Write-Host "[$label] rm $f"
        }
    }
}

function Copy-ManifestFiles([string[]]$files, [string]$from, [string]$to, [string]$label) {
    foreach ($f in $files) {
        $src = Join-Path $from $f
        $dst = Join-Path $to   $f
        if (-not (Test-Path $src)) {
            Write-Warning "[$label] missing source: $f"
            continue
        }
        $dstDir = Split-Path $dst -Parent
        if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
        Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
        Write-Host "[$label] cp $f"
    }
}

# ponytail: only the two credential fields under provider.*.options are preserved across reinstalls;
# every other field in opencode.jsonc comes from the repo (current behavior)
$preserveJsonKeys = @('baseURL', 'apiKey')

function Read-Preserve([string]$dst) {
    # returns hashtable of "provider.<name>.options.<key>" => value, or $null if no prior opencode.jsonc
    $f = Join-Path $dst 'opencode.jsonc'
    if (-not (Test-Path $f)) { return $null }
    try {
        $obj = Get-Content $f -Raw | ConvertFrom-Json
        $bag = @{}
        foreach ($pname in $obj.provider.PSObject.Properties.Name) {
            $opts = $obj.provider.$pname.options
            if (-not $opts) { continue }
            foreach ($k in $preserveJsonKeys) {
                if ($opts.PSObject.Properties.Name -contains $k) {
                    $bag["provider.$pname.options.$k"] = $opts.$k
                }
            }
        }
        return $bag
    } catch { return $null }
}

function Restore-Preserve([string]$dst, $bag) {
    if (-not $bag -or $bag.Count -eq 0) { return }
    $f = Join-Path $dst 'opencode.jsonc'
    $obj = Get-Content $f -Raw | ConvertFrom-Json
    foreach ($key in $bag.Keys) {
        # dotted path: provider.<name>.options.<field>
        $parts = $key -split '\.'
        if ($parts.Count -ne 4 -or $parts[0] -ne 'provider' -or $parts[2] -ne 'options') { continue }
        $pname = $parts[1]; $field = $parts[3]
        if (-not $obj.provider.$pname) {
            # ponytail: bag references a provider that's missing after the copy step
            # (e.g. user added a custom provider we don't ship). Re-create it so the user's
            # credentials aren't silently dropped — the next reinstall will hit the same path.
            $obj.provider | Add-Member -NotePropertyName $pname -NotePropertyValue ([pscustomobject]@{}) -Force
        }
        $opts = $obj.provider.$pname.options
        if (-not $opts) {
            $obj.provider.$pname | Add-Member -NotePropertyName options -NotePropertyValue ([pscustomobject]@{}) -Force
            $opts = $obj.provider.$pname.options
        }
        if ($opts.PSObject.Properties.Name -contains $field) {
            $opts.$field = $bag[$key]
        } else {
            $opts | Add-Member -NotePropertyName $field -NotePropertyValue $bag[$key] -Force
        }
    }
    $obj | ConvertTo-Json -Depth 20 | Set-Content -Path $f -Encoding UTF8
}

$ver     = Read-Version
$instDir = Join-Path $RepoRoot 'install/versions'
$curMan  = Join-Path $instDir "$ver.manifest.txt"

switch ($Mode) {
    'Generate' {
        if (Test-Path $curMan) {
            throw "install/versions/$ver.manifest.txt already exists; remove it first to regenerate"
        }
        Generate-Manifest $ver
    }
    'Status' {
        $installed = Read-Installed-Version
        Write-Host ("installed: {0}" -f ($(if ($installed) { $installed } else { '(none)' })))
        Write-Host ("repo:      {0}" -f $ver)
        Write-Host ("manifest:  install/versions/{0}.manifest.txt ({1})" -f $ver, $(if (Test-Path $curMan) { 'present' } else { 'will auto-generate on next install' }))
    }
    'Install' {
        if (-not (Test-Path $curMan)) {
            Write-Host ("install/versions/{0}.manifest.txt missing, generating..." -f $ver)
            Generate-Manifest $ver
        }
        $installed = Read-Installed-Version
        if ($installed -eq $ver -and -not $Force) {
            Write-Host "already at $ver, nothing to do (-Force to reapply)"
            return
        }
        if (-not (Test-Path $Target)) { New-Item -ItemType Directory -Path $Target -Force | Out-Null }

        # ponytail: snapshot the existing marker before any destructive work so a partial
        # failure leaves the target referencing the version that's actually still on disk
        $prevMarkerBackup = $null
        if ($installed) {
            $prevMarkerBackup = Join-Path $Target ($markerRel + '.bak')
            Copy-Item -LiteralPath (Join-Path $Target $markerRel) -Destination $prevMarkerBackup -Force
        }

        try {
            # 1) remove files listed by previous version's manifest
            if ($installed) {
                $prevMan = Join-Path $instDir "$installed.manifest.txt"
                $prevFiles = Read-Manifest $prevMan
                Write-Host ("[prev: {0}] removing {1} files" -f $installed, $prevFiles.Count)
                Remove-ManifestFiles $prevFiles $Target "prev"
            } else {
                Write-Host "[prev: none] skipping removal"
            }

            # 2) copy current manifest over target (preserve user credentials in opencode.jsonc)
            $curFiles = Read-Manifest $curMan
            Write-Host ("[cur: {0}] copying {1} files" -f $ver, $curFiles.Count)
            $preserve = Read-Preserve $Target
            Copy-ManifestFiles $curFiles $RepoRoot $Target "cur"
            if ($preserve) {
                Restore-Preserve $Target $preserve
                Write-Host ("[cur: {0}] preserved {1} credential field(s) in opencode.jsonc" -f $ver, $preserve.Count)
            }

            # 3) marker goes last — only success reaches here
            Write-Marker $ver
            Write-Host "installed $ver"
        } catch {
            # restore the old marker so the next run can reconcile against the version still on disk
            if ($prevMarkerBackup -and (Test-Path $prevMarkerBackup)) {
                Copy-Item -LiteralPath $prevMarkerBackup -Destination (Join-Path $Target $markerRel) -Force
                Remove-Item -LiteralPath $prevMarkerBackup -Force
                Write-Error ("install failed; restored marker to $installed. Cause: $($_.Exception.Message)")
            } else {
                Write-Error ("install failed; target may be in a partial state. Re-run with -Force. Cause: $($_.Exception.Message)")
            }
            throw
        }
        if ($prevMarkerBackup -and (Test-Path $prevMarkerBackup)) {
            Remove-Item -LiteralPath $prevMarkerBackup -Force
        }
    }
}