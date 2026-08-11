#requires -Version 7.0
<#
.SYNOPSIS
    bin/opencode-config.ps1 — global dispatcher for the opencode-config repo.

.DESCRIPTION
    Mirrors bin/opencode-config (bash). Lives in the repo. The global shim at
    ~/.local/bin/opencode-config.ps1 re-execs this file (created by
    install.ps1's `Register` mode). The same path is used when running the
    command directly from a clone.

    Subcommands:
      install         Apply the current version's manifest to the default target
      update          Same as install, but forces reapply (-Force)
      init            Backup + clear the target for a fresh start
      status         Show installed vs repo version
      generate        Regenerate install/versions/<ver>.manifest.txt
      register        Install the global shim into ~/.local/bin
      unregister      Remove the global shim from ~/.local/bin
      config          Run the config helper (credentials + per-tier model picks)
      profile         Shortcut for `config profile` (interactive picker)
      version         Print the repo's install/VERSION
      help            Print this help

    Anything else falls through to install.ps1.

.EXAMPLE
    pwsh ./bin/opencode-config.ps1 install
    pwsh ./bin/opencode-config.ps1 status
    pwsh ./bin/opencode-config.ps1 config set baseURL https://api...
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Subcommand,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest
)

$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$Install = Join-Path $RepoRoot 'install/install.ps1'
$Config  = Join-Path $RepoRoot 'install/config.ps1'

# Print the comment block between `<#` and `#>`, dropping
# `.SYNOPSIS`/`.DESCRIPTION`/etc. headers to keep the help terse.
function Get-HelpText {
    $in = $false
    foreach ($ln in (Get-Content -LiteralPath $PSCommandPath)) {
        $trim = $ln.TrimStart()
        if ($in) {
            if ($trim -eq '#>') { return }
            if ($trim -match '^\.[A-Z]') { continue }
            $ln
        } else {
            if ($trim -eq '<#') { $in = $true }
        }
    }
}

# `ValueFromRemainingArguments` for an unset `[string[]]` is `$null` despite
# `.Count -eq 0`. Normalize up front so all branches see a real array.
if ($null -eq $Rest) { $Rest = @() }

if (-not $Subcommand) { $Subcommand = 'install' }

# Invoke a child script with safe argument forwarding.
#
# Two PowerShell 7 splatting pitfalls force this layout:
#
#   1. `& $cmd @singleElemArray` (1-element array) silently injects an empty
#      element into the callee.
#   2. A 1-element pipeline result collapses to `System.String`, after which
#      `$arr[0]` indexes a character — not what we want.
#
# We force Object[] via the comma operator (,$Head), filter empties, and
# always pass at least 2 elements through the splat path. For a 1-element
# input we still pass it as a literal so the call shape is unambiguous.
function Invoke-Sub([string]$Child, [string]$Head, [string[]]$Tail) {
    # Forced Object[] via comma operator on $Head. Filtering via a foreach
    # loop (not Where-Object, which collapses single results) avoids the
    # scalar-collapse pitfall in (2).
    $tmp = New-Object System.Collections.Generic.List[string]
    if ($Head -ne $null -and $Head -ne '') { [void]$tmp.Add($Head) }
    foreach ($t in $Tail) {
        if ($t -ne $null -and $t -ne '') { [void]$tmp.Add($t) }
    }
    $all = [string[]]$tmp.ToArray()
    switch ($all.Count) {
        0       { & $Child }
        1       { & $Child $all[0] }
        default { & $Child @all }
    }
}

switch ($Subcommand) {
    { @('-h', '--help', 'help') -contains $_ } {
        Get-HelpText
    }
    'install'    { & $Install install  @Rest }
    'update'     { & $Install install -Force @Rest }
    'init'       { & $Install init     @Rest }
    'status'     { Invoke-Sub $Install 'status'     $Rest }
    'generate'   { Invoke-Sub $Install 'generate'   $Rest }
    'register'   { Invoke-Sub $Install 'register'   $Rest }
    'unregister' { Invoke-Sub $Install 'unregister' $Rest }
    'config'     { Invoke-Sub $Config  $null         $Rest }
    'profile'    { Invoke-Sub $Config  'profile'    $Rest }
    'version'    {
        $v = (Get-Content (Join-Path $RepoRoot 'install/VERSION') -TotalCount 1 -ErrorAction SilentlyContinue)
        if ($v) { $v.Trim() } else { 'unknown' }
    }
    default {
        Write-Error "opencode-config: unknown subcommand: $Subcommand (passing through to install.ps1)"
        Invoke-Sub $Install $Subcommand $Rest
    }
}
