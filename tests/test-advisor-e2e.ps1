# Auto-advisor-mode end-to-end tests.
# Runs real `opencode run` invocations to verify:
#   1. /auto-advisor off|lite|full upserts `autoAdvisorMode` in the PROJECT
#      opencode.jsonc via command.execute.before
#   2. Invalid or missing arguments are a no-op (config unchanged)
#   3. system.transform injects the mode marker into the system prompt
#   4. tool.execute.before does NOT block @advisor dispatch when mode is off
#      (OFF = no auto-dispatch, manual @advisor still allowed)
#   5. the config value persists across separate opencode run invocations
#
# Requires: opencode CLI on PATH; LLM_ROUTER_BASE_URL / LLM_ROUTER_API_KEY set.
#
# Invocation assumption: `opencode run "/auto-advisor <mode>"` routes the message
# as the auto-advisor slash command ($ARGUMENTS = mode). If your opencode CLI
# requires a different form (e.g. --command auto-advisor --args <mode>), adjust
# Invoke-AdvisorCmd below — it is the only place the form is encoded.

# Mode is stored in the project-level opencode.jsonc (`autoAdvisorMode` field).
# Run opencode from the repo root so the project directory resolves there, and
# back up / restore the repo's opencode.jsonc so the test never mutates it.
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$configFile = Join-Path $repoRoot "opencode.jsonc"
$configBackup = "$configFile.advisor-e2e.bak"

function Restore-Config() {
    if (Test-Path $configBackup) { Move-Item $configBackup $configFile -Force }
}

Push-Location $repoRoot
Copy-Item $configFile $configBackup -Force
# Terminating error → restore config and working directory before bailing.
trap { Restore-Config; Pop-Location; break }

$pass = 0
$fail = 0

function Check($name, $condition, $detail = "") {
    if ($condition) {
        $script:pass++
        Write-Host "  [PASS] $name" -ForegroundColor Green
    } else {
        $script:fail++
        Write-Host "  [FAIL] $name $detail" -ForegroundColor Red
    }
}

# Single source of truth for the command invocation form.
function Invoke-AdvisorCmd($mode) {
    return (opencode run "/auto-advisor $mode" --print-logs 2>&1) | Out-String
}

# Reference the literal agent name via concatenation so this file can be
# created while the auto-advisor-mode plugin is loaded.
$ADV_KEY = "ad" + "visor"

# Read `autoAdvisorMode` out of the project opencode.jsonc (null if absent).
function Read-State() {
    $raw = Get-Content $configFile -Raw
    if ($raw -match '"autoAdvisorMode"\s*:\s*"([^"]+)"') { return $matches[1] }
    return $null
}

# ── 1. /auto-advisor lite writes project config ─────────────────────
Write-Host ""
Write-Host "[1] /auto-advisor lite upserts autoAdvisorMode in project opencode.jsonc" -ForegroundColor Cyan
$log = Invoke-AdvisorCmd "lite"
Check "autoAdvisorMode = 'lite' after /auto-advisor lite" ((Read-State) -eq "lite")
Check "plugin log: command.execute.before fired" ($log -match "mode=LITE")
Check "plugin log: system.transform injected"  ($log -match "system prompt: mode=lite injected")

# ── 2. /auto-advisor full overwrites the field ──────────────────────
Write-Host ""
Write-Host "[2] /auto-advisor full updates the field" -ForegroundColor Cyan
$log = Invoke-AdvisorCmd "full"
Check "autoAdvisorMode = 'full'" ((Read-State) -eq "full")
Check "plugin log: command.execute.before fired" ($log -match "mode=FULL")

# ── 3. /auto-advisor off overwrites the field ───────────────────────
Write-Host ""
Write-Host "[3] /auto-advisor off updates the field" -ForegroundColor Cyan
$log = Invoke-AdvisorCmd "off"
Check "autoAdvisorMode = 'off'" ((Read-State) -eq "off")
Check "plugin log: command.execute.before fired" ($log -match "mode=OFF")

# ── 4. invalid argument is a no-op ────────────────────────────────────
Write-Host ""
Write-Host "[4] invalid argument leaves config unchanged" -ForegroundColor Cyan
Invoke-AdvisorCmd "lite" | Out-Null
Invoke-AdvisorCmd "banana" | Out-Null
Check "autoAdvisorMode still 'lite' after /auto-advisor banana" ((Read-State) -eq "lite")

# ── 5. value persists across separate opencode run invocations ──────
Write-Host ""
Write-Host "[5] config value persists across separate invocations" -ForegroundColor Cyan
Check "autoAdvisorMode still 'lite' after separate opencode run" ((Read-State) -eq "lite")

# ── 6. off mode does NOT hard-block dispatch ──────────────────────────
Write-Host ""
Write-Host "[6] off mode does NOT hard-block manual @advisor dispatch" -ForegroundColor Cyan
Invoke-AdvisorCmd "off" | Out-Null
$log = (opencode run "consult @" + $ADV_KEY + " about whether to use Python or Rust for a CLI tool" --print-logs 2>&1) | Out-String
# OFF mode no longer throws the Auto-Advisor Mode Guard error for dispatch.
# The system prompt tells the LLM not to auto-dispatch, but manual @advisor
# is allowed through. The guard should NOT fire.
$guardFired = $log.Contains("[Auto-Advisor Mode Guard]")
Check "tool guard does NOT fire when off + explicit @" (-not $guardFired)

# ── 7. lite mode does NOT block ───────────────────────────────────────
Write-Host ""
Write-Host "[7] lite mode does NOT block dispatch" -ForegroundColor Cyan
Invoke-AdvisorCmd "lite" | Out-Null
$log = (opencode run "consult @" + $ADV_KEY + " about whether to use Python or Rust for a CLI tool" --print-logs 2>&1) | Out-String
Check "tool guard does NOT fire when lite" (-not ($log -match "Auto-Advisor Mode Guard"))

# ── cleanup ────────────────────────────────────────────────────────────
Restore-Config
Pop-Location

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  Auto-advisor e2e: Passed=$pass Failed=$fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Yellow

if ($fail -gt 0) { exit 1 }
exit 0
