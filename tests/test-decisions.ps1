# Decision strategy structural checks
# Called by test-all.ps1
# Verifies output-protocol.md two-tier decision strategy and
# that subagents don't have "ask the user" language (which would stall them).

$pass = 0
$fail = 0
$results = @()

function Check($name, $condition, $detail = "") {
    if ($condition) {
        $script:pass++
        $script:results += "[PASS] $name"
    } else {
        $script:fail++
        $script:results += "[FAIL] $name $detail"
    }
}

$base = "$PSScriptRoot\.."

# output-protocol.md checks
$op = Get-Content "$base\agents\_shared\output-protocol.md" -Raw
Check "output-protocol: two-tier decision strategy" ($op -match "Non-blocking" -and $op -match "Blocking")
Check "output-protocol: has STOP for blocking" ($op -match "STOP")
Check "output-protocol: subagents no question tool" ($op -match "no.*question.*tool")
Check "output-protocol: non-blocking says state assumption" ($op -match "state assumption")
Check "output-protocol: orchestrator re-dispatches" ($op -match "re-dispatch")
Check "output-protocol: skip trivial decisions" ($op -match "skip.*trivial" -or $op -match "NEVER invent")

# Subagent checks: should NOT have "ask the user" or "ask a question" language
# (subagents don't have the question tool and would stall)
$subFiles = @(
    "agents/java-dev.md", "agents/python-dev.md", "agents/go-dev.md",
    "agents/rust-dev.md", "agents/node-dev.md", "agents/frontend-dev.md",
    "agents/devops.md", "agents/code-review.md", "agents/researcher.md"
)
foreach ($f in $subFiles) {
    $c = Get-Content "$base\$f" -Raw
    $hasAsk = $c -match "ask the user" -or $c -match "ask a focused question" -or $c -match "ask one focused"
    Check "$f no ask-user language" (-not $hasAsk)
}

# build.md checks
$bc = Get-Content "$base\agents\build.md" -Raw
Check "build.md exists and readable" ($bc.Length -gt 0)

# plan.md checks
$pc = Get-Content "$base\agents\plan.md" -Raw
Check "plan.md: references question" ($pc -match "question")
Check "plan.md: read-only rule" ($pc -match "Read-only" -or $pc -match "never modify")

# Print results
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Decision strategy checks" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
foreach ($r in $results) {
    if ($r -match "PASS") { Write-Host "  $r" -ForegroundColor Green }
    else { Write-Host "  $r" -ForegroundColor Red }
}
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  Decision checks: Passed=$pass Failed=$fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Yellow
