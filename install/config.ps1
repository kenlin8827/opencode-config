#requires -Version 5.1
<#
.SYNOPSIS
    Configure ~/.config/opencode/opencode.jsonc — baseURL, apiKey, and 5 model IDs.

.DESCRIPTION
    Reads/writes only the credentials and model IDs under
    provider.llm-router.{options.baseURL, options.apiKey, models.<name>.id}.
    All other fields stay as-is. Defaults are pulled from the repo's
    opencode.jsonc (the template) — use 'reset' to restore them.

    With no -Action, runs in interactive mode: prompts for each of the 7
    fields in order; pressing Enter on an empty value skips that field.

.PARAMETER Action
    set | get | reset | (omit for interactive)

.PARAMETER Key
    For set: baseURL | apiKey | model
    (model also requires -Name)

.PARAMETER Value
    For set: the new value (empty string is skipped)

.PARAMETER Name
    For 'set model <name> <id>': one of default|code|advisor|explorer|vision

.PARAMETER Target
    opencode.jsonc to edit. Defaults to $HOME/.config/opencode/opencode.jsonc.

.EXAMPLE
    # Interactive (first-time setup or batch update):
    pwsh install/config.ps1

    # Scripted:
    pwsh install/config.ps1 set baseURL https://router.example.com/v1
    pwsh install/config.ps1 set apiKey  sk-xxxx
    pwsh install/config.ps1 set model  advisor my-advisor-v2
    pwsh install/config.ps1 get
    pwsh install/config.ps1 reset
#>

[CmdletBinding()]
param(
    [ValidateSet('set', 'get', 'reset')]
    [string]$Action,
    [string]$Key,
    [string]$Value,
    [ValidateSet('default','code','advisor','explorer','vision')]
    [string]$Name,
    [string]$Target
)

$ErrorActionPreference = 'Stop'

$RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Template   = Join-Path $RepoRoot 'opencode.jsonc'
if (-not $Target) { $Target = Join-Path $HOME '.config/opencode/opencode.jsonc' }

# ponytail: only these 7 fields are editable; everything else is preserved untouched
$providerName = 'llm-router'
$credKeys     = @('baseURL', 'apiKey')
$modelNames   = @('default', 'code', 'advisor', 'explorer', 'vision')

function Load-Json([string]$path) {
    if (-not (Test-Path $path)) { throw "not found: $path" }
    Get-Content $path -Raw | ConvertFrom-Json
}

function Save-Json([string]$path, $obj) {
    $obj | ConvertTo-Json -Depth 20 | Set-Content -Path $path -Encoding UTF8
}

# ponytail: PSCustomObject only supports dot access; keys with dashes ('llm-router')
# must be quoted as '$obj.<key>' (literal quotes, not interpolated).
function Get-Provider($obj)            { return $obj.provider.'llm-router' }
function Get-Options($obj)             { return $obj.provider.'llm-router'.options }
function Get-Model($obj, [string]$m)   { return $obj.provider.'llm-router'.models."$m" }
function Set-Cred($obj, [string]$k, $v) {
    $obj.provider.'llm-router'.options."$k" = $v
}
function Set-ModelId($obj, [string]$m, $v) {
    $obj.provider.'llm-router'.models."$m".id = $v
}

function Get-Template-Values {
    $t = Load-Json $Template
    $bag = @{}
    foreach ($k in $credKeys) { $bag[$k] = (Get-Options $t)[$k] }
    foreach ($m in $modelNames) { $bag["model.$m"] = (Get-Model $t $m).id }
    return $bag
}

function Mask-Key([string]$k) {
    if (-not $k -or $k.Length -le 6) { return '***' }
    return $k.Substring(0,3) + '***' + $k.Substring($k.Length-3)
}

# ponytail: baseURL is usually clean — only mask when a query string carries a token
function Mask-Url-If-Sensitive([string]$u) {
    if (-not $u -or -not $u.Contains('?')) { return $u }
    return Mask-Key $u
}

function Show-Current($obj) {
    $opts = Get-Options $obj
    "baseURL: $(Mask-Url-If-Sensitive $opts.baseURL)"
    "apiKey:  $(Mask-Key $opts.apiKey)"
    foreach ($m in $modelNames) {
        "model.$m`: $((Get-Model $obj $m).id)"
    }
}

function Apply-Set($obj, [string]$k, [string]$v, [string]$name) {
    if ([string]::IsNullOrEmpty($v)) { return $false }  # empty = skip
    if (-not (Get-Provider $obj)) {
        throw "opencode.jsonc missing provider.$providerName — cannot edit"
    }
    if ($k -in $credKeys) {
        if (-not (Get-Options $obj)) {
            throw "opencode.jsonc missing provider.$providerName.options — cannot edit credentials"
        }
        Set-Cred $obj $k $v
        return $true
    }
    if ($k -eq 'model') {
        if (-not $name) { throw "set model requires -Name (one of: $($modelNames -join ', '))" }
        if ($name -notin $modelNames) { throw "unknown model: $name" }
        if (-not (Get-Model $obj $name)) {
            throw "opencode.jsonc missing provider.$providerName.models.$name — cannot edit"
        }
        Set-ModelId $obj $name $v
        return $true
    }
    throw "unknown -Key: $k (use baseURL, apiKey, or model)"
}

# --- main ---------------------------------------------------------------

if (-not $Action) {
    # interactive mode — Enter on empty = skip
    if (-not (Test-Path $Target)) { throw "not found: $Target (run install.ps1 first)" }
    $j = Load-Json $Target
    Show-Current $j
    ''
    $changed = 0
    foreach ($k in $credKeys) {
        $existing = (Get-Options $j)[$k]
        if ($k -eq 'apiKey')  { $shown = Mask-Key $existing }
        else                  { $shown = Mask-Url-If-Sensitive $existing }
        $v = Read-Host "$k ($shown) (Enter=keep)"
        if (Apply-Set $j $k $v '') { $changed++ }
    }
    foreach ($m in $modelNames) {
        $existing = (Get-Model $j $m).id
        $v = Read-Host "model.$m ($existing) (Enter=keep)"
        if (Apply-Set $j 'model' $v $m) { $changed++ }
    }
    if ($changed -gt 0) {
        Save-Json $Target $j
        "saved $changed field(s)"
    } else {
        "no changes"
    }
    return
}

if (-not (Test-Path $Target)) { throw "not found: $Target" }
$j = Load-Json $Target

switch ($Action) {
    'get' { Show-Current $j }
    'reset' {
        $bag = Get-Template-Values
        foreach ($k in $credKeys) { Set-Cred $j $k $bag[$k] }
        foreach ($m in $modelNames) { Set-ModelId $j $m $bag["model.$m"] }
        Save-Json $Target $j
        'reset to template defaults'
    }
    'set' {
        if (-not $Key)   { throw "set requires -Key" }
        if ([string]::IsNullOrEmpty($Value)) { 'skipped (empty value)'; return }
        if (Apply-Set $j $Key $Value $Name) {
            Save-Json $Target $j
            $extra = if ($Key -eq 'apiKey')    { " ($(Mask-Key $Value))" }
                     elseif ($Key -eq 'model') { " ($Name = $Value)" }
                     else                       { '' }
            "$Key set$extra"
        }
    }
}