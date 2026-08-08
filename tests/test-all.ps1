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
Check "instructions contains decision-advisor.md (advisor mode default on)" `
    ($config.instructions -contains "~/.config/opencode/agents/_shared/decision-advisor.md")
Check "instructions count = 2" ($config.instructions.Count -eq 2)

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
    "agents/_shared/decision-advisor.md",
    "agents/build.md", "agents/plan.md", "agents/explorer.md",
    "agents/go-dev.md", "agents/rust-dev.md", "agents/java-dev.md",
    "agents/python-dev.md", "agents/node-dev.md", "agents/frontend-dev.md",
    "agents/researcher.md", "agents/architect.md", "agents/code-review.md",
    "agents/advisor.md",
    "agents/dba.md", "agents/devops.md", "agents/qa.md",
    "agents/security.md", "agents/tech-writer.md", "agents/vision.md",
    # Commands
    "commands/review-fix-loop.md", "commands/grill-me.md",
    "commands/grill-with-docs.md", "commands/advisor-on.md", "commands/advisor-off.md",
    # Plugins
    "plugins/design-token-guard.ts", "plugins/ai-slop-scanner.ts",
    "plugins/metrics.ts", "plugins/auto-format.ts",
    "plugins/advisor-mode.ts",
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

# Advisor command checks
$advisorOn = Get-Content "$PSScriptRoot\..\commands\advisor-on.md" -Raw
$advisorOff = Get-Content "$PSScriptRoot\..\commands\advisor-off.md" -Raw
$advisorDecisive = Get-Content "$PSScriptRoot\..\commands\advisor-decisive.md" -Raw
Check "advisor-on.md: has frontmatter agent" ($advisorOn -match "agent: build")
Check "advisor-on.md: activates advisory mode" ($advisorOn -match "advisory")
Check "advisor-on.md: references @advisor dispatch" ($advisorOn -match "@advisor")
Check "advisor-on.md: mentions blocking decisions" ($advisorOn -match "blocking")
Check "advisor-off.md: has frontmatter agent" ($advisorOff -match "agent: build")
Check "advisor-off.md: deactivates advisor mode" ($advisorOff -match "advisor mode")
Check "advisor-off.md: mentions re-enable options" ($advisorOff -match "advisor-decisive")
Check "advisor-decisive.md: has frontmatter agent" ($advisorDecisive -match "agent: build")
Check "advisor-decisive.md: references confidence score" ($advisorDecisive -match "confidence")
Check "advisor-decisive.md: mentions threshold 9" ($advisorDecisive -match "9")
Check "advisor-decisive.md: mentions auto-execute" ($advisorDecisive -match "auto-execute" -or $advisorDecisive -match "directly")

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

# Advisor mode plugin checks
$advisorPlugin = Get-Content "$PSScriptRoot\..\plugins\advisor-mode.ts" -Raw
Check "advisor-mode.ts: imports Plugin type" ($advisorPlugin -match "import type.*Plugin.*from.*@opencode-ai/plugin")
Check "advisor-mode.ts: has command.execute.before hook" ($advisorPlugin -match "command.execute.before")
Check "advisor-mode.ts: has system.transform hook" ($advisorPlugin -match "experimental.chat.system.transform")
Check "advisor-mode.ts: has tool.execute.before hook" ($advisorPlugin -match "tool.execute.before")
Check "advisor-mode.ts: references state file" ($advisorPlugin -match "STATE_FILE" -or $advisorPlugin -match "advisor-mode")
Check "advisor-mode.ts: has isAdvisorModeOn function" ($advisorPlugin -match "isAdvisorModeOn")
Check "advisor-mode.ts: has setAdvisorMode function" ($advisorPlugin -match "setAdvisorMode")
Check "advisor-mode.ts: defaults to advisory" ($advisorPlugin -match "advisory.*default")
Check "advisor-mode.ts: supports decisive mode" ($advisorPlugin -match "decisive")
Check "advisor-mode.ts: has getAdvisorMode function" ($advisorPlugin -match "getAdvisorMode")
Check "advisor-mode.ts: handles advisor-decisive command" ($advisorPlugin -match "advisor-decisive")
Check "advisor-mode.ts: blocks advisor when off" ($advisorPlugin -match "Advisor mode is currently OFF" -or $advisorPlugin -match "throw.*Error.*advisor")

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
Write-Host "Test 4: default build agent (baseline)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-default.ps1"

if ($IncludePrompts) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Test 5: ponytail plugin (official, lite default)" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    $env:LLM_ROUTER_BASE_URL = [System.Environment]::GetEnvironmentVariable("LLM_ROUTER_BASE_URL","User")
    $env:LLM_ROUTER_API_KEY = [System.Environment]::GetEnvironmentVariable("LLM_ROUTER_API_KEY","User")

    if (-not $env:LLM_ROUTER_BASE_URL -or -not $env:LLM_ROUTER_API_KEY) {
        Write-Host "  LLM_ROUTER env vars not found. Skipping." -ForegroundColor Yellow
    } else {
        $tmpDir = Join-Path $env:TEMP "ponytail-test-$(Get-Random)"
        New-Item -ItemType Directory -Path "$tmpDir/src" -Force | Out-Null
        @"
package main
import "fmt"
func FormatDate(input string) string {
	if len(input) != 10 { return input }
	return fmt.Sprintf("%s/%s/%s", input[8:10], input[5:7], input[0:4])
}
func main() { fmt.Println(FormatDate("2024-01-15")) }
"@ | Set-Content "$tmpDir/src/main.go" -Encoding UTF8
        @"
module test-project
go 1.22
"@ | Set-Content "$tmpDir/go.mod" -Encoding UTF8

        $prompt = "Add a date formatter to convert YYYY-MM-DD to DD/MM/YYYY. Also add a locale factory interface for future US/EU/ISO support."
        Push-Location $tmpDir
        $output = opencode run --auto $prompt 2>&1
        Pop-Location
        $outputStr = $output -join "`n"

        Write-Host $outputStr
        Write-Host ""
        Write-Host "  Behavioral checks:" -ForegroundColor DarkCyan
        if ($outputStr -match "FYI|lazier|not needed|skip|ponytail") {
            Write-Host "    [PASS] Suggests lazier alternative" -ForegroundColor Green
        } else {
            Write-Host "    [FAIL] Suggests lazier alternative" -ForegroundColor Red
        }
        if ($outputStr -match "FormatDate|already exist|reuse") {
            Write-Host "    [PASS] Reuses existing FormatDate" -ForegroundColor Green
        } else {
            Write-Host "    [FAIL] Reuses existing FormatDate" -ForegroundColor Red
        }
        if ($outputStr -match "FYI|lazier|ponytail") {
            Write-Host "    [PASS] References ponytail lite suggestion" -ForegroundColor Green
        } else {
            Write-Host "    [FAIL] References ponytail lite suggestion" -ForegroundColor Red
        }

        Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
    }
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor DarkGray
    Write-Host "Test 5: ponytail behavioral SKIPPED (use -IncludePrompts)" -ForegroundColor DarkGray
    Write-Host "========================================" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "All tests complete." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
