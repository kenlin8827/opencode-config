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
#   ./install/config.ps1 profile                        # pick a profile by number and apply it
#   ./install/config.ps1 profile list                   # list profiles in install/profiles/
#   ./install/config.ps1 profile apply opencode-go-performance
#   ./install/config.ps1 reset                          # restore baseURL/apiKey and model refs from repo template
#   ./install/config.ps1 set ... -t FILE                # target a different file
#
# Interactive flow:
#   1. Multi-select providers (0 or Enter = all) from the providers visible
#      in `opencode models` plus llm-router (custom provider from the config).
#   2. Shows only the models of the selected providers; for each tier (in
#      template order), pick one of them. Enter keeps the current id, even
#      when it belongs to a provider that wasn't selected.
#   3. If the selected providers include llm-router, baseURL/apiKey are
#      prompted before the model picks. Other providers rely on the
#      opencode CLI's auth.
#   4. Every agent of a tier is rewritten to the chosen ref in lockstep.

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
$ProfilesDir = Join-Path $ScriptDir 'profiles'
$OPENCODE_BIN = $env:OPENCODE_BIN ? $env:OPENCODE_BIN : 'opencode'

$script:CommentsWarned = $false

# --- usage -------------------------------------------------------------------

function Show-Usage {
    @'
usage: config.ps1 [-Target <file>] [-Provider <name>] [-Name <name>] [-Help] <command>

commands:
  (none)                   interactive: pick providers, then pick a model per tier
  get                      show current state (provider creds + tier → provider/model_id)
  set baseURL <url>        set provider.<Provider>.options.baseURL
  set apiKey <key>         set provider.<Provider>.options.apiKey
  set model <name> <id>    set agent.model for tier <name> to <id> on provider <Provider>
  profile                  interactive: numbered profile menu, pick one by number to apply
  profile list             list available profiles in install/profiles/
  profile apply <name>     apply a profile (provider + per-tier model picks) in one shot
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

# Parse `opencode models` output into full "<provider>/<model_id>" refs.
function Get-All-ProviderModels {
    if (-not (Test-OpencodeAvailable)) { return @() }
    $output = & $OPENCODE_BIN models 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { return @() }
    $out = [System.Collections.Generic.List[string]]::new()
    $seen = @{}
    foreach ($line in ($output -split "`r?`n")) {
        $line = $line.Trim()
        if ($line -match '^[^/]+/' -and -not $seen.ContainsKey($line)) {
            $seen[$line] = $true
            [void]$out.Add($line)
        }
    }
    return $out.ToArray()
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
# Loop var must not be $name — PowerShell vars are case-insensitive, so a
# leftover $name would silently pre-fill the -Name parameter (last agent wins).
foreach ($agentName in $TemplateObj.agent.Keys) {
    $t = $TemplateObj.agent[$agentName].tier
    if ($t) { $AGENT_TIERS[$agentName] = $t }
}

# --- migration: backfill agent.tier on legacy opencode.jsonc -----------------

# For any agent whose `tier` field is missing, fill it in from $AGENT_TIERS
# (keyed by agent name). Returns the count of agents backfilled.
function Backfill-Tier($obj) {
    $count = 0
    foreach ($agentName in $obj.agent.Keys) {
        $a = $obj.agent[$agentName]
        if ($a.Contains('tier')) { continue }
        if ($AGENT_TIERS.ContainsKey($agentName)) {
            $a['tier'] = $AGENT_TIERS[$agentName]
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

# Prompt for llm-router baseURL/apiKey (Enter=keep). Returns the count of
# fields actually updated. Write-Host (not Write-Output) so the return value
# stays a clean scalar when used in an assignment.
function Set-LlmRouterCredentials($obj) {
    Write-Host ''
    Write-Host '[llm-router credentials]'
    if (-not $obj.provider['llm-router']) {
        [Console]::Error.WriteLine('warning: provider.llm-router is missing from opencode.jsonc — please re-install')
        exit 1
    }
    if (-not $obj.provider['llm-router'].options) { $obj.provider['llm-router'].options = @{} }
    $n = 0
    foreach ($k in @('baseURL', 'apiKey')) {
        $existing = $obj.provider['llm-router'].options[$k] ?? ''
        $shown = if ($k -eq 'apiKey') { Mask-Key $existing } else { Mask-Url-If-Sensitive $existing }
        $v = Read-Host "$k ($shown) (Enter=keep)"
        $v = Strip-Quotes $v
        if ([string]::IsNullOrEmpty($v)) { continue }
        $obj.provider['llm-router'].options[$k] = $v
        $n++
    }
    return $n
}

# --- profiles ---------------------------------------------------------------

# Profiles are presets in install/profiles/<name>.json: a tier -> full
# "<provider>/<model_id>" ref map, applied in one shot (`profile apply <name>`).
# A profile is single-provider: every ref must share the same provider part,
# mixed providers are rejected. Tiers not listed by the profile are untouched.

function Get-ProfilePath([string]$name) {
    if (-not $name.EndsWith('.json')) { $name = "$name.json" }
    return (Join-Path $ProfilesDir $name)
}

function Get-ProfileNames {
    if (-not (Test-Path $ProfilesDir)) { return @() }
    return @(Get-ChildItem $ProfilesDir -Filter '*.json' | ForEach-Object { $_.BaseName })
}

function Show-Profiles {
    $names = Get-ProfileNames
    if ($names.Count -eq 0) {
        Write-Output "no profiles found in $ProfilesDir"
        return
    }
    foreach ($name in ($names | Sort-Object)) {
        $p = Get-Content -Raw (Get-ProfilePath $name) | ConvertFrom-Json -AsHashtable
        Write-Output "[$name]"
        if ($p.description) { Write-Output "  $($p.description)" }
        $first = @($p.tiers.Values)[0] ?? ''
        $provider = if ($first -match '^[^/]+/') { ($first -split '/', 2)[0] } else { '(none)' }
        Write-Output ("  {0,-9} {1}" -f 'provider', $provider)
        foreach ($tier in ($p.tiers.Keys | Sort-Object)) {
            Write-Output ("  {0,-9} {1}" -f "tier.$tier", $p.tiers[$tier])
        }
        Write-Output ''
    }
}

function Apply-Profile($obj, [string]$name) {
    $file = Get-ProfilePath $name
    if (-not (Test-Path $file)) {
        $available = (Get-ProfileNames) -join ', '
        throw "profile not found: $name (available: $available)"
    }
    $p = Get-Content -Raw $file | ConvertFrom-Json -AsHashtable
    if (-not $p.tiers) { throw "profile $name has no tiers field" }
    # Pass 1: validate everything before writing anything (no partial apply).
    $provider = $null
    foreach ($tier in $p.tiers.Keys) {
        if ($tier -notin $TIER_NAMES) { throw "profile ${name}: unknown tier $tier (one of: $($TIER_NAMES -join ', '))" }
        $ref = $p.tiers[$tier]
        if ($ref -notmatch '^[^/]+/.+') { throw "profile ${name}: tier $tier value '$ref' must be a full '<provider>/<model_id>' ref" }
        $prov = ($ref -split '/', 2)[0]
        if (-not $provider) { $provider = $prov }
        elseif ($prov -ne $provider) { throw "profile ${name}: mixed providers ($provider vs $prov) — a profile supports a single provider" }
        if (@($obj.agent.Values | Where-Object { $_.tier -eq $tier }).Count -eq 0) { throw "no agent currently uses tier $tier" }
    }
    # Pass 2: rewrite.
    $updated = 0
    foreach ($tier in $p.tiers.Keys) {
        $ref = $p.tiers[$tier]
        $n = Update-TierModels $obj $tier $ref
        Write-Host "tier.$tier -> $ref ($n agent(s) updated)"
        $updated += $n
    }
    return $updated
}

# Interactive numbered menu: show every profile, pick one by number to apply.
# Enter or 0 cancels. Sets $script:PickedProfileName ($null when cancelled).
function Pick-Profile {
    $names = @(Get-ProfileNames | Sort-Object)
    if ($names.Count -eq 0) { throw "no profiles found in $ProfilesDir" }
    Write-Host '[profiles]'
    Write-Host '   0) cancel'
    $idx = 1
    foreach ($name in $names) {
        $p = Get-Content -Raw (Get-ProfilePath $name) | ConvertFrom-Json -AsHashtable
        $refs = @($p.tiers.Keys | Sort-Object | ForEach-Object { $p.tiers[$_] }) -join ', '
        Write-Host ("  {0,2}) {1}" -f $idx, $name)
        if ($p.description) { Write-Host "       $($p.description)" }
        Write-Host "       $refs"
        $idx++
    }
    Write-Host ''
    $v = Read-Host "pick profile to apply (1-$($names.Count), Enter=cancel)"
    $v = Strip-Quotes $v
    if ([string]::IsNullOrWhiteSpace($v) -or $v -eq '0') {
        $script:PickedProfileName = $null
        return
    }
    if ($v -match '^\d+$' -and [int]$v -ge 1 -and [int]$v -le $names.Count) {
        $script:PickedProfileName = $names[[int]$v - 1]
        return
    }
    throw "invalid selection: $v (must be 0-$($names.Count))"
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
        'profile' {
            $Action = 'profile'; $i++
            # Only a non-option token is the subcommand — leave -t/-p alone.
            if ($i -lt $CommandArgs.Count -and -not $CommandArgs[$i].StartsWith('-')) {
                $Key = $CommandArgs[$i]; $i++
                if ($Key -eq 'apply') {
                    if ($i -ge $CommandArgs.Count) { throw "profile apply requires <name>" }
                    $Value = $CommandArgs[$i]; $i++
                }
            }
        }
        'set' {
            $Action = 'set'; $i++
            if ($i -ge $CommandArgs.Count) { throw "set requires <key> <value>" }
            $Key = $CommandArgs[$i]; $i++
            if ($Key -eq 'model') {
                # -n/-Name overrides the positional tier name; consumed here (not
                # earlier) so `set model <tier> <id>` works either way
                if ($Name -and $i -lt $CommandArgs.Count -and $CommandArgs[$i] -notin $TIER_NAMES) {
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

# `profile list` only reads install/profiles/ — it must work before the
# target exists (fresh machine). Everything else touches $Target.
if (-not ($Action -eq 'profile' -and $Key -eq 'list')) {
    if (-not (Test-Path $Target)) { throw "not found: $Target" }
}

if ($Action) {
    if ($Action -eq 'profile' -and $Key -eq 'list') {
        Show-Profiles
        exit 0
    }
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
                foreach ($agentName in $TemplateObj.agent.Keys) {
                    $src = $TemplateObj.agent[$agentName]
                    if (-not $src.model) { continue }
                    if (-not $obj.agent[$agentName]) { continue }
                    $obj.agent[$agentName]['model'] = $src.model
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
        'profile' {
            if (-not $Key) {
                Pick-Profile
                if ($script:PickedProfileName) {
                    $n = Apply-Profile $obj $script:PickedProfileName
                    Write-JsoncAtomic $Target $obj
                    Write-Output "profile $($script:PickedProfileName) applied ($n agent ref(s) updated)"
                } else {
                    Write-Output 'cancelled'
                }
            } elseif ($Key -eq 'apply') {
                $n = Apply-Profile $obj $Value
                Write-JsoncAtomic $Target $obj
                Write-Output "profile $Value applied ($n agent ref(s) updated)"
            } else {
                throw "unknown profile command: $Key (use: profile list | profile apply <name>)"
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

Write-Output ''

$changed = 0
$relinked = 0

# Model menu across all providers: single source = `opencode models`.
# llm-router is a custom provider; the opencode CLI may not list its
# models, so append them from the config.
$allModels = @(Get-All-ProviderModels)
$lr = $obj.provider['llm-router']
if ($lr -and $lr.models) {
    foreach ($id in $lr.models.Keys) {
        $ref = "llm-router/$id"
        if ($allModels -notcontains $ref) { $allModels += $ref }
    }
}
if ($allModels.Count -eq 0) {
    Write-Error 'no models available — run `opencode` first to authenticate, then re-run'
    exit 1
}

# Step 1: multi-select providers.
$providers = @($allModels | ForEach-Object { ($_ -split '/', 2)[0] } | Select-Object -Unique)
Write-Output '[providers]'
Write-Output '   0) all'
for ($idx = 0; $idx -lt $providers.Count; $idx++) {
    Write-Output ("  {0,2}) {1}" -f ($idx + 1), $providers[$idx])
}
Write-Output ''
$sel = Read-Host "pick providers to use (e.g. 1 3, 0=all, Enter=all)"
$sel = Strip-Quotes $sel

$selProviders = [System.Collections.Generic.List[string]]::new()
if ([string]::IsNullOrWhiteSpace($sel)) {
    foreach ($p in $providers) { [void]$selProviders.Add($p) }
} else {
    foreach ($tok in ($sel -split '[,\s]+')) {
        if (-not $tok) { continue }
        if ($tok -eq '0') {
            $selProviders.Clear()
            foreach ($p in $providers) { [void]$selProviders.Add($p) }
            break
        }
        if ($tok -match '^\d+$' -and [int]$tok -ge 1 -and [int]$tok -le $providers.Count) {
            $p = $providers[[int]$tok - 1]
            if ($selProviders -notcontains $p) { [void]$selProviders.Add($p) }
        } else {
            Write-Error "invalid selection: $tok (must be 0-$($providers.Count))"
            exit 1
        }
    }
}

# Credentials: ask up front when llm-router is among the selected providers.
# Other providers rely on opencode CLI auth.
if ($selProviders -contains 'llm-router') { $changed += Set-LlmRouterCredentials $obj }

# Step 2: models of the selected providers only; every tier picks from them.
$candidate = [System.Collections.Generic.List[string]]::new()
foreach ($m in ($allModels | Where-Object { $selProviders -contains ($_ -split '/', 2)[0] })) {
    [void]$candidate.Add($m)
}

$tierMap = Get-TierMapping $obj

Write-Output ''
Write-Output "[models for: $($selProviders -join ', ')]"
foreach ($tier in $TIER_NAMES) {
    Write-Output ''
    Write-Output "--- tier.$tier ---"
    $currentRef = $tierMap[$tier]
    if ($currentRef) {
        $note = if ($candidate -notcontains $currentRef) { '  (outside selection — Enter keeps it)' } else { '' }
        Write-Output "current: $currentRef$note"
    } else {
        Write-Output 'current: (unset)'
    }

    for ($idx = 0; $idx -lt $candidate.Count; $idx++) {
        Write-Output ("  {0,2}) {1}" -f ($idx + 1), $candidate[$idx])
    }
    Write-Output ''
    $v = Read-Host "pick model for tier.$tier (1-$($candidate.Count), Enter=keep)"
    $v = Strip-Quotes $v

    if ([string]::IsNullOrEmpty($v)) { continue }

    if ($v -match '^\d+$' -and [int]$v -ge 1 -and [int]$v -le $candidate.Count) {
        $newRef = $candidate[[int]$v - 1]
    } else {
        Write-Error "invalid selection: $v (must be 1-$($candidate.Count))"
        exit 1
    }

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