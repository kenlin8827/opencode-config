# Run all tests sequentially
# Requires LLM_ROUTER_BASE_URL and LLM_ROUTER_API_KEY in system environment.
#
# Usage:
#   pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1                       # all tests
#   pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -IncludePrompts       # include ponytail behavioral
#   pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -StructuralOnly       # no API calls; CI-safe, exits non-zero on failure

param(
    [switch]$IncludePrompts,
    [switch]$StructuralOnly
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

$config = Get-Content "$PSScriptRoot\..\opencode.jsonc" -Raw | ConvertFrom-Json
Check "instructions contains output-protocol.md" `
    ($config.instructions -contains "~/.config/opencode/instructions/output-protocol.md")
Check "plugin includes @dietrichgebert/ponytail" `
    ($config.plugin -contains "@dietrichgebert/ponytail")
# decision-advisor.md was removed in the split-into-plugins refactor — protocol
# now lives embedded in plugins/auto-advisor/auto-advisor-instructions.ts.
# instructions array: output-protocol.md + context-efficiency.md + test-scope.md + rfc-keywords.md + coding-principles.md
Check "instructions count = 5" ($config.instructions.Count -eq 5)
Check "instructions contains context-efficiency.md" `
    ($config.instructions -contains "~/.config/opencode/instructions/context-efficiency.md")
Check "instructions does NOT include decision-advisor.md" `
    (-not ($config.instructions -contains "~/.config/opencode/instructions/decision-advisor.md"))

# Ponytail config (official plugin) — environment-dependent: SKIP when the
# config file doesn't exist (fresh machine / CI), only assert when present.
if ($env:APPDATA) {
    $ponytailConfigPath = Join-Path $env:APPDATA "ponytail\config.json"
    if (Test-Path $ponytailConfigPath) {
        $ponytailConfig = Get-Content $ponytailConfigPath -Raw | ConvertFrom-Json
        Check "ponytail config: defaultMode is lite" ($ponytailConfig.defaultMode -eq "lite")
    } else {
        Write-Host "  [SKIP] ponytail config check (config.json not present on this machine)" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  [SKIP] ponytail config check (no APPDATA — non-Windows host)" -ForegroundColor DarkGray
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
    "instructions/output-protocol.md",
    "instructions/context-efficiency.md",
    "instructions/test-scope.md",
    "agents/build.md", "agents/plan.md", "agents/explorer.md",
    "agents/go-dev.md", "agents/rust-dev.md", "agents/java-dev.md",
    "agents/python-dev.md", "agents/node-dev.md", "agents/frontend-dev.md",
    "agents/researcher.md", "agents/architect.md", "agents/code-review.md",
    "agents/advisor.md",
    "agents/dba.md", "agents/devops.md", "agents/qa.md",
    "agents/security.md", "agents/tech-writer.md", "agents/vision.md",
    # Commands (auto-advisor command is registered programmatically via config hook — no commands/*.md file needed)
    # Plugins (auto-advisor-mode + helpers + review-fix-loop + grill + goal + deepseek-anchor)
    "plugins/auto-advisor-mode.ts",
    "plugins/auto-advisor/auto-advisor-config.ts",
    "plugins/auto-advisor/auto-advisor-runtime.ts",
    "plugins/auto-advisor/auto-advisor-instructions.ts",
    "plugins/auto-advisor/auto-advisor-mode-tracker.ts",
    "plugins/auto-advisor/auto-advisor-system-inject.ts",
    "plugins/auto-advisor/auto-advisor-tool-guard.ts",
    "plugins/auto-advisor/auto-advisor-full-inject.ts",
    "plugins/auto-advisor/auto-advisor-announce.ts",
    "plugins/review-fix-loop.ts",
    "plugins/review-fix-loop/review-fix-loop.ts",
    "plugins/review-fix-loop/review-fix-loop.md",
    "plugins/grill-me.ts",
    "plugins/grill-with-docs.ts",
    "plugins/deepseek-anchor.ts",
    "plugins/deepseek-anchor/index.ts",
    "plugins/deepseek-anchor/deepseek-anchor-config.ts",
    "plugins/deepseek-anchor/deepseek-anchor-command.ts",
    "plugins/deepseek-anchor/deepseek-anchor-announce.ts",
    "plugins/grill/grill-me.ts",
    "plugins/grill/grill-me.md",
    "plugins/grill/grill-with-docs.ts",
    "plugins/grill/grill-with-docs.md",
    "plugins/goal.ts",
    "plugins/goal/goal.ts",
    "plugins/goal/goal.md",
    "plugins/project-profiler.ts",
    "plugins/project-profiler/project-profiler.ts",
    "plugins/adr-guard.ts",
    "plugins/adr-guard/adr-guard.ts",
    "plugins/adr-guard/adr-guard-config.ts",
    "plugins/adr-guard/adr-guard-runtime.ts",
    "plugins/adr-guard/adr-guard-protocol.md",
    "plugins/adr-guard/adr-guard-instructions.ts",
    "plugins/adr-guard/adr-guard-system-inject.ts",
    "plugins/adr-guard/adr-guard-tool-guard.ts",
    "plugins/adr-guard/adr-guard-command.ts",
    "plugins/adr-guard/adr-guard-announce.ts",
    "plugins/env-guard.ts",
    "plugins/env-guard/env-guard.ts",
    "plugins/env-guard/env-guard-config.ts",
    "plugins/env-guard/env-guard-runtime.ts",
    "plugins/env-guard/env-guard-tool-guard.ts",
    "plugins/shared/opencode-config.ts",
    "plugins/project-manager.ts",
    "plugins/project-manager/project-manager.ts",
    "plugins/project-manager/project-manager-config.ts",
    "plugins/project-manager/project-manager-scaffold.ts",
    "plugins/project-manager/project-manager-command.ts",
    "plugins/project-manager/project-manager-system-inject.ts",
    "plugins/project-manager/project-manager-tool-guard.ts",
    "plugins/project-manager/templates/opencode.jsonc",
    "plugins/project-manager/templates/git-commits.md",
    "plugins/project-manager/templates/AGENTS.md",
    "plugins/project-manager/templates/dbhub.toml",
    "plugins/design-token-guard.ts", "plugins/ai-slop-scanner.ts",
    "plugins/metrics.ts", "plugins/auto-format.ts",
    # Config
    "tsconfig.json", "package.json"
)
foreach ($f in $allFiles) {
    Check "file exists: $f" (Test-Path "$PSScriptRoot\..\$f")
}

# Grill plugin checks (plugins/grill/ — registered programmatically, no commands/*.md)
$grillMePlugin = Get-Content "$PSScriptRoot\..\plugins\grill\grill-me.ts" -Raw
$grillMeProtocol = Get-Content "$PSScriptRoot\..\plugins\grill\grill-me.md" -Raw
Check "grill-me.ts: imports Plugin type" ($grillMePlugin -match "import type.*Plugin.*from.*@opencode-ai/plugin")
Check "grill-me.ts: has config hook registering command" ($grillMePlugin -match "config:" -and $grillMePlugin -match 'COMMAND_NAME')
Check "grill-me.ts: NO command.execute.before hook" (-not ($grillMePlugin -match '"command\.execute\.before"'))
Check "grill-me.ts: has system.transform hook" ($grillMePlugin -match "experimental.chat.system.transform")
Check "grill-me.ts: agent is build" ($grillMePlugin -match 'agent:.*"build"')
Check "grill-me.md: has one-question-at-a-time rule" ($grillMeProtocol -match "one at a time")
Check "grill-me.md: has recommendation requirement" ($grillMeProtocol -match "MUST include your recommended")
Check "grill-me.md: has facts vs decisions" ($grillMeProtocol -match "Facts vs")
Check "grill-me.md: has stop conditions" ($grillMeProtocol -match "Stop conditions")
Check "grill-me.md: has session output format" ($grillMeProtocol -match "Grilling Summary")

$grillWithDocsPlugin = Get-Content "$PSScriptRoot\..\plugins\grill\grill-with-docs.ts" -Raw
$grillWithDocsProtocol = Get-Content "$PSScriptRoot\..\plugins\grill\grill-with-docs.md" -Raw
Check "grill-with-docs.ts: imports Plugin type" ($grillWithDocsPlugin -match "import type.*Plugin.*from.*@opencode-ai/plugin")
Check "grill-with-docs.ts: has config hook registering command" ($grillWithDocsPlugin -match "config:" -and $grillWithDocsPlugin -match 'COMMAND_NAME')
Check "grill-with-docs.ts: NO command.execute.before hook" (-not ($grillWithDocsPlugin -match '"command\.execute\.before"'))
Check "grill-with-docs.ts: has system.transform hook" ($grillWithDocsPlugin -match "experimental.chat.system.transform")
Check "grill-with-docs.ts: agent is build" ($grillWithDocsPlugin -match 'agent:.*"build"')
Check "grill-with-docs.md: has domain modeling" ($grillWithDocsProtocol -match "Domain modeling")
Check "grill-with-docs.md: has CONTEXT.md format" ($grillWithDocsProtocol -match "CONTEXT.md")
Check "grill-with-docs.md: has ADR format" ($grillWithDocsProtocol -match "ADR format")
Check "grill-with-docs.md: has ADR three criteria" ($grillWithDocsProtocol -match "Hard to reverse")
Check "grill-with-docs.md: has lazy file creation" ($grillWithDocsProtocol -match "lazily")
Check "grill-with-docs.md: has glossary rules" ($grillWithDocsProtocol -match "Be opinionated")
Check "grill-with-docs.md: has one-question-at-a-time" ($grillWithDocsProtocol -match "one at a time")

$grillMeBarrel = Get-Content "$PSScriptRoot\..\plugins\grill-me.ts" -Raw
Check "grill-me.ts: barrel re-exports GrillMePlugin" ($grillMeBarrel -match "export.*GrillMePlugin")

$grillWithDocsBarrel = Get-Content "$PSScriptRoot\..\plugins\grill-with-docs.ts" -Raw
Check "grill-with-docs.ts: barrel re-exports GrillWithDocsPlugin" ($grillWithDocsBarrel -match "export.*GrillWithDocsPlugin")

# Goal plugin checks (plugins/goal/ — registered programmatically, no commands/*.md)
$goalPlugin = Get-Content "$PSScriptRoot\..\plugins\goal\goal.ts" -Raw
$goalProtocol = Get-Content "$PSScriptRoot\..\plugins\goal\goal.md" -Raw
Check "goal.ts: imports Plugin type" ($goalPlugin -match "import type.*Plugin.*from.*@opencode-ai/plugin")
Check "goal.ts: has config hook registering command" ($goalPlugin -match "config:" -and $goalPlugin -match 'COMMAND_NAME')
Check "goal.ts: NO command.execute.before hook" (-not ($goalPlugin -match '"command\.execute\.before"'))
Check "goal.ts: has system.transform hook" ($goalPlugin -match "experimental.chat.system.transform")
Check "goal.ts: agent is build" ($goalPlugin -match 'agent:.*"build"')
Check "goal.md: has golden template" ($goalProtocol -match "golden template")
Check "goal.md: has 5 sections" ($goalProtocol -match "Objective.*Scope.*Constraints.*Done when.*Stop if" -or ($goalProtocol -match "objective" -and $goalProtocol -match "Scope:" -and $goalProtocol -match "Constraints:" -and $goalProtocol -match "Done when:" -and $goalProtocol -match "Stop if:"))
Check "goal.md: has audit checklist" ($goalProtocol -match "audit checklist")
Check "goal.md: has stop conditions" ($goalProtocol -match "Stop conditions")
Check "goal.md: has scenario skeletons" ($goalProtocol -match "Scenario skeletons" -or $goalProtocol -match "Refactor")
Check "goal.md: has project-type defaults" ($goalProtocol -match "Project-type defaults" -or $goalProtocol -match "Node.*TypeScript")
Check "goal.md: has hard rules" ($goalProtocol -match "Hard rules")
Check "goal.md: has output format" ($goalProtocol -match "Output format" -or $goalProtocol -match "Goal Summary")

$goalBarrel = Get-Content "$PSScriptRoot\..\plugins\goal.ts" -Raw
Check "goal.ts: barrel re-exports GoalPlugin" ($goalBarrel -match "export.*GoalPlugin")

# Shared project-config plumbing (plugins/shared/opencode-config.ts — used by adr-guard, env-guard, auto-advisor)
$sharedConfig = Get-Content "$PSScriptRoot\..\plugins\shared\opencode-config.ts" -Raw
Check "shared/opencode-config.ts: exports never-throw field writer" ($sharedConfig -match 'export function setConfigField')
Check "shared/opencode-config.ts: exports field remover" ($sharedConfig -match 'export function clearConfigField')
Check "shared/opencode-config.ts: exports quote-aware stripJsonc" ($sharedConfig -match 'export function stripJsonc')
Check "shared/opencode-config.ts: exports project config file resolution" ($sharedConfig -match 'export function projectConfigFiles')

# ADR iron-law plugin checks (plugins/adr-guard/ — project-level switch, hard commit gate)
$adrPlugin = Get-Content "$PSScriptRoot\..\plugins\adr-guard\adr-guard.ts" -Raw
$adrProtocol = Get-Content "$PSScriptRoot\..\plugins\adr-guard\adr-guard-protocol.md" -Raw
$adrGuard = Get-Content "$PSScriptRoot\..\plugins\adr-guard\adr-guard-tool-guard.ts" -Raw
$adrConfig = Get-Content "$PSScriptRoot\..\plugins\adr-guard\adr-guard-config.ts" -Raw
Check "adr-guard.ts: imports Plugin type" ($adrPlugin -match "import type.*Plugin.*from.*@opencode-ai/plugin")
Check "adr-guard.ts: has config hook registering command" ($adrPlugin -match "config:" -and $adrPlugin -match 'COMMAND_NAME')
Check "adr-guard.ts: has command.execute.before hook" ($adrPlugin -match '"command\.execute\.before"')
Check "adr-guard.ts: has system.transform hook" ($adrPlugin -match "experimental.chat.system.transform")
Check "adr-guard.ts: has tool.execute.before hook" ($adrPlugin -match '"tool\.execute\.before"')
Check "adr-guard.ts: injects project directory" ($adrPlugin -match "setProjectDir\(directory\)")
Check "adr-guard-config.ts: switch stored in project opencode.jsonc (no state file)" ($adrConfig -match 'shared/opencode-config' -and $adrConfig -match 'adrGuard')
Check "adr-guard-config.ts: default state is off" ($adrConfig -match 'DEFAULT_STATE: GuardState = "off"')
Check "adr-guard-config.ts: default ADR dir docs/adr" ($adrConfig -match 'DEFAULT_ADR_DIR = "docs/adr"')
Check "adr-guard-tool-guard.ts: gates feat/refactor only" ($adrGuard -match "requiresAdr")
Check "adr-guard-tool-guard.ts: checks ADR working-tree changes" ($adrGuard -match "hasAdrChanges")
Check "adr-guard-protocol.md: has iron law" ($adrProtocol -match "iron law")
Check "adr-guard-protocol.md: has MADR frontmatter" ($adrProtocol -match "status: accepted" -and $adrProtocol -match "date:")
Check "adr-guard-protocol.md: has sequential numbering" ($adrProtocol -match "NNNN-slug")
Check "adr-guard-protocol.md: forbids type relabeling bypass" ($adrProtocol -match "MUST NOT" -and $adrProtocol -match "relabeling the commit type")

$adrBarrel = Get-Content "$PSScriptRoot\..\plugins\adr-guard.ts" -Raw
Check "adr-guard.ts: barrel re-exports AdrGuardPlugin" ($adrBarrel -match "export.*AdrGuardPlugin")

# Env guard plugin checks (plugins/env-guard/ — project-level switch, secret-file gate)
$egPlugin = Get-Content "$PSScriptRoot\..\plugins\env-guard\env-guard.ts" -Raw
$egConfig = Get-Content "$PSScriptRoot\..\plugins\env-guard\env-guard-config.ts" -Raw
$egRuntime = Get-Content "$PSScriptRoot\..\plugins\env-guard\env-guard-runtime.ts" -Raw
$egGuard = Get-Content "$PSScriptRoot\..\plugins\env-guard\env-guard-tool-guard.ts" -Raw
Check "env-guard.ts: imports Plugin type" ($egPlugin -match "import type.*Plugin.*from.*@opencode-ai/plugin")
Check "env-guard.ts: has tool.execute.before hook" ($egPlugin -match '"tool\.execute\.before"')
Check "env-guard.ts: injects project directory" ($egPlugin -match "setProjectDir\(directory\)")
Check "env-guard-config.ts: switch stored in project opencode.jsonc (no state file)" ($egConfig -match 'shared/opencode-config' -and $egConfig -match 'envGuard')
Check "env-guard-config.ts: default state is off" ($egConfig -match 'DEFAULT_STATE: GuardState = "off"')
Check "env-guard-config.ts: config field envGuard" ($egConfig -match "envGuard")
Check "env-guard-runtime.ts: exempts .env.example" ($egRuntime -match '\.env\.example')
Check "env-guard-runtime.ts: bash leak detection" ($egRuntime -match "bashLeaksEnv")
Check "env-guard-tool-guard.ts: gates file tools" ($egGuard -match "multiedit")
Check "env-guard-tool-guard.ts: gates grep tool" ($egGuard -match '"grep"')
Check "env-guard-tool-guard.ts: gates bash via leak detection" ($egGuard -match "bashLeaksEnv")
Check "env-guard-tool-guard.ts: reuses adr-guard-runtime parsing" ($egGuard -match "adr-guard/adr-guard-runtime")

$egBarrel = Get-Content "$PSScriptRoot\..\plugins\env-guard.ts" -Raw
Check "env-guard.ts: barrel re-exports EnvGuardPlugin" ($egBarrel -match "export.*EnvGuardPlugin")

# Project manager plugin checks (plugins/project-manager/ — file-as-switch commit discipline)
$pmPlugin = Get-Content "$PSScriptRoot\..\plugins\project-manager\project-manager.ts" -Raw
$pmConfig = Get-Content "$PSScriptRoot\..\plugins\project-manager\project-manager-config.ts" -Raw
$pmScaffold = Get-Content "$PSScriptRoot\..\plugins\project-manager\project-manager-scaffold.ts" -Raw
$pmGitTemplate = Get-Content "$PSScriptRoot\..\plugins\project-manager\templates\git-commits.md" -Raw
$pmInject = Get-Content "$PSScriptRoot\..\plugins\project-manager\project-manager-system-inject.ts" -Raw
$pmGuard = Get-Content "$PSScriptRoot\..\plugins\project-manager\project-manager-tool-guard.ts" -Raw
Check "project-manager.ts: imports Plugin type" ($pmPlugin -match "import type.*Plugin.*from.*@opencode-ai/plugin")
Check "project-manager.ts: has config hook registering command" ($pmPlugin -match "config:" -and $pmPlugin -match 'COMMAND_NAME')
Check "project-manager.ts: has command.execute.before hook" ($pmPlugin -match '"command\.execute\.before"')
Check "project-manager.ts: has system.transform hook" ($pmPlugin -match "experimental.chat.system.transform")
Check "project-manager.ts: has tool.execute.before hook" ($pmPlugin -match '"tool\.execute\.before"')
Check "project-manager.ts: injects project directory" ($pmPlugin -match "setProjectDir\(directory\)")
Check "project-manager-config.ts: file-as-switch predicate" ($pmConfig -match "hasConventionFile")
Check "project-manager-config.ts: GIT_COMMITS_REL = docs/git-commits.md" ($pmConfig -match 'GIT_COMMITS_REL = "docs/git-commits\.md"')
Check "project-manager-scaffold.ts: existence check before write" ($pmScaffold -match "existsSync")
Check "project-manager-scaffold.ts: templates loaded from templates/ dir" ($pmScaffold -match "readTemplate" -and $pmScaffold -match "templates")
Check "templates/git-commits.md: documents mechanical enforcement" ($pmGitTemplate -match "mechanically enforced")
Check "project-manager-system-inject.ts: progressive disclosure (no full-content injection)" ($pmInject -match "progressive" -and $pmInject -notmatch "readFileSync")
Check "project-manager-system-inject.ts: line-start marker dedup" ($pmInject -match "MARKER_RE")
Check "project-manager-system-inject.ts: appends to last entry only" ($pmInject -match "system\.length - 1")
Check "project-manager-tool-guard.ts: structural validator" ($pmGuard -match "validateMessage")
Check "project-manager-tool-guard.ts: 72-char first-line cap" ($pmGuard -match "MAX_FIRST_LINE = 72")
Check "project-manager-tool-guard.ts: reuses adr-guard-runtime parsing" ($pmGuard -match "adr-guard/adr-guard-runtime")
Check "project-manager-tool-guard.ts: --amend exempt per invocation" ($pmGuard -match "--amend")
Check "project-manager-tool-guard.ts: merge/revert/fixup/squash exempt" ($pmGuard -match "Merge.*Revert.*fixup.*squash" -or $pmGuard -match "EXEMPT_PREFIX_RE")

$pmBarrel = Get-Content "$PSScriptRoot\..\plugins\project-manager.ts" -Raw
Check "project-manager.ts: barrel re-exports ProjectManagerPlugin" ($pmBarrel -match "export.*ProjectManagerPlugin")

# Advisor command checks (single file, $ARGUMENTS selects mode)
$advisorCmd = Get-Content "$PSScriptRoot\..\commands\advisor.md" -Raw
Check "advisor.md: has description frontmatter" ($advisorCmd -match "description:")
Check "advisor.md: lists all 3 modes (off/lite/full)" `
    (($advisorCmd -match "lite") -and ($advisorCmd -match "full") -and ($advisorCmd -match "off"))
Check "advisor.md: references @advisor dispatch" ($advisorCmd -match "@advisor")
Check "advisor.md: mentions blocking decisions" ($advisorCmd -match "blocking")
Check "advisor.md: references confidence score" ($advisorCmd -match "confidence")
Check "advisor.md: mentions threshold 8" ($advisorCmd -match "8")
Check "advisor.md: mentions auto-execute" ($advisorCmd -match "auto-execute" -or $advisorCmd -match "directly")

# Advisor agent checks
$advisorAgent = Get-Content "$PSScriptRoot\..\agents\advisor.md" -Raw
Check "advisor.md: has frontmatter mode subagent" ($advisorAgent -match "mode: subagent")
# Model binding lives in opencode.jsonc (agent registry), not in the markdown prompt.
Check "opencode.jsonc: binds advisor agent to advisor model" ($config.agent.advisor.model -eq "llm-router/advisor")
Check "advisor.md: read-only (edit deny)" ($advisorAgent -match "edit: deny")
Check "advisor.md: no ask-user language" (-not ($advisorAgent -match "ask the user" -or $advisorAgent -match "ask a focused question"))
Check "advisor.md: has output format" ($advisorAgent -match "Output format")
Check "advisor.md: states recommendation requirement" ($advisorAgent -match "ALWAYS state your recommendation")
Check "advisor.md: has confidence score" ($advisorAgent -match "confidence score")
Check "advisor.md: has confidence in output format" ($advisorAgent -match "Confidence.*1-10")

# Auto-advisor mode plugin checks (split into multiple files under plugins/auto-advisor/)
$advisorPlugin = Get-Content "$PSScriptRoot\..\plugins\auto-advisor-mode.ts" -Raw
Check "auto-advisor-mode.ts: imports Plugin type" ($advisorPlugin -match "import type.*Plugin.*from.*@opencode-ai/plugin")
Check "auto-advisor-mode.ts: has command.execute.before hook" ($advisorPlugin -match "command.execute.before")
Check "auto-advisor-mode.ts: has system.transform hook" ($advisorPlugin -match "experimental.chat.system.transform")
Check "auto-advisor-mode.ts: has tool.execute.before hook" ($advisorPlugin -match "tool.execute.before")
Check "auto-advisor-mode.ts: has tool.execute.after hook" ($advisorPlugin -match "tool.execute.after")
Check "auto-advisor-mode.ts: has event hook (session announce)" ($advisorPlugin -match "event: makeAnnounceHook")
Check "auto-advisor-mode.ts: thin glue (<70 lines)" (($advisorPlugin -split "`n").Count -lt 70)

$advisorConfig = Get-Content "$PSScriptRoot\..\plugins\auto-advisor\auto-advisor-config.ts" -Raw
Check "auto-advisor-config.ts: has COMMAND_NAME constant" ($advisorConfig -match "COMMAND_NAME")
Check "auto-advisor-config.ts: has getMode function" ($advisorConfig -match "getMode")
Check "auto-advisor-config.ts: has setMode function" ($advisorConfig -match "setMode")
Check "auto-advisor-config.ts: has isOn function" ($advisorConfig -match "isOn")
Check "auto-advisor-config.ts: defaults to off" ($advisorConfig -match "DEFAULT_MODE.*off")
Check "auto-advisor-config.ts: has parseModeArg" ($advisorConfig -match "parseModeArg")

$advisorToolGuard = Get-Content "$PSScriptRoot\..\plugins\auto-advisor\auto-advisor-tool-guard.ts" -Raw
Check "auto-advisor-tool-guard.ts: no hard block for advisor when off" `
    (-not ($advisorToolGuard -match "isOn" -and $advisorToolGuard -match "isAdvisorDispatch.*throw"))
Check "auto-advisor-tool-guard.ts: has makeToolGuardHook" ($advisorToolGuard -match "makeToolGuardHook")

$advisorInstructions = Get-Content "$PSScriptRoot\..\plugins\auto-advisor\auto-advisor-instructions.ts" -Raw
Check "auto-advisor-instructions.ts: embeds PROTOCOL string" ($advisorInstructions -match "PROTOCOL")
Check "auto-advisor-instructions.ts: has MODE_MARKER for 3 modes (off/lite/full)" `
    (($advisorInstructions -match "lite") -and ($advisorInstructions -match "full") -and ($advisorInstructions -match "off"))
Check "auto-advisor-instructions.ts: has getAdvisorPrompt" ($advisorInstructions -match "getAdvisorPrompt")
Check "auto-advisor-instructions.ts: has fullDirective" ($advisorInstructions -match "fullDirective")
Check "auto-advisor-instructions.ts: question puts recommended option first" ($advisorInstructions -match "recommended option FIRST")

# Red-team stance (optional adversarial mode on @advisor)
Check "advisor.md: has red-team stance section" ($advisorAgent -match "Stance: red-team")
Check "advisor.md: red-team forbids confidence score" ($advisorAgent -match "NEVER output a confidence score in red-team")
Check "advisor.md: has verdict vocabulary" `
    (($advisorAgent -match "HOLDS") -and ($advisorAgent -match "FAILS"))
Check "auto-advisor-instructions.ts: has red-team stance rules" ($advisorInstructions -match "Red-team stance")
Check "auto-advisor-instructions.ts: red-team never auto-executes" ($advisorInstructions -match "NEVER trigger full-mode auto-execute")
Check "auto-advisor-instructions.ts: FAILS verdict requires user" ($advisorInstructions -match "FAILS")
Check "auto-advisor-instructions.ts: FAILS routes rebuttal to design owner" ($advisorInstructions -match "design owner")
Check "auto-advisor-instructions.ts: no blue team rule" ($advisorInstructions -match "No blue team")

# Red-team auto-execute hard guard (code-level, not prompt-level)
$advisorRuntime = Get-Content "$PSScriptRoot\..\plugins\auto-advisor\auto-advisor-runtime.ts" -Raw
Check "auto-advisor-runtime.ts: has isRedTeamOutput guard" ($advisorRuntime -match "isRedTeamOutput")
Check "auto-advisor-runtime.ts: detects verdict marker" ($advisorRuntime -match "Verdict")

# Question-class gate: full-mode auto-answer requires FACTUAL classification;
# PREFERENCE questions always return to the user, in any mode.
Check "auto-advisor-runtime.ts: has detectQuestionClass gate" ($advisorRuntime -match "detectQuestionClass")
Check "auto-advisor-instructions.ts: defines question class" ($advisorInstructions -match "FACTUAL")
Check "auto-advisor-instructions.ts: PREFERENCE never auto-answered" ($advisorInstructions -match "PREFERENCE questions ALWAYS go back to the user")
Check "auto-advisor-instructions.ts: lite never answers for user" ($advisorInstructions -match "NEVER answers on the user's behalf")
Check "advisor.md: outputs question class" ($advisorAgent -match "Question class")
Check "advisor.md: classifies every question" ($advisorAgent -match "ALWAYS classify the question")

$advisorFullInject = Get-Content "$PSScriptRoot\..\plugins\auto-advisor\auto-advisor-full-inject.ts" -Raw
Check "auto-advisor-full-inject.ts: suppresses red-team output" ($advisorFullInject -match "isRedTeamOutput")
Check "auto-advisor-full-inject.ts: has fallback warning path" ($advisorFullInject -match "fallbackWarning")
Check "auto-advisor-full-inject.ts: requires FACTUAL class for auto-answer" ($advisorFullInject -match "detectQuestionClass")

# Session-created announce + /auto-advisor switch feedback (user visibility)
$advisorAnnounce = Get-Content "$PSScriptRoot\..\plugins\auto-advisor\auto-advisor-announce.ts" -Raw
Check "auto-advisor-announce.ts: has makeAnnounceHook" ($advisorAnnounce -match "makeAnnounceHook")
Check "auto-advisor-announce.ts: listens on session.created" ($advisorAnnounce -match "session.created")
Check "auto-advisor-announce.ts: filters subagent sessions via parentID" ($advisorAnnounce -match "parentID")
Check "auto-advisor-announce.ts: full-mode message names auto-answer risk" ($advisorAnnounce -match "answer blocking questions on your")
Check "auto-advisor-announce.ts: toast via tui.showToast" ($advisorAnnounce -match "showToast")
Check "auto-advisor-announce.ts: degrades to log without TUI" ($advisorAnnounce -match "no TUI")
$advisorTracker = Get-Content "$PSScriptRoot\..\plugins\auto-advisor\auto-advisor-mode-tracker.ts" -Raw
Check "auto-advisor-mode-tracker.ts: switch gives user-visible feedback" ($advisorTracker -match "announceSwitch")

# Advisor e2e test aligns with the current command surface
$advisorE2e = Get-Content "$PSScriptRoot\test-advisor-e2e.ps1" -Raw
Check "test-advisor-e2e.ps1: uses /auto-advisor <mode> form" ($advisorE2e -match "/auto-advisor ")
Check "test-advisor-e2e.ps1: no legacy advisor-on/off/decisive commands" `
    (($advisorE2e -notmatch "advisor-on") -and ($advisorE2e -notmatch "advisor-decisive") -and ($advisorE2e -notmatch "--command advisor-"))
Check "test-advisor-e2e.ps1: covers invalid-argument no-op" ($advisorE2e -match "banana")

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
pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\test-decisions.ps1"
if ($LASTEXITCODE -ne 0) { $fail++ }

# Profile presets: apply each to a fresh template copy and assert refs
# (no API calls; model existence check auto-skips without the opencode CLI)
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Profiles: profiles/ stress test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\test-profiles.ps1"
if ($LASTEXITCODE -ne 0) { $fail++ }

# Prompt tests (API calls) — skipped under -StructuralOnly (CI mode)
# ============================================================================

if (-not $StructuralOnly) {

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 1: build agent (custom prompt)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\test-build.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 2: plan orchestrator (custom prompt)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\test-plan.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 3: subagent via build agent dispatch" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\test-subagent.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 4: default agent (no custom prompt)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\test-default.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  ALL TESTS COMPLETE" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

} else {
    Write-Host ""
    Write-Host "  StructuralOnly: API-based prompt tests skipped" -ForegroundColor DarkGray
}

# Exit code reflects structural + decision check results (API prompt tests
# run as child scripts and report their own output).
if ($fail -gt 0) { exit 1 }
exit 0