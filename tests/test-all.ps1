# Run all tests sequentially
# Requires LLM_ROUTER_BASE_URL and LLM_ROUTER_API_KEY in system environment.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File tests/test-all.ps1                # all tests
#   powershell -ExecutionPolicy Bypass -File tests/test-all.ps1 -IncludePrompts # include ponytail behavioral

param(
    [switch]$IncludePrompts
)

Set-Location "$PSScriptRoot\.."

# ============================================================================
# Structural checks (no API calls)
# ============================================================================

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

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Structural: config & protocols" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$config = Get-Content "$PSScriptRoot\..\opencode.json" -Raw | ConvertFrom-Json
Check "instructions contains output-protocol.md" `
    ($config.instructions -contains "~/.config/opencode/agents/_shared/output-protocol.md")
Check "plugin includes @dietrichgebert/ponytail" `
    ($config.plugin -contains "@dietrichgebert/ponytail")
# decision-advisor.md was removed in the split-into-plugins refactor — protocol
# now lives embedded in plugins/advisor/advisor-instructions.ts. The
# instructions array is intentionally size 1 (just output-protocol.md).
Check "instructions count = 1" ($config.instructions.Count -eq 1)
Check "instructions does NOT include decision-advisor.md" `
    (-not ($config.instructions -contains "~/.config/opencode/agents/_shared/decision-advisor.md"))

# Ponytail config (official plugin)
$ponytailConfigPath = Join-Path $env:APPDATA "ponytail\config.json"
if (Test-Path $ponytailConfigPath) {
    $ponytailConfig = Get-Content $ponytailConfigPath -Raw | ConvertFrom-Json
    Check "ponytail config: defaultMode is lite" ($ponytailConfig.defaultMode -eq "lite")
} else {
    Check "ponytail config: config.json exists" $false
}

# Agent ecosystem library mentions
$trustedAgents = @(
    @{ file = "java-dev.md";   libs = "Spring|HikariCP|Flyway" }
    @{ file = "python-dev.md"; libs = "SQLAlchemy|Pydantic|pytest" }
    @{ file = "node-dev.md";   libs = "Prisma|Zod" }
)
foreach ($agent in $trustedAgents) {
    $content = Get-Content "$PSScriptRoot\..\agents\$($agent.file)" -Raw
    Check "$($agent.file): mentions ecosystem libs" ($content -match $agent.libs)
}

# Security rules preserved
$javaContent = Get-Content "$PSScriptRoot\..\agents\java-dev.md" -Raw
$pyContent = Get-Content "$PSScriptRoot\..\agents\python-dev.md" -Raw
$nodeContent = Get-Content "$PSScriptRoot\..\agents\node-dev.md" -Raw
Check "java-dev.md: security rules intact" ($javaContent -match "secrets|security|hardcode")
Check "python-dev.md: security rules intact" ($pyContent -match "bare.*except|security")
Check "node-dev.md: security rules intact" ($nodeContent -match "Validate all input|security")

# Non-coding agent isolation
$researcherContent = Get-Content "$PSScriptRoot\..\agents\researcher.md" -Raw
Check "researcher.md: no ponytail rules (non-coding)" ($researcherContent -notmatch "ponytail|lazy coding")

# File integrity
$allFiles = @(
    "agents/_shared/output-protocol.md",
    "agents/build.md", "agents/plan.md", "agents/explorer.md",
    "agents/go-dev.md", "agents/rust-dev.md", "agents/java-dev.md",
    "agents/python-dev.md", "agents/node-dev.md", "agents/frontend-dev.md",
    "agents/researcher.md", "agents/architect.md", "agents/code-review.md",
    "agents/advisor.md",
    "agents/dba.md", "agents/devops.md", "agents/qa.md",
    "agents/security.md", "agents/tech-writer.md", "agents/vision.md",
    # Commands
    "commands/review-fix-loop.md", "commands/grill-me.md",
    "commands/grill-with-docs.md",
    "commands/advisor.md",
    # Plugins (advisor-mode + helpers)
    "plugins/advisor-mode.ts",
    "plugins/advisor/advisor-config.ts",
    "plugins/advisor/advisor-runtime.ts",
    "plugins/advisor/advisor-instructions.ts",
    "plugins/advisor/advisor-mode-tracker.ts",
    "plugins/advisor/advisor-system-inject.ts",
    "plugins/advisor/advisor-tool-guard.ts",
    "plugins/advisor/advisor-full-inject.ts",
    "plugins/design-token-guard.ts", "plugins/ai-slop-scanner.ts",
    "plugins/metrics.ts", "plugins/auto-format.ts",
    # Config
    "tsconfig.json", "package.json"
)
foreach ($f in $allFiles) {
    Check "file exists: $f" (Test-Path "$PSScriptRoot\..\$f")
}

# Command content checks
$grillMe = Get-Content "$PSScriptRoot\..\commands\grill-me.md" -Raw
$grillWithDocs = Get-Content "$PSScriptRoot\..\commands\grill-with-docs.md" -Raw
Check "grill-me.md: has frontmatter agent" ($grillMe -match "agent: build")
Check "grill-me.md: has one-question-at-a-time rule" ($grillMe -match "one at a time")
Check "grill-me.md: has recommendation requirement" ($grillMe -match "MUST include your recommended")
Check "grill-me.md: has facts vs decisions" ($grillMe -match "Facts vs")
Check "grill-me.md: has stop conditions" ($grillMe -match "Stop conditions")
Check "grill-me.md: has session output format" ($grillMe -match "Grilling Summary")

Check "grill-with-docs.md: has frontmatter agent" ($grillWithDocs -match "agent: build")
Check "grill-with-docs.md: has domain modeling" ($grillWithDocs -match "Domain modeling")
Check "grill-with-docs.md: has CONTEXT.md format" ($grillWithDocs -match "CONTEXT.md")
Check "grill-with-docs.md: has ADR format" ($grillWithDocs -match "ADR format")
Check "grill-with-docs.md: has ADR three criteria" ($grillWithDocs -match "Hard to reverse")
Check "grill-with-docs.md: has lazy file creation" ($grillWithDocs -match "lazily")
Check "grill-with-docs.md: has glossary rules" ($grillWithDocs -match "Be opinionated")
Check "grill-with-docs.md: has one-question-at-a-time" ($grillWithDocs -match "one at a time")

# Advisor command checks (single file, $ARGUMENTS selects mode)
$advisorCmd = Get-Content "$PSScriptRoot\..\commands\advisor.md" -Raw
Check "advisor.md: has description frontmatter" ($advisorCmd -match "description:")
Check "advisor.md: lists all 3 modes (off/lite/full)" `
    (($advisorCmd -match "lite") -and ($advisorCmd -match "full") -and ($advisorCmd -match "off"))
Check "advisor.md: references @advisor dispatch" ($advisorCmd -match "@advisor")
Check "advisor.md: mentions blocking decisions" ($advisorCmd -match "blocking")
Check "advisor.md: references confidence score" ($advisorCmd -match "confidence")
Check "advisor.md: mentions threshold 9" ($advisorCmd -match "9")
Check "advisor.md: mentions auto-execute" ($advisorCmd -match "auto-execute" -or $advisorCmd -match "directly")

# Advisor agent checks
$advisorAgent = Get-Content "$PSScriptRoot\..\agents\advisor.md" -Raw
Check "advisor.md: has frontmatter mode subagent" ($advisorAgent -match "mode: subagent")
Check "advisor.md: uses advisor model" ($advisorAgent -match "model: llm-router/advisor")
Check "advisor.md: read-only (edit deny)" ($advisorAgent -match "edit: deny")
Check "advisor.md: no ask-user language" (-not ($advisorAgent -match "ask the user" -or $advisorAgent -match "ask a focused question"))
Check "advisor.md: has output format" ($advisorAgent -match "Output format")
Check "advisor.md: states recommendation requirement" ($advisorAgent -match "ALWAYS state your recommendation")
Check "advisor.md: has confidence score" ($advisorAgent -match "confidence score")
Check "advisor.md: has confidence in output format" ($advisorAgent -match "Confidence.*1-10")

# Advisor mode plugin checks (split into multiple files under plugins/advisor/)
$advisorPlugin = Get-Content "$PSScriptRoot\..\plugins\advisor-mode.ts" -Raw
Check "advisor-mode.ts: imports Plugin type" ($advisorPlugin -match "import type.*Plugin.*from.*@opencode-ai/plugin")
Check "advisor-mode.ts: has command.execute.before hook" ($advisorPlugin -match "command.execute.before")
Check "advisor-mode.ts: has system.transform hook" ($advisorPlugin -match "experimental.chat.system.transform")
Check "advisor-mode.ts: has tool.execute.before hook" ($advisorPlugin -match "tool.execute.before")
Check "advisor-mode.ts: has tool.execute.after hook" ($advisorPlugin -match "tool.execute.after")
Check "advisor-mode.ts: thin glue (<50 lines)" (($advisorPlugin -split "`n").Count -lt 50)

$advisorConfig = Get-Content "$PSScriptRoot\..\plugins\advisor\advisor-config.ts" -Raw
Check "advisor-config.ts: has COMMAND_NAME constant" ($advisorConfig -match "COMMAND_NAME")
Check "advisor-config.ts: has getMode function" ($advisorConfig -match "getMode")
Check "advisor-config.ts: has setMode function" ($advisorConfig -match "setMode")
Check "advisor-config.ts: has isOn function" ($advisorConfig -match "isOn")
Check "advisor-config.ts: defaults to lite" ($advisorConfig -match "lite.*default" -or $advisorConfig -match "DEFAULT_MODE.*lite")
Check "advisor-config.ts: has parseModeArg" ($advisorConfig -match "parseModeArg")

$advisorToolGuard = Get-Content "$PSScriptRoot\..\plugins\advisor\advisor-tool-guard.ts" -Raw
Check "advisor-tool-guard.ts: blocks advisor when off" `
    ($advisorToolGuard -match "Advisor mode is OFF" -or $advisorToolGuard -match "throw.*Error.*advisor")
Check "advisor-tool-guard.ts: has makeToolGuardHook" ($advisorToolGuard -match "makeToolGuardHook")

$advisorInstructions = Get-Content "$PSScriptRoot\..\plugins\advisor\advisor-instructions.ts" -Raw
Check "advisor-instructions.ts: embeds PROTOCOL string" ($advisorInstructions -match "PROTOCOL")
Check "advisor-instructions.ts: has MODE_MARKER for 3 modes (off/lite/full)" `
    (($advisorInstructions -match "lite") -and ($advisorInstructions -match "full") -and ($advisorInstructions -match "off"))
Check "advisor-instructions.ts: has getAdvisorPrompt" ($advisorInstructions -match "getAdvisorPrompt")
Check "advisor-instructions.ts: has fullDirective" ($advisorInstructions -match "fullDirective")

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
foreach ($r in $results) {
    if ($r -match "PASS") { Write-Host "  $r" -ForegroundColor Green }
    else { Write-Host "  $r" -ForegroundColor Red }
}
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  Structural: Passed=$pass Failed=$fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Yellow

# ============================================================================

# Decision strategy structural checks
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-decisions.ps1"

# Prompt tests (API calls)
# ============================================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 1: build agent (custom prompt)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-build.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 2: plan orchestrator (custom prompt)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-plan.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 3: subagent via build agent dispatch" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-subagent.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 4: default agent (no custom prompt)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-default.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  ALL TESTS COMPLETE" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow