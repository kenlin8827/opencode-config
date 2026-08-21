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

    Subcommands (positional, like install.sh):
      install     Apply current manifest to target (default).
      generate    Scan repo, write manifest (no install).
      status      Show installed version vs repo version, no changes.
      init        Backup target to a timestamped sibling, then clear it.
      register    Install the global shim into ~/.local/bin.
      unregister  Remove the global shim from ~/.local/bin.

.PARAMETER Target
    Install target (defaults to ~/.config/opencode).

.PARAMETER Force
    Install even when installed version equals repo version.

.PARAMETER NoBackup
    Skip the backup step when running `init`.

.PARAMETER Yes
    Skip the confirmation prompt when running `init`.

.PARAMETER BinDir
    Directory for the global shim (defaults to ~/.local/bin; overrides
    $env:OPENCODE_BIN_DIR if both are set).

.PARAMETER NoRtk
    Skip the rtk binary download (token-saving CLI proxy auto-provisioned
    into <target>/bin/rtk.exe during install).

.PARAMETER NoMcp
    Skip MCP CLI provisioning. Config-driven: every enabled `mcp` entry in
    opencode.jsonc that carries an `install` field is installed when its
    CLI (command[0]) is missing from PATH. Disabled entries are skipped even
    if they pre-declare `install` (e.g. gitnexus).

.PARAMETER EnableMcp
    Flip the named mcp entries to enabled=true in the target opencode.jsonc
    (repeatable). Runs after preserve-restore, so it overrides any previously
    preserved state; the choice then survives future reinstalls via preserve.
    Provisioning (Ensure-Mcp) sees the flipped state, so enabling an entry
    with an `install` field also installs its CLI in the same run.

.PARAMETER DisableMcp
    Flip the named mcp entries to enabled=false (repeatable, same semantics
    as -EnableMcp).

.EXAMPLE
    pwsh ./install/install.ps1                 # install (default)
    pwsh ./install/install.ps1 install -Force  # re-apply same version
    pwsh ./install/install.ps1 status          # show installed vs repo version
    pwsh ./install/install.ps1 generate        # generate manifest only
    pwsh ./install/install.ps1 init            # backup + clear target (fresh start)
    pwsh ./install/install.ps1 init -NoBackup  # clear without backup
    pwsh ./install/install.ps1 init -Yes       # skip confirmation prompt
    pwsh ./install/install.ps1 register        # install global opencode-config command
    pwsh ./install/install.ps1 register -BinDir C:\Tools\bin
    pwsh ./install/install.ps1 unregister      # remove global command
    pwsh ./install/install.ps1 install -EnableMcp gitnexus     # enable an MCP
    pwsh ./install/install.ps1 install -DisableMcp codegraph   # disable an MCP

.NOTES
    Manifest format: one repo-relative path per line, forward slashes.
    Lines starting with # are comments. Trailing whitespace ignored.
#>

[CmdletBinding()]
param(
    [Alias('t')][string]$Target,
    [Alias('f')][switch]$Force,
    [switch]$NoBackup,
    [Alias('y')][switch]$Yes,
    [Alias('b')][string]$BinDir,
    [switch]$NoRtk,
    [switch]$NoMcp,
    [string[]]$EnableMcp,
    [string[]]$DisableMcp,
    [Alias('h')][switch]$Help,
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)][string[]]$CommandArgs
)

$ErrorActionPreference = 'Stop'

# --- subcommand parse -------------------------------------------------------
# Positional subcommand (install / generate / status / init), mirroring install.sh.
# Named params (-Target, -Force, -NoBackup, -Yes) are bound by PowerShell's
# parameter binder; everything else lands in $CommandArgs.
$Mode = 'Install'
if ($Help) {
    Get-Help $PSCommandPath -Detailed
    exit 0
}
if ($CommandArgs) {
    foreach ($token in $CommandArgs) {
        switch ($token) {
            'install'   { $Mode = 'Install' }
            'generate'  { $Mode = 'Generate' }
            'status'    { $Mode = 'Status' }
            'init'      { $Mode = 'Init' }
            'register'  { $Mode = 'Register' }
            'unregister'{ $Mode = 'Unregister' }
            '--help'    { Get-Help $PSCommandPath -Detailed; exit 0 }
            default     { throw "unknown arg: $token" }
        }
    }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Target) { $Target = Join-Path $HOME '.config/opencode' }
if (-not $BinDir) { $BinDir = if ($env:OPENCODE_BIN_DIR) { $env:OPENCODE_BIN_DIR } else { Join-Path $HOME '.local/bin' } }

# Global shim state.
$shimName   = 'opencode-config.ps1'
$shimSrc    = Join-Path $RepoRoot "bin/$shimName"
$shimSentinel = 'generated by opencode-config register'

# Whitelist the paths opencode actually reads at runtime — nothing else ships.
# providers/ ships as merge sources: install folds each providers/*.json into
# opencode.jsonc's `provider` node (see Merge-Providers).
$includePrefixes = @('agents/', 'commands/', 'plugins/', 'instructions/', 'opencode.jsonc', 'tui.json', 'profiles/', 'providers/')
$markerRel = '.CONFIG_VERSION'  # active-version marker written into $Target (source is install/VERSION)

# rtk (https://github.com/rtk-ai/rtk) — CLI proxy that compresses command
# output before it reaches the LLM (60-90% smaller bash output). Install
# provisions it out of the box: if the binary is missing it's downloaded
# into ~/.local/bin (added to the user PATH when needed). The opencode
# integration ships in-tree as plugins/openrtk.ts (vendored openrtk) —
# no `rtk init` step; the official rtk.ts plugin is removed if present.
$RtkVersion = '0.45.0'
$RtkSha256  = '34cea9009a8099acdaf85147b971d95f65efabfa63fb3aea7d3e2b73e6f517c3'  # rtk-x86_64-pc-windows-msvc.zip

function Read-Version {
    # VERSION lives next to the script (install/VERSION); never inside $skipDirs scan,
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

function Test-PathContains([string]$dir) {
    $sep = [IO.Path]::PathSeparator
    $found = $false
    $env:PATH.Split($sep) | ForEach-Object { if ($_ -eq $dir) { $found = $true } }
    return $found
}

function Write-Shim([string]$dest) {
    $dir = Split-Path $dest -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $lines = @(
        '# generated by opencode-config register — do not edit; rewritten on the next `register`.'
        "& `"$shimSrc`" @args"
    )
    $lines | Set-Content -Path $dest -Encoding UTF8
}

function Test-ShimOwned([string]$dest) {
    if (-not (Test-Path $dest)) { return $true }
    $head = (Get-Content -LiteralPath $dest -TotalCount 2) -join "`n"
    return $head -like "*$shimSentinel*"
}

# Provisions rtk out of the box: download the pinned release into
# ~/.local/bin when no rtk is on PATH (SHA256-verified, added to the user
# PATH when needed). The opencode hook is the vendored openrtk plugin
# (plugins/openrtk.ts, shipped with the config copy) — this function only
# removes a leftover official rtk.ts plugin so commands aren't rewritten
# twice. Any failure only warns — install itself never fails because of rtk.
function Ensure-Rtk([string]$dst) {
    if ($NoRtk) {
        Write-Host '[rtk] skipped (-NoRtk)'
        return
    }
    try {
        $exe = (Get-Command rtk -ErrorAction SilentlyContinue).Source
        if (-not $exe) {
            # legacy location from the first 0.1.4 installer iteration
            $legacy = Join-Path $dst 'bin/rtk.exe'
            $homeBin = Join-Path $HOME '.local/bin'
            if (Test-Path $legacy) {
                if (-not (Test-Path $homeBin)) { New-Item -ItemType Directory -Path $homeBin -Force | Out-Null }
                Move-Item -LiteralPath $legacy -Destination (Join-Path $homeBin 'rtk.exe') -Force
                $exe = Join-Path $homeBin 'rtk.exe'
            } else {
                if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
                    Write-Warning "[rtk] no prebuilt binary for $($env:PROCESSOR_ARCHITECTURE) — skipping"
                    return
                }
                $url = "https://github.com/rtk-ai/rtk/releases/download/v$RtkVersion/rtk-x86_64-pc-windows-msvc.zip"
                $tmpDir = Join-Path ([IO.Path]::GetTempPath()) ("rtk-" + [guid]::NewGuid().ToString('N'))
                $zip = "$tmpDir.zip"
                try {
                    Write-Host "[rtk] downloading rtk v$RtkVersion ..."
                    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
                    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
                    $hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
                    if ($hash -ne $RtkSha256) {
                        throw "checksum mismatch: expected $RtkSha256, got $hash"
                    }
                    Expand-Archive -Path $zip -DestinationPath $tmpDir -Force
                    $extracted = Get-ChildItem $tmpDir -Recurse -Filter 'rtk.exe' | Select-Object -First 1
                    if (-not $extracted) { throw 'rtk.exe not found in archive' }
                    if (-not (Test-Path $homeBin)) { New-Item -ItemType Directory -Path $homeBin -Force | Out-Null }
                    Move-Item -LiteralPath $extracted.FullName -Destination (Join-Path $homeBin 'rtk.exe') -Force
                    $exe = Join-Path $homeBin 'rtk.exe'
                    Write-Host "[rtk] installed: $exe"
                } finally {
                    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
                    Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
                }
            }
            if (-not (Test-PathContains $homeBin)) {
                [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ";$homeBin", 'User')
                $env:PATH = "$env:PATH;$homeBin"   # make it visible to rtk init below
                Write-Host "[rtk] added $homeBin to user PATH (persistent; current shell updated)"
            }
        } else {
            Write-Host "[rtk] binary present: $exe"
        }
        # The opencode hook ships in-tree (plugins/openrtk.ts). Remove a
        # leftover official plugin from a previous `rtk init -g --opencode`
        # so tool.execute.before doesn't rewrite commands twice. Only files
        # carrying the official marker are touched — user code stays put.
        $rtkPlugin = Join-Path $dst 'plugins/rtk.ts'
        if (Test-Path $rtkPlugin) {
            $content = Get-Content $rtkPlugin -Raw
            if ($content -match 'RTK OpenCode plugin') {
                Remove-Item -LiteralPath $rtkPlugin -Force
                Write-Host '[rtk] removed official plugin plugins/rtk.ts (replaced by vendored openrtk)'
            }
        }
        # opt out of telemetry by default — users can re-enable with `rtk telemetry enable`.
        # Probe first: older builds (< ~0.40) have no telemetry subcommand and
        # would proxy `telemetry` as an external program (noisy error).
        $hasTelemetry = & $exe --help 2>&1 | Out-String
        if ($hasTelemetry -match '(?m)^\s*telemetry\b') {
            & $exe telemetry disable 2>&1 | ForEach-Object { Write-Host "[rtk] $_" }
        }
    } catch {
        Write-Warning "[rtk] setup failed — continuing without rtk. Cause: $($_.Exception.Message)"
    }
}

# Config-driven MCP CLI provisioning: walks opencode.jsonc's `mcp` block and
# runs each entry's `install` field when the entry is enabled and its CLI
# (command[0]) is missing from PATH. Adding a new MCP to the config is all it
# takes — no script changes. Idempotent (present → skip); disabled entries are
# skipped even if they pre-declare `install` (e.g. gitnexus — flipping
# enabled to true makes the next install provision it). Missing package
# managers or install failures only warn — opencode degrades to grep/glob.
# Like Ensure-Rtk, never fails the install itself.
function Ensure-Mcp([string]$dst) {
    if ($NoMcp) {
        Write-Host '[mcp] skipped (-NoMcp)'
        return
    }
    $cfg = Join-Path $dst 'opencode.jsonc'
    if (-not (Test-Path $cfg)) { return }
    # Strip comment lines before parsing — ConvertFrom-Json tolerates most
    # JSONC, but whole-line // comments are the safe subset to strip.
    $lines = Get-Content $cfg | Where-Object { $_ -notmatch '^\s*//' }
    try { $obj = ($lines -join "`n") | ConvertFrom-Json }
    catch { Write-Warning "[mcp] cannot parse opencode.jsonc — skipping MCP provisioning. Cause: $($_.Exception.Message)"; return }
    if (-not $obj.mcp) { return }
    foreach ($name in $obj.mcp.PSObject.Properties.Name) {
        $m = $obj.mcp.$name
        if (-not ($m.enabled)) { continue }
        $cli = if ($m.command -is [array] -and $m.command.Count -gt 0) { [string]$m.command[0] } elseif ($m.command) { [string]$m.command } else { $null }
        if (-not $cli -or -not $m.install) { continue }
        if (Get-Command $cli -ErrorAction SilentlyContinue) {
            Write-Host "[mcp] $name already present"
            continue
        }
        Write-Host "[mcp] installing $name ($($m.install)) ..."
        try {
            # naive arg split — install commands in opencode.jsonc carry no quoted args
            $parts = ([string]$m.install) -split '\s+'
            & $parts[0] $parts[1..($parts.Count - 1)]
            if ($LASTEXITCODE -ne 0) { throw "exited $LASTEXITCODE" }
            if (Get-Command $cli -ErrorAction SilentlyContinue) {
                Write-Host "[mcp] $name installed"
            } else {
                Write-Warning "[mcp] $name installed but '$cli' not on PATH yet — check its docs (e.g. 'uv tool update-shell'), then restart the terminal"
            }
        } catch {
            Write-Warning "[mcp] $name install failed — continuing without it (set mcp.$name.enabled=false if unneeded). Cause: $($_.Exception.Message)"
        }
    }
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
        # Never delete the marker itself, even if a stale manifest listed it
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

# Writes opencode.jsonc back to disk in repo style: pretty 2-space JSON, but
# every provider model entry stays on one line (mirrors providers/*.json and
# the hand-written opencode.jsonc). Plain ConvertTo-Json expands each model
# into ~15 lines. Trick: stringify model entries first, pretty-print, then
# unquote exactly those lines back into inline objects.
function Write-ConfigJson([string]$path, $obj) {
    # 1) stringify model entries so the pretty-printer keeps them intact
    if ($obj.provider) {
        foreach ($pn in $obj.provider.PSObject.Properties.Name) {
            $models = $obj.provider.$pn.models
            if (-not $models) { continue }
            foreach ($mn in $models.PSObject.Properties.Name) {
                $models.$mn = $models.$mn | ConvertTo-Json -Depth 10 -Compress
            }
        }
    }
    # 2) pretty-print, 3) strip the string wrapper off the stringified entries
    $text = $obj | ConvertTo-Json -Depth 20
    $text = [regex]::Replace($text, '(?m)^(\s*"[^"]+"\s*:\s*)"(\{\\".*\})"(,?)\s*$', {
        param($m)
        # unescape, then re-add the spaces the repo style uses ({ "name": "...", ... })
        $inner = $m.Groups[2].Value.Replace('\"', '"')
        $inner = $inner -replace ',"', ', "' -replace '":', '": ' -replace '\{', '{ ' -replace '\}', ' }'
        $m.Groups[1].Value + $inner + $m.Groups[3].Value
    })
    Set-Content -Path $path -Value $text -Encoding UTF8
}

# Merges providers/*.json definitions into opencode.jsonc's `provider` node:
# extract the existing node, layer shipped definitions on top (repo wins per
# provider key — user-added providers we don't ship survive), overwrite-write.
# Runs BEFORE Restore-Preserve so preserved baseURL/apiKey still land on top
# of any {env:...} placeholders the shipped definitions carry.
function Merge-Providers([string]$dst) {
    $cfg = Join-Path $dst 'opencode.jsonc'
    $dir = Join-Path $dst 'providers'
    if (-not (Test-Path $cfg) -or -not (Test-Path $dir)) { return 0 }
    $defs = @(Get-ChildItem $dir -Filter '*.json' -File)
    if ($defs.Count -eq 0) { return 0 }
    $obj = Get-Content $cfg -Raw | ConvertFrom-Json
    if (-not ($obj.PSObject.Properties.Name -contains 'provider')) {
        $obj | Add-Member -NotePropertyName 'provider' -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    $count = 0
    foreach ($f in $defs) {
        try { $fileObj = Get-Content $f.FullName -Raw | ConvertFrom-Json }
        catch { Write-Warning "[cur] skipping invalid provider file: providers/$($f.Name)"; continue }
        foreach ($pname in $fileObj.PSObject.Properties.Name) {
            $obj.provider | Add-Member -NotePropertyName $pname -NotePropertyValue $fileObj.$pname -Force
            $count++
        }
    }
    if ($count -gt 0) {
        Write-ConfigJson $cfg $obj
    }
    return $count
}

# Preserved across reinstalls: the two credential fields under provider.*.options,
# the root `model`, and one model ref per tier (agents of a tier share one ref —
# same tier semantics as the /profile plugin). Everything else comes from the repo.
$preserveJsonKeys = @('baseURL', 'apiKey')

function Read-Preserve([string]$dst) {
    # returns hashtable of "provider.<name>.options.<key>" => value,
    # "model" => root model, "tier.<name>" => tier model ref,
    # "mcp.<name>.enabled" => bool; or $null if no prior opencode.jsonc
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
        # Root model + per-tier refs: first hit per tier wins (all agents of a
        # tier share one ref when managed via the /profile plugin).
        if ($obj.PSObject.Properties.Name -contains 'model' -and $obj.model) {
            $bag['model'] = [string]$obj.model
        }
        if ($obj.agent) {
            foreach ($aname in $obj.agent.PSObject.Properties.Name) {
                $a = $obj.agent.$aname
                if ($a.tier -and $a.model -and -not $bag.ContainsKey("tier.$($a.tier)")) {
                    $bag["tier.$($a.tier)"] = [string]$a.model
                }
            }
        }
        # MCP enabled flags — user choices made via -EnableMcp/-DisableMcp
        # (or edited by hand) survive reinstalls.
        if ($obj.mcp) {
            foreach ($mn in $obj.mcp.PSObject.Properties.Name) {
                $m = $obj.mcp.$mn
                if ($m.PSObject.Properties.Name -contains 'enabled') {
                    $bag["mcp.$mn.enabled"] = [bool]$m.enabled
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
        if ($key -eq 'model') {
            # root model — tracks the user's default-tier choice
            if ($obj.PSObject.Properties.Name -contains 'model') {
                $obj.model = $bag[$key]
            } else {
                $obj | Add-Member -NotePropertyName 'model' -NotePropertyValue $bag[$key] -Force
            }
            continue
        }
        if ($key -like 'tier.*') { continue }  # applied after this loop
        if ($key -like 'mcp.*.enabled') {
            $parts = $key -split '\.'
            if ($obj.mcp -and $obj.mcp.$($parts[1])) {
                $obj.mcp.$($parts[1]).enabled = $bag[$key]
            }
            continue
        }
        # dotted path: provider.<name>.options.<field>
        $parts = $key -split '\.'
        if ($parts.Count -ne 4 -or $parts[0] -ne 'provider' -or $parts[2] -ne 'options') { continue }
        $pname = $parts[1]; $field = $parts[3]
        if (-not $obj.provider.$pname) {
            # Bag references a provider that's missing after the copy step
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
    # Tier refs: rewrite every agent of the tier in lockstep (same semantics as
    # the /profile plugin's apply) — also covers agents a newer template added.
    if ($obj.agent) {
        foreach ($key in $bag.Keys) {
            if ($key -notlike 'tier.*') { continue }
            $tier = $key -replace '^tier\.', ''
            $ref = $bag[$key]
            foreach ($name in $obj.agent.PSObject.Properties.Name) {
                if ($obj.agent.$name.tier -eq $tier) { $obj.agent.$name.model = $ref }
            }
        }
    }
    Write-ConfigJson $f $obj
}

# Flips mcp.<name>.enabled in the target opencode.jsonc per -EnableMcp /
# -DisableMcp. Runs AFTER Restore-Preserve so explicit flags win over
# preserved state; the new state is then preserved by future reinstalls.
# Unknown entry names only warn. Provisioning (Ensure-Mcp) runs afterwards
# and sees the flipped state.
function Set-McpEnabled([string]$dst, [string[]]$enable, [string[]]$disable) {
    if (-not $enable -and -not $disable) { return }
    $cfg = Join-Path $dst 'opencode.jsonc'
    if (-not (Test-Path $cfg)) { return }
    $lines = Get-Content $cfg | Where-Object { $_ -notmatch '^\s*//' }
    try { $obj = ($lines -join "`n") | ConvertFrom-Json }
    catch { Write-Warning "[mcp] cannot parse opencode.jsonc — -EnableMcp/-DisableMcp ignored. Cause: $($_.Exception.Message)"; return }
    if (-not $obj.mcp) {
        Write-Warning '[mcp] no mcp block in opencode.jsonc — -EnableMcp/-DisableMcp ignored'
        return
    }
    $changed = 0
    foreach ($n in $enable) {
        if ($obj.mcp.$n) { $obj.mcp.$n.enabled = $true;  $changed++; Write-Host "[mcp] enabled: $n" }
        else { Write-Warning "[mcp] unknown entry '$n' — -EnableMcp ignored" }
    }
    foreach ($n in $disable) {
        if ($obj.mcp.$n) { $obj.mcp.$n.enabled = $false; $changed++; Write-Host "[mcp] disabled: $n" }
        else { Write-Warning "[mcp] unknown entry '$n' — -DisableMcp ignored" }
    }
    if ($changed -gt 0) { Write-ConfigJson $cfg $obj }
}

$ver     = Read-Version
$instDir = Join-Path $RepoRoot 'install/versions'
$curMan  = Join-Path $instDir "$ver.manifest.txt"

switch ($Mode) {
    'Register' {
        if (-not (Test-Path $shimSrc)) {
            throw "missing: $shimSrc — this repo is incomplete, expected bin/opencode-config.ps1"
        }
        $dest = Join-Path $BinDir $shimName
        if (-not (Test-ShimOwned $dest)) {
            throw "refusing to overwrite existing file at $dest (not our shim); remove it manually, or pass -BinDir to choose a different location"
        }
        Write-Shim $dest
        Write-Host "registered: $dest"
        Write-Host "           -> $shimSrc"
        if (-not (Test-PathContains $BinDir)) {
            Write-Host ''
            Write-Host "NOTE: $BinDir is not on PATH."
            Write-Host "  [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$BinDir', 'User')"
        }
    }
    'Unregister' {
        $dest = Join-Path $BinDir $shimName
        if (-not (Test-Path $dest)) {
            Write-Host "not registered at $dest (nothing to do)"
            return
        }
        if (-not (Test-ShimOwned $dest)) {
            throw "refusing to remove $dest (does not look like an opencode-config shim)"
        }
        Remove-Item -LiteralPath $dest -Force
        Write-Host "unregistered: $dest"
    }
    'Init' {
        # Backup the entire target directory to a timestamped sibling, then clear it.
        # Designed for a fresh start: after init, run `install` to reinstall
        # the config files; credentials are then configured inside opencode.
        if (-not (Test-Path $Target)) {
            Write-Host "target directory does not exist: $Target"
            Write-Host 'nothing to do'
            return
        }
        $items = @(Get-ChildItem $Target -Force)
        if ($items.Count -eq 0) {
            Write-Host "target directory is already empty: $Target"
            return
        }

        # Timestamped backup as a sibling directory.
        $timestamp = (Get-Date -Format 'yyyyMMdd-HHmmss')
        $backupDir = "${Target}.backup.${timestamp}"

        if (-not $NoBackup) {
            Copy-Item $Target $backupDir -Recurse -Force
            $backupCount = @(Get-ChildItem $backupDir -Recurse -Force).Count
            Write-Host ("backed up {0} item(s) to: {1}" -f $backupCount, $backupDir)
        } else {
            Write-Host 'skipping backup (-NoBackup)'
        }

        # Confirmation before destructive operation.
        if (-not $Yes) {
            $confirm = Read-Host "clear all files in $Target? (y/N)"
            if ($confirm -ne 'y' -and $confirm -ne 'Y') {
                Write-Host 'cancelled'
                return
            }
        }

        # Clear everything in the target directory (keep the directory itself).
        foreach ($item in $items) {
            Remove-Item $item.FullName -Recurse -Force
        }
        Write-Host ("cleared {0} ({1} item(s) removed)" -f $Target, $items.Count)
        Write-Host ''
        Write-Host 'next steps:'
        Write-Host '  pwsh install/install.ps1 install   # reinstall config files'
    }
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

        # Snapshot the existing marker before any destructive work so a partial
        # failure leaves the target referencing the version that's actually still on disk
        $prevMarkerBackup = $null
        if ($installed) {
            $prevMarkerBackup = Join-Path $Target ($markerRel + '.bak')
            Copy-Item -LiteralPath (Join-Path $Target $markerRel) -Destination $prevMarkerBackup -Force
        }

        try {
            # Snapshot user state in opencode.jsonc BEFORE anything gets removed —
            # step 1 deletes it as part of the previous manifest
            $preserve = Read-Preserve $Target

            # 1) remove files listed by previous version's manifest
            if ($installed) {
                $prevMan = Join-Path $instDir "$installed.manifest.txt"
                $prevFiles = Read-Manifest $prevMan
                Write-Host ("[prev: {0}] removing {1} files" -f $installed, $prevFiles.Count)
                Remove-ManifestFiles $prevFiles $Target "prev"
            } else {
                Write-Host "[prev: none] skipping removal"
            }

            # 2) copy current manifest over target (preserve credentials + model picks in opencode.jsonc)
            $curFiles = Read-Manifest $curMan
            Write-Host ("[cur: {0}] copying {1} files" -f $ver, $curFiles.Count)
            Copy-ManifestFiles $curFiles $RepoRoot $Target "cur"

            # Fold shipped providers/*.json into the `provider` node before the
            # preserve-restore, so user credentials override {env:...} placeholders
            $merged = Merge-Providers $Target
            if ($merged -gt 0) {
                Write-Host ("[cur: {0}] merged {1} provider(s) from providers/ into opencode.jsonc" -f $ver, $merged)
            }

            if ($preserve) {
                Restore-Preserve $Target $preserve
                Write-Host ("[cur: {0}] preserved {1} field(s) (credentials + models) in opencode.jsonc" -f $ver, $preserve.Count)
            }

            # -EnableMcp/-DisableMcp flip flags (override preserved state;
            # Ensure-Mcp below provisions newly enabled entries)
            Set-McpEnabled $Target $EnableMcp $DisableMcp

            # Provision rtk binary + clean up the official plugin (warns, never fails)
            Ensure-Rtk $Target

            # Provision MCP CLIs for the `mcp` block (warns, never fails)
            Ensure-Mcp $Target

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