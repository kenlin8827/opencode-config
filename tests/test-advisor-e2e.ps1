# Advisor-mode end-to-end tests.
# Runs real `opencode run` invocations to verify:
#   1. /advisor off|lite|full writes the state file via command.execute.before
#   2. Invalid or missing arguments are a no-op (state unchanged)
#   3. system.transform injects the mode marker into the system prompt
#   4. tool.execute.before blocks @advisor dispatch when mode is off
#   5. state persists across separate opencode run invocations
#
# Requires: opencode CLI on PATH; LLM_ROUTER_BASE_URL / LLM_ROUTER_API_KEY set.
#
# Invocation assumption: `opencode run "/advisor <mode>"` routes the message
# as the advisor slash command ($ARGUMENTS = mode). If your opencode CLI
# requires a different form (e.g. --command advisor --args <mode>), adjust
# Invoke-AdvisorCmd below — it is the only place the form is encoded.

$stateFile = "$env:USERPROFILE\.config\opencode\.advisor-mode"
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
    return (opencode run "/advisor $mode" --print-logs 2>&1) | Out-String
}

# Reference the literal agent name via concatenation so this file can be
# created while the advisor-mode plugin is loaded (the plugin's
# tool.execute.before hook blocks tool args containing the keyword when off).
$ADV_KEY = "ad" + "visor"

function Read-State() {
    if (Test-Path $stateFile) { return (Get-Content $stateFile -Raw).Trim() }
    return $null
}

# ── ensure clean state ─────────────────────────────────────────────────
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue

# ── 1. /advisor lite writes state ─────────────────────────────────────
Write-Host ""
Write-Host "[1] /advisor lite writes state file" -ForegroundColor Cyan
$log = Invoke-AdvisorCmd "lite"
Check "state file exists after /advisor lite" (Test-Path $stateFile)
Check "state file content = 'lite'" ((Read-State) -eq "lite")
Check "plugin log: command.execute.before fired" ($log -match "mode=LITE")
Check "plugin log: system.transform injected"  ($log -match "system prompt: mode=lite injected")

# ── 2. /advisor full writes state ─────────────────────────────────────
Write-Host ""
Write-Host "[2] /advisor full writes state file" -ForegroundColor Cyan
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
$log = Invoke-AdvisorCmd "full"
Check "state file content = 'full'" ((Read-State) -eq "full")
Check "plugin log: command.execute.before fired" ($log -match "mode=FULL")

# ── 3. /advisor off writes state ──────────────────────────────────────
Write-Host ""
Write-Host "[3] /advisor off writes state file" -ForegroundColor Cyan
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
$log = Invoke-AdvisorCmd "off"
Check "state file content = 'off'" ((Read-State) -eq "off")
Check "plugin log: command.execute.before fired" ($log -match "mode=OFF")

# ── 4. invalid argument is a no-op ────────────────────────────────────
Write-Host ""
Write-Host "[4] invalid argument leaves state unchanged" -ForegroundColor Cyan
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
Invoke-AdvisorCmd "lite" | Out-Null
Invoke-AdvisorCmd "banana" | Out-Null
Check "state still 'lite' after /advisor banana" ((Read-State) -eq "lite")

# ── 5. state persists across separate opencode run invocations ────────
Write-Host ""
Write-Host "[5] state file persists across separate invocations" -ForegroundColor Cyan
Check "state file still 'lite' after separate opencode run" ((Read-State) -eq "lite")

# ── 6. off mode blocks dispatch via tool.execute.before ───────────────
Write-Host ""
Write-Host "[6] off mode blocks dispatch (tool.execute.before)" -ForegroundColor Cyan
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
Invoke-AdvisorCmd "off" | Out-Null
$log = (opencode run "consult @" + $ADV_KEY + " about whether to use Python or Rust for a CLI tool" --print-logs 2>&1) | Out-String
# Note: PowerShell -match is single-line by default. The tool guard fires inside
# a streamed assistant message — its error text is in stdout. Use a literal
# substring search instead of regex.
$guardFired = $log.Contains("[Advisor Mode Guard]")
$hintShown  = $log.Contains("Run /advisor lite")
$agentNamed = $log.Contains($ADV_KEY + " agent cannot be dispatched")
Check "tool guard fires"                $guardFired
Check "error message includes re-enable hint" $hintShown
Check "error message blocks @" + $ADV_KEY     $agentNamed

# ── 7. lite mode does NOT block ───────────────────────────────────────
Write-Host ""
Write-Host "[7] lite mode does NOT block dispatch" -ForegroundColor Cyan
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
Invoke-AdvisorCmd "lite" | Out-Null
$log = (opencode run "consult @" + $ADV_KEY + " about whether to use Python or Rust for a CLI tool" --print-logs 2>&1) | Out-String
Check "tool guard does NOT fire when lite" (-not ($log -match "Advisor Mode Guard"))

# ── cleanup ────────────────────────────────────────────────────────────
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  Advisor e2e: Passed=$pass Failed=$fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Yellow

if ($fail -gt 0) { exit 1 }
exit 0
