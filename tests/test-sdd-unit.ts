/**
 * SDD (Specification-Driven Development) Unit Tests
 *
 * Tests:
 *   1. Phase definition and metadata
 *   2. Phase transition options (recommended + skips + backtrack + finish)
 *   3. Slugification
 *   4. Scaffolding (PRD & Plan) and idempotency
 *   5. Artifact discovery (listSddArtifacts)
 *   6. System prompt transform and cache marker idempotency
 *   7. Plugin config hook and command registrations (/sdd, /prd, /plan, /impl)
 *   8. Command hook execution (/sdd help, /sdd status, /prd, /plan)
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  getPhaseTransitionOptions,
  listSddArtifacts,
  scaffoldPlan,
  scaffoldPrd,
  SDD_PHASES,
  slugify,
  type SddPhase,
} from "../plugins/sdd/sdd-engine"
import { injectSddSystemPrompt, SDD_MARKER } from "../plugins/sdd/sdd-system-inject"
import { makeSddCommandHook, IMPL_COMMAND, PLAN_COMMAND, PRD_COMMAND, SDD_COMMAND } from "../plugins/sdd/sdd-command"
import { SddPlugin } from "../plugins/sdd/sdd"

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`)
    passed++
  } else {
    console.error(`  ❌ ${msg}`)
    failed++
  }
}

function header(title: string) {
  console.log(`\n════════════════════════════════════════════════════════════`)
  console.log(`  ${title}`)
  console.log(`════════════════════════════════════════════════════════════`)
}

// -------------------------------------------------------------
// 01: Phase definition & metadata
// -------------------------------------------------------------
header("01: Phase definition & metadata")
assert(Boolean(SDD_PHASES.prd), "PRD phase exists")
assert(Boolean(SDD_PHASES.adr), "ADR phase exists")
assert(Boolean(SDD_PHASES.plan), "PLAN phase exists")
assert(Boolean(SDD_PHASES.impl), "IMPL phase exists")
assert(SDD_PHASES.prd.recommendedNext === "adr", "PRD -> ADR")
assert(SDD_PHASES.adr.recommendedNext === "plan", "ADR -> PLAN")
assert(SDD_PHASES.plan.recommendedNext === "impl", "PLAN -> IMPL")

// -------------------------------------------------------------
// 02: Phase transition options & flexible skips
// -------------------------------------------------------------
header("02: Phase transition options & flexible skips")

const prdOptions = getPhaseTransitionOptions("prd")
assert(prdOptions.some((o) => o.isRecommended && o.targetPhase === "adr"), "PRD recommends /adr")
assert(prdOptions.some((o) => o.targetPhase === "plan"), "PRD allows jump to /plan")
assert(prdOptions.some((o) => o.targetPhase === "impl"), "PRD allows jump directly to /impl")
assert(prdOptions.some((o) => o.id === "finish"), "PRD allows finish/stay")

const adrOptions = getPhaseTransitionOptions("adr")
assert(adrOptions.some((o) => o.isRecommended && o.targetPhase === "plan"), "ADR recommends /plan")
assert(adrOptions.some((o) => o.targetPhase === "impl"), "ADR allows jump directly to /impl")
assert(adrOptions.some((o) => o.targetPhase === "prd"), "ADR allows back to /prd")

const planOptions = getPhaseTransitionOptions("plan")
assert(planOptions.some((o) => o.isRecommended && o.targetPhase === "impl"), "PLAN recommends /impl")
assert(planOptions.some((o) => o.targetPhase === "adr"), "PLAN allows back to /adr")
assert(planOptions.some((o) => o.targetPhase === "prd"), "PLAN allows back to /prd")

const implOptions = getPhaseTransitionOptions("impl")
assert(implOptions.some((o) => o.isRecommended && o.id === "qa"), "IMPL recommends /qa")
assert(implOptions.some((o) => o.id === "review"), "IMPL allows /code-review")
assert(implOptions.some((o) => o.id === "handoff"), "IMPL allows /handoff")

// -------------------------------------------------------------
// 03: Slugification
// -------------------------------------------------------------
header("03: Slugification")
assert(slugify("User Authentication") === "user-authentication", "Simple phrase slugified")
assert(slugify("用户认证") === "用户认证", "Unicode Chinese slugified cleanly")
assert(slugify("Payment_Gateway v2.0") === "payment-gateway-v20", "Special characters stripped")
assert(slugify("   multiple   spaces  ") === "multiple-spaces", "Whitespace normalized")
assert(slugify("---dashes---") === "dashes", "Leading/trailing dashes stripped")
assert(slugify("") === "feature", "Empty input fallbacks to 'feature'")

// -------------------------------------------------------------
// 04: Scaffolding (PRD & Plan)
// -------------------------------------------------------------
header("04: Scaffolding (PRD & Plan)")
const testTmpDir = join(process.cwd(), "scratch_test_sdd")
if (existsSync(testTmpDir)) rmSync(testTmpDir, { recursive: true, force: true })
mkdirSync(testTmpDir, { recursive: true })

try {
  // PRD scaffold
  const prd1 = scaffoldPrd(testTmpDir, "Shopping Cart")
  assert(prd1.created, "PRD scaffold created new file")
  assert(existsSync(prd1.path), "PRD file exists on disk")
  assert(prd1.relPath.includes("shopping-cart.md") && !prd1.relPath.includes("PRD-"), "PRD file has correct relative path without prefix")

  const prd2 = scaffoldPrd(testTmpDir, "Shopping Cart")
  assert(!prd2.created, "Second call does not overwrite existing PRD (idempotent)")

  // Plan scaffold
  const plan1 = scaffoldPlan(testTmpDir, "Shopping Cart")
  assert(plan1.created, "Plan scaffold created new file")
  assert(existsSync(plan1.path), "Plan file exists on disk")
  assert(plan1.relPath.includes("shopping-cart.md") && !plan1.relPath.includes("PLAN-"), "Plan file has correct relative path without prefix")

  const plan2 = scaffoldPlan(testTmpDir, "Shopping Cart")
  assert(!plan2.created, "Second call does not overwrite existing Plan (idempotent)")

  // Artifact discovery
  const artifacts = listSddArtifacts(testTmpDir)
  assert(artifacts.prds.length === 1, "Discovered 1 PRD")
  assert(artifacts.plans.length === 1, "Discovered 1 Plan")
} finally {
  if (existsSync(testTmpDir)) rmSync(testTmpDir, { recursive: true, force: true })
}

// -------------------------------------------------------------
// 05: System prompt transform & cache idempotency
// -------------------------------------------------------------
header("05: System prompt transform & cache idempotency")

const output = { system: ["You are a coding assistant."] }
injectSddSystemPrompt(output)

assert(output.system[0].includes(SDD_MARKER), "Marker injected into system prompt")
assert(output.system[0].includes("SDD Protocol"), "Protocol body injected")

const lengthAfterFirst = output.system[0].length
injectSddSystemPrompt(output)
assert(output.system[0].length === lengthAfterFirst, "Second call is a complete no-op (preserves prompt cache)")

// -------------------------------------------------------------
// 06: Plugin registration & command hooks
// -------------------------------------------------------------
header("06: Plugin registration & command hooks")

const mockPluginInput: any = {
  client: {
    session: {
      prompt: async (opts: any) => {
        // mock session prompt
      },
    },
  },
}

const plugin = await SddPlugin(mockPluginInput)
const cfg: any = {}
await plugin.config!(cfg)

assert(Boolean(cfg.command[SDD_COMMAND]), "/sdd command registered")
assert(Boolean(cfg.command[PRD_COMMAND]), "/prd command registered")
assert(Boolean(cfg.command[PLAN_COMMAND]), "/plan command registered")
assert(Boolean(cfg.command[IMPL_COMMAND]), "/impl command registered")

assert(cfg.command[PRD_COMMAND].agent === "build", "/prd routes to @build")
assert(cfg.command[PLAN_COMMAND].agent === "plan", "/plan routes to @plan")
assert(cfg.command[IMPL_COMMAND].agent === "code", "/impl routes to @code")

// -------------------------------------------------------------
// 07: Command hook execution
// -------------------------------------------------------------
header("07: Command hook execution")

let promptedText = ""
const capturingClient: any = {
  session: {
    prompt: async (opts: any) => {
      promptedText = opts?.body?.parts?.[0]?.text || ""
    },
  },
}

const commandHook = makeSddCommandHook(capturingClient)

// /sdd help
await commandHook({ command: "sdd", arguments: "help", sessionID: "s1" })
assert(promptedText.includes("Specification-Driven Development"), "/sdd help outputs help text")

// /sdd status
await commandHook({ command: "sdd", arguments: "status", sessionID: "s1" })
assert(promptedText.includes("[SDD Status]"), "/sdd status outputs status text")

// /sdd handoff
await commandHook({ command: "sdd", arguments: "handoff", sessionID: "s1" })
assert(promptedText.includes("Generating SDD Handoff Package"), "/sdd handoff announces handoff generation")

// =============================================================
// Summary
// =============================================================
console.log(`\n════════════════════════════════════════════════════════════`)
console.log(`  Result: ${passed} passed / ${failed} failed`)
console.log(`════════════════════════════════════════════════════════════\n`)

if (failed > 0) process.exit(1)
