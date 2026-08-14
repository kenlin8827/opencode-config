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
$op = Get-Content "$base\instructions\output-protocol.md" -Raw
Check "output-protocol: two-tier decision strategy" ($op -match "Non-blocking" -and $op -match "Blocking")
Check "output-protocol: has STOP for blocking" ($op -match "STOP")
Check "output-protocol: subagents no question tool" ($op -match "no.*question.*tool")
Check "output-protocol: non-blocking says state assumption" ($op -match "state assumption")
Check "output-protocol: orchestrator re-dispatches" ($op -match "re-dispatch")
Check "output-protocol: skip trivial decisions" ($op -match "skip.*trivial" -or $op -match "NEVER invent")
Check "output-protocol: recommended option first in question" ($op -match "recommended option FIRST")
Check "output-protocol: blocking options recommended first" ($op -match "recommended first")

# Decision mode: 3 advisor modes (off/lite/full)
Check "output-protocol: has decision mode section" ($op -match "3 advisor modes")
Check "output-protocol: has lite mode" ($op -match "lite")
Check "output-protocol: has full mode" ($op -match "full")
Check "output-protocol: has off mode" ($op -match "off.*direct" -or $op -match "off.*orchestrator")
Check "output-protocol: has advisor mode" (($op -match "advisor") -and ($op -match "@advisor"))
Check "output-protocol: has session toggle (command)" ($op -match "/advisor off" -or $op -match "/advisor-on")
Check "output-protocol: has full toggle" ($op -match "/advisor full" -or $op -match "advisor-decisive")
Check "output-protocol: has permanent toggle (instructions or config)" ($op -match "instructions" -or $op -match "opencode.json")
Check "output-protocol: advisor only for blocking" ($op -match "blocking decision")
Check "output-protocol: has confidence score" ($op -match "confidence")
Check "output-protocol: has threshold 8" ($op -match "8")

# Subagent checks: should NOT have "ask the user" or "ask a question" language
# (subagents don't have the question tool and would stall)
$subFiles = @(
    "agents/java-dev.md", "agents/python-dev.md", "agents/go-dev.md",
    "agents/rust-dev.md", "agents/node-dev.md", "agents/frontend-dev.md",
    "agents/devops.md", "agents/code-review.md", "agents/researcher.md",
    "agents/advisor.md"
)
foreach ($f in $subFiles) {
    $c = Get-Content "$base\$f" -Raw
    $hasAsk = $c -match "ask the user" -or $c -match "ask a focused question" -or $c -match "ask one focused"
    Check "$f no ask-user language" (-not $hasAsk)
}

# build.md checks
$bc = Get-Content "$base\agents\build.md" -Raw
Check "build.md exists and readable" ($bc.Length -gt 0)
Check "build.md: has advisor mode section" ($bc -match "Advisor mode")
Check "build.md: references @advisor" ($bc -match "@advisor")
Check "build.md: has session toggle" ($bc -match "/advisor")
Check "build.md: has full toggle" ($bc -match "/advisor full" -or $bc -match "advisor-decisive")
Check "build.md: has permanent toggle" ($bc -match "instructions" -or $bc -match "opencode.json")

# Context passing checks (build.md multi-step workflow)
Check "build.md: has one-line summary instruction" ($bc -match "one-line summary of prior conclusions")
Check "build.md: has 'not full findings' guard" ($bc -match "not full findings")
Check "build.md: has 'Pass only what' guard" ($bc -match "Pass only what")
Check "build.md: has Don't dump full agent output" ($bc -match "Don't dump full agent output")
Check "build.md: still has Carry context forward" ($bc -match "Carry context forward")
Check "build.md: no context sharing header template" ($bc -notmatch "CONTEXT SHARING HEADER")
Check "build.md: no shared_context placeholder" ($bc -notmatch "\{shared_context\}")

# review-fix-loop: protocol now lives in review-fix-loop.md, loaded by rfl-instructions.ts
$rfl = Get-Content "$base\plugins\review-fix-loop\review-fix-loop.md" -Raw
Check "review-fix-loop.md: has carry context forward rule" ($rfl -match "Carry context forward")
Check "review-fix-loop.md: has prior round summary" ($rfl -match "Previous rounds found and fixed")
Check "review-fix-loop.md: passes only P0/P1" ($rfl -match "Fix only.*P0/P1")

$rflInstr = Get-Content "$base\plugins\review-fix-loop\rfl-instructions.ts" -Raw
Check "rfl-instructions.ts: has getProtocol function" ($rflInstr -match "getProtocol")
Check "rfl-instructions.ts: reads review-fix-loop.md" ($rflInstr -match "review-fix-loop.md")

# review-fix-loop plugin entry checks
$rflPlugin = Get-Content "$base\plugins\review-fix-loop.ts" -Raw
Check "review-fix-loop.ts: has command.execute.before hook" ($rflPlugin -match "command.execute.before")
Check "review-fix-loop.ts: has system.transform hook" ($rflPlugin -match "experimental.chat.system.transform")
Check "review-fix-loop.ts: has config hook" ($rflPlugin -match "config:")
Check "review-fix-loop.ts: registers command" ($rflPlugin -match "COMMAND_NAME")
Check "review-fix-loop.ts: sets agent build" ($rflPlugin -match '"build"')
Check "review-fix-loop.ts: thin glue (<60 lines)" (($rflPlugin -split "`n").Count -lt 60)

# advisor-instructions.ts checks (post-refactor: protocol lives in plugin, not _shared)
$ai = Get-Content "$base\plugins\advisor\advisor-instructions.ts" -Raw
Check "advisor-instructions.ts: exists and readable" ($ai.Length -gt 0)
Check "advisor-instructions.ts: references @advisor" ($ai -match "@advisor")
Check "advisor-instructions.ts: has dispatch section" ($ai -match "dispatch")
Check "advisor-instructions.ts: only blocking decisions" ($ai -match "blocking")
Check "advisor-instructions.ts: has 3 modes (off/lite/full)" `
    (($ai -match "lite") -and ($ai -match "full") -and ($ai -match "off"))
Check "advisor-instructions.ts: has confidence threshold" ($ai -match "confidence" -and $ai -match "8")

# advisor-mode.ts checks (plugin entry)
$am = Get-Content "$base\plugins\advisor-mode.ts" -Raw
Check "advisor-mode.ts: has command.execute.before hook" ($am -match "command.execute.before")
Check "advisor-mode.ts: has system.transform hook" ($am -match "experimental.chat.system.transform")
Check "advisor-mode.ts: has tool.execute.before hook" ($am -match "tool.execute.before")
Check "advisor-mode.ts: has tool.execute.after hook" ($am -match "tool.execute.after")

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