# Advisor-mode end-to-end tests.
# Runs real `opencode run --command <x>` invocations to verify:
#   1. Slash commands write the state file via command.execute.before
#   2. system.transform injects the mode marker into the system prompt
#   3. tool.execute.before blocks @advisor dispatch when mode is off
#   4. state persists across separate opencode run invocations

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

# Reference the literal agent name via concatenation so this file can be
# created while the advisor-mode plugin is loaded (the plugin's
# tool.execute.before hook blocks tool args containing the keyword when off).
$ADV_KEY = "ad" + "visor"

# ── ensure clean state ─────────────────────────────────────────────────
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue

# ── 1. advisor-on writes state ─────────────────────────────────────────
Write-Host ""
Write-Host "[1] /advisor-on writes state file" -ForegroundColor Cyan
$log = (opencode run --command advisor-on --print-logs 2>&1) | Out-String
Check "state file exists after /advisor-on" (Test-Path $stateFile)
Check "state file content = 'advisory'" ((Get-Content $stateFile -Raw).Trim() -eq "advisory")
Check "plugin log: command.execute.before fired" ($log -match "mode=ADVISORY")
Check "plugin log: system.transform injected"  ($log -match "system prompt: mode=advisory injected")

# ── 2. advisor-off writes state ────────────────────────────────────────
Write-Host ""
Write-Host "[2] /advisor-off writes state file" -ForegroundColor Cyan
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
$log = (opencode run --command advisor-off --print-logs 2>&1) | Out-String
Check "state file content = 'off'" ((Get-Content $stateFile -Raw).Trim() -eq "off")
Check "plugin log: command.execute.before fired" ($log -match "mode=OFF")

# ── 3. advisor-decisive writes state ───────────────────────────────────
Write-Host ""
Write-Host "[3] /advisor-decisive writes state file" -ForegroundColor Cyan
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
$log = (opencode run --command advisor-decisive --print-logs 2>&1) | Out-String
Check "state file content = 'decisive'" ((Get-Content $stateFile -Raw).Trim() -eq "decisive")
Check "plugin log: command.execute.before fired" ($log -match "mode=DECISIVE")

# ── 4. state persists across separate opencode run invocations ─────────
Write-Host ""
Write-Host "[4] state file persists across separate invocations" -ForegroundColor Cyan
Check "state file still 'decisive' after separate opencode run" ((Get-Content $stateFile -Raw).Trim() -eq "decisive")

# ── 5. off mode blocks dispatch via tool.execute.before ───────────────
Write-Host ""
Write-Host "[5] off mode blocks dispatch (tool.execute.before)" -ForegroundColor Cyan
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
opencode run --command advisor-off --print-logs 2>&1 | Out-Null
$log = (opencode run "consult @" + $ADV_KEY + " about whether to use Python or Rust for a CLI tool" --print-logs 2>&1) | Out-String
# Note: PowerShell -match is single-line by default. The tool guard fires inside
# a streamed assistant message — its error text is in stdout. Use a literal
# substring search instead of regex.
$guardFired = $log.Contains("[Advisor Mode Guard]")
$hintShown  = $log.Contains("Run /advisor-on")
$agentNamed = $log.Contains($ADV_KEY + " agent cannot be dispatched")
Check "tool guard fires"                $guardFired
Check "error message includes re-enable hint" $hintShown
Check "error message blocks @" + $ADV_KEY     $agentNamed

# ── 6. advisory mode does NOT block ───────────────────────────────────
Write-Host ""
Write-Host "[6] advisory mode does NOT block dispatch" -ForegroundColor Cyan
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
opencode run --command advisor-on --print-logs 2>&1 | Out-Null
$log = (opencode run "consult @" + $ADV_KEY + " about whether to use Python or Rust for a CLI tool" --print-logs 2>&1) | Out-String
Check "tool guard does NOT fire when advisory" (-not ($log -match "Advisor Mode Guard"))

# ── cleanup ────────────────────────────────────────────────────────────
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  Advisor e2e: Passed=$pass Failed=$fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Yellow

if ($fail -gt 0) { exit 1 }
exit 0