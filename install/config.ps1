#requires -Version 7.0
# config.ps1 — PowerShell 7+ interactive + scripted config for opencode.jsonc
#
# Single source of truth for tier mapping: agent.<name>.tier (in the repo
# template). The script rewrites agent.<name>.model and
# provider.llm-router.options.{baseURL,apiKey}.
#
# Requires: PowerShell 7+, opencode (CLI; for `opencode models`)
#
# Usage:
#   ./install/config.ps1                                # interactive
#   ./install/config.ps1 get                            # show current state
#   ./install/config.ps1 set baseURL https://api...
#   ./install/config.ps1 set apiKey sk-xxx
#   ./install/config.ps1 set model code claude-sonnet-4-5 [-p anthropic]
#   ./install/config.ps1 reset                          # restore baseURL/apiKey and model refs from repo template
#   ./install/config.ps1 set ... -t FILE                # target a different file
#
# Interactive flow:
#   1. Pick provider from `opencode models` output.
#   2. If the chosen provider is `llm-router`, prompt for baseURL + apiKey
#      (Enter=keep current). Other providers rely on the opencode CLI's auth.
#   3. For each tier (in template order), pick a
#      model from `opencode models <provider>`. Enter keeps the current id.
#   4. Every agent whose `.model` matches `<old_provider>/<tier_name>` (current
#      value) is rewritten to `<selected_provider>/<new_model_id>` in lockstep.

[CmdletBinding()]
param(
    [Parameter()][Alias('t')][string]$Target = (Join-Path $HOME '.config' 'opencode' 'opencode.jsonc'),
    [Parameter()][Alias('p')][string]$Provider = 'llm-router',
    [Parameter()][Alias('n')][string]$Name,
    [Parameter()][Alias('h')][switch]$Help,
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)][string[]]$CommandArgs
)

$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$Template = Join-Path $RepoRoot 'opencode.jsonc'
$OPENCODE_BIN = $env:OPENCODE_BIN ? $env:OPENCODE_BIN : 'opencode'

$script:CommentsWarned = $false

# --- usage -------------------------------------------------------------------

function Show-Usage {
    @'
usage: config.ps1 [-Target <file>] [-Provider <name>] [-Name <name>] [-Help] <command>

commands:
  (none)                   interactive: pick provider, then pick model for each tier
  get                      show current state (provider creds + tier → provider/model_id)
  set baseURL <url>        set provider.<Provider>.options.baseURL
  set apiKey <key>         set provider.<Provider>.options.apiKey
  set model <name> <id>    set agent.model for tier <name> to <id> on provider <Provider>
  reset                    restore baseURL/apiKey and model refs from repo template (default: llm-router)

options:
  -Target,-t <file>       target opencode.jsonc (default: ~/.config/...)
  -Provider,-p <name>     target provider for get/set (default: llm-router)
  -Name,-n <name>         model name for `set model` (alternative to positional)
  -Help,-h,--help         show this help
'@
}

if ($Help) { Show-Usage; exit 0 }

# --- jsonc IO ----------------------------------------------------------------

function Strip-Jsonc([string]$raw) {
    $sb = [System.Text.StringBuilder]::new()
    $i = 0
    $len = $raw.Length
    $state = 'normal'
    while ($i -lt $len) {
        $c = $raw[$i]
        $n = if ($i + 1 -lt $len) { $raw[$i + 1] } else { [char]::MinValue }
        switch ($state) {
            'normal' {
                if ($c -eq '"') {
                    [void]$sb.Append($c)
                    $state = 'string'
                } elseif ($c -eq '/' -and $n -eq '/') {
                    $state = 'linecomment'
                    $i++
                } elseif ($c -eq '/' -and $n -eq '*') {
                    $state = 'blockcomment'
                    $i++
                } else {
                    [void]$sb.Append($c)
                }
            }
            'string' {
                [void]$sb.Append($c)
                if ($c -eq '\') {
                    $i++
                    if ($i -lt $len) { [void]$sb.Append($raw[$i]) }
                } elseif ($c -eq '"') {
                    $state = 'normal'
                }
            }
            'linecomment' {
                if ($c -eq "`n") {
                    [void]$sb.Append($c)
                    $state = 'normal'
                }
            }
            'blockcomment' {
                if ($c -eq '*' -and $n -eq '/') {
                    $state = 'normal'
                    $i++
                }
            }
        }
        $i++
    }
    $text = $sb.ToString()
    $text = [regex]::Replace($text, ',(\s*[}\]])', '$1')
    return $text
}

function Read-Jsonc([string]$Path) {
    if (-not (Test-Path $Path)) { throw "not found: $Path" }
    $raw = Get-Content -Raw -Path $Path
    $clean = Strip-Jsonc $raw
    return $clean | ConvertFrom-Json -AsHashtable
}

function Has-Comments([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    $raw = Get-Content -Raw -Path $Path
    return [regex]::IsMatch($raw, '(?m)(^\s*//|(?<=[,\s])//)')
}

function Write-JsoncAtomic([string]$Path, [object]$Data) {
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    if (-not $script:CommentsWarned -and (Has-Comments $Path)) {
        [Console]::Error.WriteLine('warning: this script does not preserve JSONC comments — your comments will be lost on first write. Use -RawJson if you want to edit manually.')
        $script:CommentsWarned = $true
    }
    $json = $Data | ConvertTo-Json -Depth 10
    if (Test-Path $Path) { Copy-Item $Path "$Path.bak" -Force }
    $json | Set-Content -Path "$Path.tmp" -Encoding utf8NoBOM -NoNewline
    Move-Item "$Path.tmp" $Path -Force
}

# --- masking -----------------------------------------------------------------

function Mask-Key([string]$k) {
    if (-not $k -or $k.Length -le 6) { return '***' }
    return $k.Substring(0, 3) + '***' + $k.Substring($k.Length - 3)
}

function Mask-Url-If-Sensitive([string]$u) {
    if (-not $u -or -not $u.Contains('?')) { return $u }
    return Mask-Key $u
}

function Strip-Quotes([string]$s) {
    if (($s.StartsWith('"') -and $s.EndsWith('"')) -or
        ($s.StartsWith("'") -and $s.EndsWith("'"))) {
        return $s.Substring(1, $s.Length - 2)
    }
    return $s
}

# --- opencode CLI ------------------------------------------------------------

function Test-OpencodeAvailable {
    if (-not (Get-Command $OPENCODE_BIN -ErrorAction SilentlyContinue)) { return $false }
    $null = & $OPENCODE_BIN models 2>&1 | Out-String
    return $LASTEXITCODE -eq 0
}

function Get-ProviderModels([string]$p) {
    if (-not (Test-OpencodeAvailable)) { return @() }
    $output = & $OPENCODE_BIN models $p 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { return @() }
    $out = @()
    foreach ($line in ($output -split "`r?`n")) {
        $line = $line.Trim()
        if ($line -match "^$([regex]::Escape($p))/") {
            $out += $line.Substring($p.Length + 1)
        }
    }
    return $out
}

# Parse `opencode models` output into a unique, sorted list of provider names.
# Each output line has the form "<provider>/<model_id>"; we split on the first
# slash and dedupe.
function Get-Providers-From-Opencode {
    if (-not (Test-OpencodeAvailable)) { return @() }
    $output = & $OPENCODE_BIN models 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { return @() }
    # Preserve first-seen order from `opencode models`, then move llm-router
    # to the top (custom provider; most likely target for this repo).
    $ordered = [System.Collections.Generic.List[string]]::new()
    $seen = @{}
    foreach ($line in ($output -split "`r?`n")) {
        $line = $line.Trim()
        if ($line -match '^([^/]+)/') {
            $p = $Matches[1]
            if (-not $seen.ContainsKey($p)) {
                $seen[$p] = $true
                [void]$ordered.Add($p)
            }
        }
    }
    if ($ordered -contains 'llm-router') {
        [void]$ordered.Remove('llm-router')
        $ordered.Insert(0, 'llm-router')
    }
    return $ordered.ToArray()
}

# --- template-derived constants ----------------------------------------------

# Tier names and agent -> tier mapping are derived from the repo template
# (../opencode.jsonc). The template is the single source of truth.
$TemplateObj = Read-Jsonc $Template

if (-not $TemplateObj.agent) { throw "template $Template has no agent section" }

$TIER_NAMES = @($TemplateObj.agent.Values |
    Where-Object { $_ -and $_.tier } |
    ForEach-Object { $_.tier } |
    Select-Object -Unique)

if ($TIER_NAMES.Count -eq 0) { throw "template $Template defines no tiers" }

$AGENT_TIERS = @{}
foreach ($name in $TemplateObj.agent.Keys) {
    $t = $TemplateObj.agent[$name].tier
    if ($t) { $AGENT_TIERS[$name] = $t }
}

# --- migration: backfill agent.tier on legacy opencode.jsonc -----------------

# For any agent whose `tier` field is missing, fill it in from $AGENT_TIERS
# (keyed by agent name). Returns the count of agents backfilled.
function Backfill-Tier($obj) {
    $count = 0
    foreach ($name in $obj.agent.Keys) {
        $a = $obj.agent[$name]
        if ($a.Contains('tier')) { continue }
        if ($AGENT_TIERS.ContainsKey($name)) {
            $a['tier'] = $AGENT_TIERS[$name]
            $count++
        }
    }
    return $count
}

# --- agent model rewrite -----------------------------------------------------

# Rewrite every agent.<name>.model where agent.<name>.tier == $tierName to
# $newRef. The root-level `model` field tracks tier.default — kept in sync
# here so a fresh agent with no `.model` falls back to the default-tier choice.
function Update-TierModels($obj, [string]$tierName, [string]$newRef) {
    $count = 0
    foreach ($a in $obj.agent.Values) {
        if ($a.tier -eq $tierName) {
            $a.model = $newRef
            $count++
        }
    }
    if ($tierName -eq 'default') {
        $obj['model'] = $newRef
    }
    return $count
}

# Build a map: tier -> list of "<provider>/<id>" refs found among agents of that tier.
# All agents in a tier should share one ref; if they drift, return the first hit.
function Get-TierMapping($obj) {
    $map = @{}
    foreach ($t in $TIER_NAMES) { $map[$t] = $null }
    foreach ($a in $obj.agent.Values) {
        $t = $a.tier
        if ($t -and $map.ContainsKey($t) -and -not $map[$t]) {
            $map[$t] = $a.model
        }
    }
    return $map
}

# --- show --------------------------------------------------------------------

function Show-Current($obj) {
    Write-Output '[root + tier mapping] (current)'
    $rootModel = if ($obj.Contains('model')) { $obj['model'] } else { '(unset)' }
    Write-Output ("  {0,-9} {1}  <- tracks tier.default" -f "model", $rootModel)
    $map = Get-TierMapping $obj
    foreach ($tier in $TIER_NAMES) {
        $ref = $map[$tier]
        if ($ref) {
            Write-Output ("  {0,-9} {1}" -f "tier.$tier", $ref)
        } else {
            Write-Output ("  {0,-9} (unset)" -f "tier.$tier")
        }
    }
    Write-Output ''
    Write-Output '[provider: llm-router]'
    $llmRouter = $obj.provider['llm-router']
    if (-not $llmRouter) {
        Write-Output '  (provider llm-router not configured)'
    } else {
        $opts = $llmRouter.options ?? @{}
        Write-Output "  baseURL: $(Mask-Url-If-Sensitive ($opts.baseURL ?? ''))"
        Write-Output "  apiKey:  $(Mask-Key ($opts.apiKey ?? ''))"
    }
    Write-Output ''
}

# --- arg parse ---------------------------------------------------------------

$Action = $null
$Key = $null
$Value = $null

$i = 0
while ($i -lt $CommandArgs.Count) {
    $token = $CommandArgs[$i]
    switch ($token) {
        '-h' { Show-Usage; exit 0 }
        '--help' { Show-Usage; exit 0 }
        '-t' {
            $i++
            if ($i -ge $CommandArgs.Count) { throw "-t requires a file" }
            $Target = $CommandArgs[$i]
            $i++
        }
        '--target' {
            $i++
            if ($i -ge $CommandArgs.Count) { throw "--target requires a file" }
            $Target = $CommandArgs[$i]
            $i++
        }
        '-p' {
            $i++
            if ($i -ge $CommandArgs.Count) { throw "-p requires a provider" }
            $Provider = $CommandArgs[$i]
            $i++
        }
        '--provider' {
            $i++
            if ($i -ge $CommandArgs.Count) { throw "--provider requires a provider" }
            $Provider = $CommandArgs[$i]
            $i++
        }
        '-n' {
            $i++
            if ($i -ge $CommandArgs.Count) { throw "-n requires a name" }
            $Name = $CommandArgs[$i]
            $i++
        }
        '--name' {
            $i++
            if ($i -ge $CommandArgs.Count) { throw "--name requires a name" }
            $Name = $CommandArgs[$i]
            $i++
        }
        'get' { $Action = 'get'; $i++ }
        'reset' { $Action = 'reset'; $i++ }
        'set' {
            $Action = 'set'; $i++
            if ($i -ge $CommandArgs.Count) { throw "set requires <key> <value>" }
            $Key = $CommandArgs[$i]; $i++
            if ($Key -eq 'model') {
                if ($Name) {
                    if ($i -ge $CommandArgs.Count) { throw "set model $Name requires <id>" }
                    $Value = $CommandArgs[$i]; $i++
                } else {
                    if ($i -ge $CommandArgs.Count) { throw "set model requires <name>" }
                    $Name = $CommandArgs[$i]; $i++
                    if ($i -ge $CommandArgs.Count) { throw "set model $Name requires <id>" }
                    $Value = $CommandArgs[$i]; $i++
                }
            } else {
                if ($i -ge $CommandArgs.Count) { throw "set $Key requires <value>" }
                $Value = $CommandArgs[$i]; $i++
            }
        }
        default { throw "unknown arg: $token" }
    }
}

# --- main --------------------------------------------------------------------

if (-not (Test-Path $Target)) { throw "not found: $Target" }

if ($Action) {
    $obj = Read-Jsonc $Target
    $backfilled = Backfill-Tier $obj
    if ($backfilled -gt 0) {
        Write-JsoncAtomic $Target $obj
        Write-Output "backfilled tier field on $backfilled agent(s)"
    }
    switch ($Action) {
        'get' { Show-Current $obj }
        'reset' {
            if (-not $obj.provider[$Provider]) { throw "provider.$Provider not configured" }
            $tp = $TemplateObj.provider[$Provider]
            if (-not $tp) { throw "provider.$Provider not in template $Template" }
            $credKeys = @('baseURL', 'apiKey')
            foreach ($k in $credKeys) {
                if (-not $obj.provider[$Provider].options) { $obj.provider[$Provider].options = @{} }
                $obj.provider[$Provider].options[$k] = $tp.options[$k]
            }
            # Restore model refs from the template (source of truth for tier -> model mapping).
            if ($TemplateObj.model) { $obj['model'] = $TemplateObj.model }
            if ($TemplateObj.agent) {
                foreach ($name in $TemplateObj.agent.Keys) {
                    $src = $TemplateObj.agent[$name]
                    if (-not $src.model) { continue }
                    if (-not $obj.agent[$name]) { continue }
                    $obj.agent[$name]['model'] = $src.model
                }
            }
            Write-JsoncAtomic $Target $obj
            Write-Output 'reset credentials and model refs from template'
        }
        'set' {
            if (-not $Key) { throw "set requires <key> <value>" }
            if ([string]::IsNullOrEmpty($Value)) { Write-Output 'skipped (empty value)'; exit 0 }
            if ($Key -eq 'model') {
                if ($Name -notin $TIER_NAMES) { throw "unknown tier: $Name (one of: $($TIER_NAMES -join ', '))" }
                $newRef = "$Provider/$Value"
                $n = Update-TierModels $obj $Name $newRef
                if ($n -eq 0) { throw "no agent currently uses tier $Name" }
                Write-JsoncAtomic $Target $obj
                Write-Output "tier.$Name -> $newRef ($n agent(s) updated)"
            } else {
                if (-not $obj.provider[$Provider]) {
                    [Console]::Error.WriteLine("provider.$Provider not configured — run: config.ps1 (interactive)")
                    throw "provider.$Provider not configured"
                }
                if (-not $obj.provider[$Provider].options) { $obj.provider[$Provider].options = @{} }
                $obj.provider[$Provider].options[$Key] = $Value
                Write-JsoncAtomic $Target $obj
                $extra = if ($Key -eq 'apiKey') { " ($(Mask-Key $Value))" } else { '' }
                Write-Output "$Key set$extra"
            }
        }
    }
    exit 0
}

# --- interactive --------------------------------------------------------------

$obj = Read-Jsonc $Target

# Backfill `tier` on any agent missing it (legacy opencode.jsonc). Persist
# immediately so subsequent operations see the right group membership.
$backfilled = Backfill-Tier $obj
if ($backfilled -gt 0) {
    Write-Output "backfilled tier field on $backfilled agent(s)"
    Write-JsoncAtomic $Target $obj
}

# Show current state up front so the user knows what they're about to change.
Show-Current $obj

# Provider menu: single source = `opencode models`. We always include llm-router
# in the menu even if opencode CLI doesn't list it (custom provider; opencode
# doesn't know about it because it's defined in opencode.jsonc, not models.dev).
$providers = @(Get-Providers-From-Opencode)
if (($providers -notcontains 'llm-router') -and $obj.provider['llm-router']) {
    $providers = @('llm-router') + $providers
}

if ($providers.Count -eq 0) {
    Write-Error 'no providers available — run `opencode` first to authenticate, then re-run'
    exit 1
}

Write-Output '[providers]'
for ($idx = 0; $idx -lt $providers.Count; $idx++) {
    Write-Output ("  {0,2}) {1}" -f ($idx + 1), $providers[$idx])
}

$defaultIdx = [Array]::IndexOf($providers, $Provider)
if ($defaultIdx -lt 0) { $defaultIdx = 0 }

$pick = Read-Host "pick provider (1-$($providers.Count)) [Enter=$($providers[$defaultIdx])]"
$pick = Strip-Quotes $pick
if ([string]::IsNullOrEmpty($pick)) {
    $selected = $providers[$defaultIdx]
} elseif ($pick -match '^\d+$' -and [int]$pick -ge 1 -and [int]$pick -le $providers.Count) {
    $selected = $providers[[int]$pick - 1]
} else {
    Write-Error "invalid selection: $pick"
    exit 1
}

# Credentials: only ask for llm-router. Other providers rely on opencode CLI auth.
$changed = 0
if ($selected -eq 'llm-router') {
    Write-Output ''
    Write-Output '[llm-router credentials]'
    if (-not $obj.provider['llm-router']) {
        [Console]::Error.WriteLine('warning: provider.llm-router is missing from opencode.jsonc — please re-install')
        exit 1
    }
    if (-not $obj.provider['llm-router'].options) { $obj.provider['llm-router'].options = @{} }
    foreach ($k in @('baseURL', 'apiKey')) {
        $existing = $obj.provider['llm-router'].options[$k] ?? ''
        $shown = if ($k -eq 'apiKey') { Mask-Key $existing } else { Mask-Url-If-Sensitive $existing }
        $v = Read-Host "$k ($shown) (Enter=keep)"
        $v = Strip-Quotes $v
        if ([string]::IsNullOrEmpty($v)) { continue }
        $obj.provider['llm-router'].options[$k] = $v
        $changed++
    }
}

# per-tier model picker for the selected provider.
$providerModels = @(Get-ProviderModels $selected)
if ($providerModels.Count -eq 0) {
    Write-Error "`opencode models $selected` returned nothing — choose a different provider"
    exit 1
}
Write-Output ''
Write-Output "[models for provider: $selected]"
$relinked = 0
$tierMap = Get-TierMapping $obj
foreach ($tier in $TIER_NAMES) {
    Write-Output ''
    Write-Output "--- tier.$tier ---"
    # current value: first agent with this tier
    $currentRef = $tierMap[$tier]
    $currentStr = if ($currentRef) { $currentRef } else { '(unset)' }
    Write-Output "current: $currentStr"

    for ($idx = 0; $idx -lt $providerModels.Count; $idx++) {
        Write-Output ("  {0,2}) {1}" -f ($idx + 1), $providerModels[$idx])
    }
    $prompt = "pick model for tier.$tier (1-$($providerModels.Count), Enter=keep)"
    $v = Read-Host $prompt
    $v = Strip-Quotes $v
    if ([string]::IsNullOrEmpty($v)) { continue }

    if ($v -match '^\d+$' -and [int]$v -ge 1 -and [int]$v -le $providerModels.Count) {
        $newId = $providerModels[[int]$v - 1]
    } else {
        Write-Error "invalid selection: $v (must be 1-$($providerModels.Count))"
        exit 1
    }

    $newRef = "$selected/$newId"
    if ($currentRef -ne $newRef) {
        $relinked += Update-TierModels $obj $tier $newRef
    }
    $changed++
}

if ($changed -gt 0 -or $relinked -gt 0) {
    Write-JsoncAtomic $Target $obj
    Write-Output ''
    Write-Output "saved (relinked $relinked agent ref(s))"
} else {
    Write-Output 'no changes'
}
exit 0