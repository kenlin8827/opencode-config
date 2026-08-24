/**
 * Project Wizard Plugin — Unit Tests
 *
 * Coverage:
 *   - applySwitchesToConfigContent: switch activation, comment toggling, value updates
 *   - generateConfigContent: template generation with custom switches
 *   - detectCurrentSwitches: parsing from existing opencode.jsonc (re-entrant echo)
 *   - runInitWithSwitches: initial scaffold + switch updates in existing config (re-entrant support)
 *   - TUI plugin module shape & registration
 *
 * Run: bun ./tests/test-project-wizard-unit.ts
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  setProjectDir,
  getProjectDir,
  CONFIG_REL,
} from "../plugins/project-manager/project-manager-config"
import {
  applySwitchesToConfigContent,
  generateConfigContent,
  runInitWithSwitches,
  type ProjectSwitches,
} from "../plugins/project-manager/project-manager-scaffold"
import {
  detectCurrentSwitches,
  toggleGuardState,
  cycleAdvisorMode,
} from "../plugins/project-wizard"
import projectWizardPlugin from "../plugins/project-wizard"

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✅ ${msg}`)
    passed++
  } else {
    console.error(`  ❌ ${msg}`)
    failed++
  }
}

function section(title: string): void {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${"═".repeat(60)}`)
}

// ─── 01: applySwitchesToConfigContent ────────────────────────────────

section("01: applySwitchesToConfigContent — toggle switches")

const TEMPLATE_SAMPLE = `{
  "$schema": "https://opencode.ai/config.json",
  // "autoAdvisorMode": "lite",  // off | lite | full — /auto-advisor <mode>
  // "adrGuard": "on",           // on | off          — /adr-guard <state>
  // "adrGuardDir": "docs/adr",  // ADR directory
  // "envGuard": "on",           // on | off — blocks agent access to secret .env* files (.env.example exempt)
  // "e2eGuard": "on",           // on | off — E2E quality red line: prompts LLM to assess diff impact on feat/fix tasks and interactively confirm with user via ask
}`

{
  const res = applySwitchesToConfigContent(TEMPLATE_SAMPLE, {
    autoAdvisorMode: "full",
    adrGuard: "on",
    adrGuardDir: "architecture/decisions",
    envGuard: "on",
    e2eGuard: "off",
  })

  assert(res.includes('"autoAdvisorMode": "full"'), "uncomments and sets autoAdvisorMode to full")
  assert(!res.includes('// "autoAdvisorMode"'), "no commented autoAdvisorMode remaining")
  assert(res.includes('"adrGuard": "on"'), "uncomments and sets adrGuard to on")
  assert(res.includes('"adrGuardDir": "architecture/decisions"'), "updates adrGuardDir value")
  assert(res.includes('"envGuard": "on"'), "uncomments envGuard to on")
  assert(res.includes('"e2eGuard": "off"'), "uncomments e2eGuard to off")
}

{
  const res = applySwitchesToConfigContent(TEMPLATE_SAMPLE, {
    autoAdvisorMode: "commented",
    adrGuard: "commented",
    envGuard: "commented",
    e2eGuard: "commented",
  })

  assert(res.includes('// "autoAdvisorMode": "lite"'), "leaves autoAdvisorMode commented")
  assert(res.includes('// "adrGuard": "on"'), "leaves adrGuard commented")
  assert(res.includes('// "envGuard": "on"'), "leaves envGuard commented")
  assert(res.includes('// "e2eGuard": "on"'), "leaves e2eGuard commented")
}

// ─── 01b: Switch mode cycling & toggling ─────────────────────────────

section("01b: Switch mode fast toggling (no typing)")

{
  assert(toggleGuardState("on") === "off", "on toggles to off")
  assert(toggleGuardState("off") === "commented", "off toggles to commented")
  assert(toggleGuardState("commented") === "on", "commented toggles to on")

  assert(cycleAdvisorMode("lite") === "full", "lite cycles to full")
  assert(cycleAdvisorMode("full") === "off", "full cycles to off")
  assert(cycleAdvisorMode("off") === "commented", "off cycles to commented")
  assert(cycleAdvisorMode("commented") === "lite", "commented cycles to lite")
}

// ─── 02: generateConfigContent ───────────────────────────────────────

section("02: generateConfigContent — full template generation")

{
  const generated = generateConfigContent({
    autoAdvisorMode: "lite",
    adrGuard: "on",
    adrGuardDir: "docs/adr",
    envGuard: "on",
    e2eGuard: "on",
  })

  assert(generated.includes('"autoAdvisorMode": "lite"'), "generated config has active autoAdvisorMode")
  assert(generated.includes('"adrGuard": "on"'), "generated config has active adrGuard")
  assert(generated.includes('"envGuard": "on"'), "generated config has active envGuard")
  assert(generated.includes('"e2eGuard": "on"'), "generated config has active e2eGuard")
  assert(generated.includes("$schema"), "retains schema header")
}

// ─── 03: detectCurrentSwitches (Re-entrant Echo) ─────────────────────

section("03: detectCurrentSwitches — config inspection & re-entrant echo")

const tmpDir = mkdtempSync(join(tmpdir(), "pw-unit-"))

{
  // No config exists yet → returns exists: false, defaults
  const detected = detectCurrentSwitches(tmpDir)
  assert(!detected.exists, "detects new uninitialized project")
  assert(detected.switches.autoAdvisorMode === "lite", "defaults have autoAdvisorMode lite")
  assert(detected.switches.adrGuard === "on", "defaults have adrGuard on")
  assert(detected.switches.envGuard === "on", "defaults have envGuard on")
  assert(detected.switches.e2eGuard === "on", "defaults have e2eGuard on")
}

{
  // Config exists with custom switches
  mkdirSync(join(tmpDir, ".opencode"), { recursive: true })
  writeFileSync(
    join(tmpDir, ".opencode", "opencode.jsonc"),
    `{
  "model": "anthropic/claude-3-7-sonnet",
  "autoAdvisorMode": "full",
  "envGuard": "on",
  "adrGuardDir": "custom/adr",
  // "adrGuard": "on",
  // "e2eGuard": "on"
}`,
    "utf-8",
  )

  const detected = detectCurrentSwitches(tmpDir)
  assert(detected.exists, "detects existing project config")
  assert(detected.configRelPath === ".opencode/opencode.jsonc", "reports correct relative path")
  assert(detected.switches.autoAdvisorMode === "full", "echoes active autoAdvisorMode full")
  assert(detected.switches.envGuard === "on", "echoes active envGuard on")
  assert(detected.switches.adrGuardDir === "custom/adr", "echoes customized adrGuardDir")
  assert(detected.switches.adrGuard === "commented", "echoes commented adrGuard")
  assert(detected.switches.e2eGuard === "commented", "echoes commented e2eGuard")
}

// ─── 04: runInitWithSwitches (Re-entrant execution) ──────────────────

section("04: runInitWithSwitches — file creation & switch update")

const testProjectDir = mkdtempSync(join(tmpdir(), "pw-init-test-"))
setProjectDir(testProjectDir)

{
  const results = runInitWithSwitches({
    autoAdvisorMode: "lite",
    adrGuard: "on",
    envGuard: "on",
    e2eGuard: "off",
  })

  assert(results.some((r) => r.relPath === ".opencode/opencode.jsonc" && r.status === "created"), "creates config")
  assert(results.some((r) => r.relPath === "docs/git-commits.md" && r.status === "created"), "creates git-commits.md")
  assert(results.some((r) => r.relPath === "AGENTS.md" && r.status === "created"), "creates AGENTS.md")

  const configContent = readFileSync(join(testProjectDir, ".opencode", "opencode.jsonc"), "utf-8")
  assert(configContent.includes('"autoAdvisorMode": "lite"'), "wrote autoAdvisorMode")
  assert(configContent.includes('"e2eGuard": "off"'), "wrote e2eGuard off")
}

{
  // Re-running in existing project updates switches and skips unchanged baseline files
  const results = runInitWithSwitches({
    autoAdvisorMode: "full",
    adrGuard: "off",
    envGuard: "on",
    e2eGuard: "on",
  })

  assert(results.some((r) => r.relPath === ".opencode/opencode.jsonc" && r.status === "updated"), "updates existing config")
  assert(results.some((r) => r.relPath === "docs/git-commits.md" && r.status === "skipped"), "skips existing git-commits.md")
  assert(results.some((r) => r.relPath === "AGENTS.md" && r.status === "skipped"), "skips existing AGENTS.md")

  const updatedContent = readFileSync(join(testProjectDir, ".opencode", "opencode.jsonc"), "utf-8")
  assert(updatedContent.includes('"autoAdvisorMode": "full"'), "updated autoAdvisorMode to full")
  assert(updatedContent.includes('"adrGuard": "off"'), "updated adrGuard to off")
  assert(updatedContent.includes('"e2eGuard": "on"'), "updated e2eGuard to on")
}

// ─── 05: Plugin module export ────────────────────────────────────────

section("05: Plugin module structure")

{
  assert(typeof projectWizardPlugin === "object", "plugin is exported as object")
  assert(projectWizardPlugin.id === "opencode-config.project-wizard", "plugin ID is set")
  assert(typeof projectWizardPlugin.tui === "function", "plugin exports tui function")
}

// Cleanup
try {
  rmSync(tmpDir, { recursive: true, force: true })
  rmSync(testProjectDir, { recursive: true, force: true })
} catch {}

// ─── Summary ─────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`)
console.log(`  RESULT: ${passed} passed, ${failed} failed`)
console.log(`${"═".repeat(60)}\n`)

if (failed > 0) {
  process.exit(1)
}
