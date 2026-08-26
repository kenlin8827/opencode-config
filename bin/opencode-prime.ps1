#requires -Version 7.0
<#
.SYNOPSIS
    bin/opencode-prime.ps1 — global dispatcher for the OpenCode Prime (OCP) repo.

.DESCRIPTION
    Mirrors bin/opencode-prime (bash). Lives in the repo. The global shim at
    ~/.local/bin/opencode-prime.ps1 re-execs this file (created by
    install.ps1's `Register` mode).

    Subcommands:
      install         Apply the current version's manifest to the default target
      update          Same as install, but forces reapply (-Force)
      init            Backup + clear the target for a fresh start
      uninstall       Remove the installed version's manifest files from the target
      status          Show installed vs repo version
      generate        Regenerate install/versions/<ver>.manifest.txt
      register        Install global shims (opencode-prime, ocp, opencode-config) into ~/.local/bin
      unregister      Remove global shims from ~/.local/bin
      version         Print the repo's install/VERSION
      help            Print this help

.EXAMPLE
    pwsh ./bin/opencode-prime.ps1 install
    pwsh ./bin/opencode-prime.ps1 status
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

if ([string]::IsNullOrWhiteSpace($Subcommand)) {
    $Subcommand = 'install'
}

switch ($Subcommand.ToLowerInvariant()) {
    { $_ -in @('-h', '--help', 'help') } {
        Get-HelpText
        break
    }
    'install' {
        & $Install install @Rest
        break
    }
    'update' {
        & $Install install -Force @Rest
        break
    }
    'init' {
        & $Install init @Rest
        break
    }
    'uninstall' {
        & $Install uninstall @Rest
        break
    }
    'status' {
        & $Install status @Rest
        break
    }
    'generate' {
        & $Install generate @Rest
        break
    }
    'register' {
        & $Install register @Rest
        break
    }
    'unregister' {
        & $Install unregister @Rest
        break
    }
    { $_ -in @('version', '--version', '-v') } {
        Get-Content (Join-Path $RepoRoot 'install/VERSION')
        break
    }
    default {
        & $Install $Subcommand @Rest
        break
    }
}
