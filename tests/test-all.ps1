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
$ponytail = Get-Content "$PSScriptRoot\..\agents\_shared\ponytail.md" -Raw

Check "instructions contains output-protocol.md" `
    ($config.instructions -contains "~/.config/opencode/agents/_shared/output-protocol.md")
Check "instructions contains ponytail.md" `
    ($config.instructions -contains "~/.config/opencode/agents/_shared/ponytail.md")
Check "instructions count = 2" ($config.instructions.Count -eq 2)

# ponytail.md content
Check "ponytail.md: has frontmatter source" ($ponytail -match "source: https://github.com/DietrichGebert/ponytail")
Check "ponytail.md: has 'Lazy coding protocol'" ($ponytail -match "Lazy coding protocol")
Check "ponytail.md: has 'The ladder'" ($ponytail -match "### The ladder")
Check "ponytail.md: has 'Rules'" ($ponytail -match "### Rules")
Check "ponytail.md: has YAGNI" ($ponytail -match "YAGNI")
Check "ponytail.md: has 'ponytail:' comment convention" ($ponytail -match "ponytail:")
Check "ponytail.md: has root cause rule" ($ponytail -match "root cause")
Check "ponytail.md: has 'no unrequested abstractions'" ($ponytail -match "No unrequested abstractions")
Check "ponytail.md: has off switch" ($ponytail -match "stop ponytail" -and $ponytail -match "normal mode")
Check "ponytail.md: no Java-specific content" ($ponytail -notmatch "Spring IS")
Check "ponytail.md: no Node-specific content" ($ponytail -notmatch "NestJS/Express IS")
Check "ponytail.md: defers to each agent" ($ponytail -match "defer to each agent")
Check "ponytail.md: no '### Output' (output-protocol owns this)" ($ponytail -notmatch "### Output")
Check "ponytail.md: no '### Intensity'" ($ponytail -notmatch "### Intensity")
Check "ponytail.md: limits scope to coding" ($ponytail -match "Applies only to coding tasks")
Check "ponytail.md: excludes non-coding agents" ($ponytail -match "Non-coding agents ignore this")

# Agent trusted-library rules
$trustedAgents = @(
    @{ file = "java-dev.md";   libs = "Spring|HikariCP|Flyway" }
    @{ file = "python-dev.md"; libs = "SQLAlchemy|Pydantic|pytest" }
    @{ file = "node-dev.md";   libs = "Prisma|Zod|pino" }
)
foreach ($agent in $trustedAgents) {
    $content = Get-Content "$PSScriptRoot\..\agents\$($agent.file)" -Raw
    Check "$($agent.file): has 'Prefer trusted ecosystem libraries'" ($content -match "Prefer trusted ecosystem libraries")
    Check "$($agent.file): mentions ecosystem libs" ($content -match $agent.libs)
}

$goContent = Get-Content "$PSScriptRoot\..\agents\go-dev.md" -Raw
Check "go-dev.md: no trusted-ecosystem rule (stdlib-first)" ($goContent -notmatch "Prefer trusted ecosystem libraries")
$rustContent = Get-Content "$PSScriptRoot\..\agents\rust-dev.md" -Raw
Check "rust-dev.md: no trusted-ecosystem rule (lean deps)" ($rustContent -notmatch "Prefer trusted ecosystem libraries")

# Security rules preserved
$javaContent = Get-Content "$PSScriptRoot\..\agents\java-dev.md" -Raw
$pyContent = Get-Content "$PSScriptRoot\..\agents\python-dev.md" -Raw
$nodeContent = Get-Content "$PSScriptRoot\..\agents\node-dev.md" -Raw
Check "java-dev.md: security rules intact" ($javaContent -match "secrets|security|Don't hardcode")
Check "python-dev.md: security rules intact" ($pyContent -match "bare.*except|security")
Check "node-dev.md: security rules intact" ($nodeContent -match "Validate input|security")

# Non-coding agent isolation
$researcherContent = Get-Content "$PSScriptRoot\..\agents\researcher.md" -Raw
Check "researcher.md: no ponytail rules (non-coding)" ($researcherContent -notmatch "ponytail|lazy coding")

# File integrity
$allFiles = @(
    "agents/_shared/output-protocol.md", "agents/_shared/ponytail.md",
    "agents/orchestrator.md", "agents/plan-orchestrator.md",
    "agents/go-dev.md", "agents/rust-dev.md", "agents/java-dev.md",
    "agents/python-dev.md", "agents/node-dev.md", "agents/frontend-dev.md",
    "agents/researcher.md", "agents/architect.md", "agents/code-review.md",
    "agents/dba.md", "agents/devops.md", "agents/qa.md",
    "agents/security.md", "agents/tech-writer.md", "agents/vision.md"
)
foreach ($f in $allFiles) {
    Check "file exists: $f" (Test-Path "$PSScriptRoot\..\$f")
}

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
# Prompt tests (API calls)
# ============================================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 1: orchestrator (custom prompt)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-orchestrator.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 2: plan orchestrator (custom prompt)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-plan.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 3: subagent via orchestrator dispatch" -ForegroundColor Cyan
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
    Write-Host "Test 5: ponytail behavioral (YAGNI + reuse)" -ForegroundColor Cyan
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
        if ($outputStr -match "speculative|YAGNI|skip|not needed|don't need") {
            Write-Host "    [PASS] YAGNI challenges speculative need" -ForegroundColor Green
        } else {
            Write-Host "    [FAIL] YAGNI challenges speculative need" -ForegroundColor Red
        }
        if ($outputStr -match "FormatDate|already exist|rung 2") {
            Write-Host "    [PASS] Reuses existing FormatDate" -ForegroundColor Green
        } else {
            Write-Host "    [FAIL] Reuses existing FormatDate" -ForegroundColor Red
        }
        if ($outputStr -match "rung|ladder|ponytail") {
            Write-Host "    [PASS] References ponytail ladder" -ForegroundColor Green
        } else {
            Write-Host "    [FAIL] References ponytail ladder" -ForegroundColor Red
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
