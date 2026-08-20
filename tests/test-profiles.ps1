#requires -Version 7.0
# test-profiles.ps1 — stress test for profiles/*.json
#
# For every bundled profile: apply it to a fresh copy of the repo template
# and assert that (a) every agent of a covered tier carries the profile ref,
# (b) the root model tracks tier.default, (c) tiers not listed by the profile
# keep the template ref. Optionally cross-checks every ref against
# `opencode models` when the CLI is available and authenticated.
#
# Profile application is re-implemented inline (same semantics as the
# /profile plugin), so this test no longer depends on the retired
# install/config.ps1.
#
# Usage: pwsh tests/test-profiles.ps1

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$template = Join-Path $root 'opencode.jsonc'
$profilesDir = Join-Path $root 'profiles'

# Apply a profile to $obj in place: rewrite every agent of a covered tier to
# the profile ref in lockstep; root `model` tracks tier.default. Mirrors the
# /profile plugin's applyProfile semantics.
function Apply-ProfileInPlace([hashtable]$obj, [hashtable]$p) {
    foreach ($tier in $p.tiers.Keys) {
        $ref = $p.tiers[$tier]
        $n = 0
        foreach ($a in $obj.agent.Values) {
            if ($a.tier -eq $tier) { $a.model = $ref; $n++ }
        }
        if ($n -eq 0) { throw "no agent currently uses tier $tier" }
        if ($tier -eq 'default') { $obj['model'] = $ref }
    }
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "ocfg-profile-test-$PID"
New-Item -ItemType Directory -Force $tmp | Out-Null
$cfg = Join-Path $tmp 'opencode.jsonc'

try {
    $tpl = Get-Content -Raw $template | ConvertFrom-Json -AsHashtable
    # expected per-tier ref in the untouched template
    $tplTierRef = @{}
    foreach ($a in $tpl.agent.Values) {
        if ($a.tier -and -not $tplTierRef.ContainsKey($a.tier)) { $tplTierRef[$a.tier] = $a.model }
    }

    $fail = 0
    $profiles = Get-ChildItem $profilesDir -Filter '*.json' | Sort-Object Name
    foreach ($pf in $profiles) {
        Copy-Item $template $cfg -Force
        $p = Get-Content -Raw $pf.FullName | ConvertFrom-Json -AsHashtable
        try {
            $obj = Get-Content -Raw $cfg | ConvertFrom-Json -AsHashtable
            Apply-ProfileInPlace $obj $p
            $obj | ConvertTo-Json -Depth 10 | Set-Content -Path $cfg -Encoding utf8NoBOM
        } catch {
            Write-Output "[$($pf.BaseName)] FAIL apply: $_"
            $fail++
            continue
        }
        $obj = Get-Content -Raw $cfg | ConvertFrom-Json -AsHashtable
        $errors = @()
        # covered tiers: every agent must carry the profile ref
        foreach ($tier in $p.tiers.Keys) {
            $ref = $p.tiers[$tier]
            $n = 0
            foreach ($a in $obj.agent.Values) {
                if ($a.tier -eq $tier) {
                    $n++
                    if ($a.model -ne $ref) { $errors += "tier ${tier}: agent model '$($a.model)' != '$ref'" }
                }
            }
            if ($n -eq 0) { $errors += "tier ${tier}: no agent matched" }
            if ($tier -eq 'default' -and $obj.model -ne $ref) { $errors += "root model '$($obj.model)' != '$ref'" }
        }
        # uncovered tiers: agents must keep the template ref
        foreach ($a in $obj.agent.Values) {
            if ($a.tier -and -not $p.tiers.Contains($a.tier)) {
                $expected = $tplTierRef[$a.tier]
                if ($a.model -ne $expected) { $errors += "untouched tier $($a.tier): '$($a.model)' != template '$expected'" }
            }
        }
        if ($errors.Count -eq 0) {
            Write-Output "[$($pf.BaseName)] PASS ($($p.tiers.Count) tiers applied)"
        } else {
            Write-Output "[$($pf.BaseName)] FAIL"
            $errors | ForEach-Object { Write-Output "  - $_" }
            $fail++
        }
    }

    # guard: every bundled profile must cover all template tiers — repo
    # policy is that no tier is left dangling (vision especially)
    foreach ($pf2 in $profiles) {
        $p2 = Get-Content -Raw $pf2.FullName | ConvertFrom-Json -AsHashtable
        $missingTiers = @($tplTierRef.Keys | Where-Object { -not $p2.tiers.Contains($_) })
        if ($missingTiers.Count -gt 0) {
            Write-Output "[$($pf2.BaseName)] FAIL coverage: missing tier(s) $($missingTiers -join ', ')"
            $fail++
        }
    }

    # model existence check against `opencode models`
    Write-Output ''
    Write-Output '--- model existence vs `opencode models` ---'
    $available = @()
    if (Get-Command opencode -ErrorAction SilentlyContinue) {
        $available = @(opencode models 2>$null | Where-Object { $_ -match '^[^/]+/' } | ForEach-Object { $_.Trim() })
    }
    if ($available.Count -eq 0) {
        Write-Output 'opencode CLI unavailable or unauthenticated — existence check SKIPPED'
    } else {
        Write-Output "opencode lists $($available.Count) models"
        foreach ($pf in $profiles) {
            $p = Get-Content -Raw $pf.FullName | ConvertFrom-Json -AsHashtable
            $missing = @($p.tiers.Values | Where-Object { $available -notcontains $_ })
            if ($missing.Count -eq 0) {
                Write-Output "[$($pf.BaseName)] all refs exist"
            } else {
                Write-Output "[$($pf.BaseName)] MISSING: $($missing -join ', ')"
            }
        }
    }

    Write-Output ''
    if ($fail -eq 0) { Write-Output "RESULT: ALL PASS ($($profiles.Count) profiles)"; exit 0 }
    Write-Output "RESULT: $fail profile(s) FAILED"
    exit 1
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
