#requires -Version 7.0
<#
.SYNOPSIS
    bin/ocp.ps1 — alias dispatcher for OpenCode Prime (OCP)
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Subcommand,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ScriptDir = $PSScriptRoot
& (Join-Path $ScriptDir 'opencode-prime.ps1') $Subcommand @Rest
