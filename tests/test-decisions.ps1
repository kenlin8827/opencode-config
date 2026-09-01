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
Check "output-protocol: has session toggle (command)" ($op -match "/auto-advisor off" -or $op -match "/advisor off")
# Toggle is now a single compact form: /auto-advisor off|lite|full
Check "output-protocol: has full toggle" ($op -match "/auto-advisor off\|lite\|full" -or $op -match "/auto-advisor full" -or $op -match "advisor-decisive")
Check "output-protocol: has permanent toggle (instructions or config)" ($op -match "instructions" -or $op -match "opencode.json")
Check "output-protocol: advisor only for blocking" ($op -match "blocking decision")
Check "output-protocol: has confidence score" ($op -match "confidence")
Check "output-protocol: has threshold 8" ($op -match "8")

# Subagent checks: should NOT have "ask the user" or "ask a question" language
# (subagents don't have the question tool and would stall)
$subFiles = @(
    "prompts/java-dev.md", "prompts/python-dev.md", "prompts/go-dev.md",
    "prompts/rust-dev.md", "prompts/node-dev.md", "prompts/frontend-dev.md",
    "prompts/devops.md", "prompts/code-review.md", "prompts/researcher.md",
    "prompts/advisor.md"
)
foreach ($f in $subFiles) {
    $c = Get-Content "$base\$f" -Raw
    $hasAsk = $c -match "ask the user" -or $c -match "ask a focused question" -or $c -match "ask one focused"
    Check "$f no ask-user language" (-not $hasAsk)
}

# build.md checks
$bc = Get-Content "$base\prompts\build.md" -Raw
Check "build.md exists and readable" ($bc.Length -gt 0)
Check "build.md: has advisor mode section" ($bc -match "Advisor mode")
Check "build.md: references @advisor" ($bc -match "@advisor")
Check "build.md: has session toggle" ($bc -match "/auto-advisor" -or $bc -match "/advisor")
Check "build.md: has full toggle" ($bc -match "/auto-advisor full" -or $bc -match "/advisor full" -or $bc -match "advisor-decisive")
Check "build.md: has permanent toggle" ($bc -match "instructions" -or $bc -match "opencode.json")

# Context passing checks (build.md multi-step workflow)
Check "build.md: has one-line summary instruction" ($bc -match "one-line summary of prior conclusions")
Check "build.md: has 'not full findings' guard" ($bc -match "not full findings")
Check "build.md: has 'Pass only what' guard" ($bc -match "Pass only what")
Check "build.md: has Don't dump full agent output" ($bc -match "Don't dump full agent output")
Check "build.md: still has Carry context forward" ($bc -match "Carry context forward")
Check "build.md: no context sharing header template" ($bc -notmatch "CONTEXT SHARING HEADER")
Check "build.md: no shared_context placeholder" ($bc -notmatch "\{shared_context\}")

# review-fix-loop: protocol lives at L2 (skills/review-fix-loop/SKILL.md),
# /review-fix-loop is a thin command launcher (no plugin injection).
$rfl = Get-Content "$base\skills\review-fix-loop\SKILL.md" -Raw
Check "review-fix-loop SKILL.md: has carry context forward rule" ($rfl -match "Carry context forward")
Check "review-fix-loop SKILL.md: has prior round summary" ($rfl -match "Previous rounds found and fixed")
Check "review-fix-loop SKILL.md: fixes only P0/P1" ($rfl -match "Fix only verified P0/P1")
Check "review-fix-loop SKILL.md: on-demand frontmatter" ($rfl -match "name: review-fix-loop" -and $rfl -match "Load ONLY")

$rflLauncher = Get-Content "$base\commands\review-fix-loop.md" -Raw
Check "review-fix-loop launcher: loads its skill and forwards arguments" ($rflLauncher -match "Load the review-fix-loop skill" -and $rflLauncher -match '\$ARGUMENTS')
Check "review-fix-loop launcher: routes to @build" ($rflLauncher -match "agent: build")


# advisor-instructions.ts checks (post-refactor: protocol lives in plugin, not _shared)
$ai = Get-Content "$base\plugins\auto-advisor\auto-advisor-instructions.ts" -Raw
Check "advisor-instructions.ts: exists and readable" ($ai.Length -gt 0)
Check "advisor-instructions.ts: references @advisor" ($ai -match "@advisor")
Check "advisor-instructions.ts: has dispatch section" ($ai -match "dispatch")
Check "advisor-instructions.ts: only blocking decisions" ($ai -match "blocking")
Check "advisor-instructions.ts: has 3 modes (off/lite/full)" `
    (($ai -match "lite") -and ($ai -match "full") -and ($ai -match "off"))
Check "advisor-instructions.ts: has confidence threshold" ($ai -match "confidence" -and $ai -match "8")

# auto-advisor-mode.ts checks (plugin entry)
$am = Get-Content "$base\plugins\auto-advisor-mode.ts" -Raw
Check "auto-advisor-mode.ts: has command.execute.before hook" ($am -match "command.execute.before")
Check "auto-advisor-mode.ts: has system.transform hook" ($am -match "experimental.chat.system.transform")
Check "auto-advisor-mode.ts: has tool.execute.before hook" ($am -match "tool.execute.before")
Check "auto-advisor-mode.ts: has tool.execute.after hook" ($am -match "tool.execute.after")

# plan.md checks
$pc = Get-Content "$base\prompts\plan.md" -Raw
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