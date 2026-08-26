/**
 * SDD Engine — Specification-Driven Development lifecycle & artifact manager.
 *
 * Manages the 4 core phases:
 *   PRD (Requirements) → ADR (Architecture) → PLAN (Implementation Plan) → IMPL (Code Implementation)
 *
 * Supports starting from ANY phase, jumping to any phase,
 * and generating interactive transition prompts at phase boundaries.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type SddPhase = "prd" | "adr" | "plan" | "impl"

export interface PhaseInfo {
  phase: SddPhase
  title: string
  command: string
  dir?: string
  description: string
  recommendedNext?: SddPhase
}

export const SDD_PHASES: Record<SddPhase, PhaseInfo> = {
  prd: {
    phase: "prd",
    title: "Product Requirements Document (PRD)",
    command: "/prd",
    dir: "docs/prd",
    description: "Define user problems, user stories, functional/non-functional requirements, boundaries, and acceptance criteria.",
    recommendedNext: "adr",
  },
  adr: {
    phase: "adr",
    title: "Architecture Decision Record (ADR)",
    command: "/adr",
    dir: "docs/adr",
    description: "System design, technology tradeoffs, schema/API contracts, and architectural decisions.",
    recommendedNext: "plan",
  },
  plan: {
    phase: "plan",
    title: "Implementation Plan (PLAN)",
    command: "/plan",
    dir: "docs/plan",
    description: "Decompose specifications into atomic, phased, test-driven implementation steps and checklist.",
    recommendedNext: "impl",
  },
  impl: {
    phase: "impl",
    title: "Implementation & Verification (IMPL)",
    command: "/impl",
    description: "Step-by-step code implementation, test execution, linting, and acceptance validation.",
    recommendedNext: undefined,
  },
}

export interface TransitionOption {
  id: string
  label: string
  targetPhase?: SddPhase
  isRecommended?: boolean
}

/**
 * Returns user-selectable transition options at the completion of a given phase.
 */
export function getPhaseTransitionOptions(currentPhase: SddPhase): TransitionOption[] {
  switch (currentPhase) {
    case "prd":
      return [
        {
          id: "next_adr",
          label: "(Recommended) Proceed to /adr (Architecture Decisions & System Design)",
          targetPhase: "adr",
          isRecommended: true,
        },
        {
          id: "skip_plan",
          label: "Skip to /plan (Implementation Plan & Task Breakdown)",
          targetPhase: "plan",
        },
        {
          id: "skip_impl",
          label: "Skip directly to /impl (Code Implementation)",
          targetPhase: "impl",
        },
        {
          id: "handoff",
          label: "Pause & Handoff (/sdd handoff)",
        },
        {
          id: "finish",
          label: "Done (Stay in current PRD stage)",
        },
      ]
    case "adr":
      return [
        {
          id: "next_plan",
          label: "(Recommended) Proceed to /plan (Implementation Plan & Task Breakdown)",
          targetPhase: "plan",
          isRecommended: true,
        },
        {
          id: "skip_impl",
          label: "Skip directly to /impl (Code Implementation)",
          targetPhase: "impl",
        },
        {
          id: "back_prd",
          label: "Back to /prd (Requirements Revision)",
          targetPhase: "prd",
        },
        {
          id: "handoff",
          label: "Pause & Handoff (/sdd handoff)",
        },
        {
          id: "finish",
          label: "Done (Stay in current ADR stage)",
        },
      ]
    case "plan":
      return [
        {
          id: "next_impl",
          label: "(Recommended) Proceed to /impl (Code Implementation & Verification)",
          targetPhase: "impl",
          isRecommended: true,
        },
        {
          id: "back_adr",
          label: "Back to /adr (Architecture Adjustment)",
          targetPhase: "adr",
        },
        {
          id: "back_prd",
          label: "Back to /prd (Requirements Adjustment)",
          targetPhase: "prd",
        },
        {
          id: "handoff",
          label: "Pause & Handoff (/sdd handoff)",
        },
        {
          id: "finish",
          label: "Done (Stay in current Plan stage)",
        },
      ]
    case "impl":
      return [
        {
          id: "qa",
          label: "(Recommended) Run QA & Verification (/qa)",
          isRecommended: true,
        },
        {
          id: "review",
          label: "Run Code Review (/code-review)",
        },
        {
          id: "handoff",
          label: "Generate Handoff Document (/handoff)",
        },
        {
          id: "finish",
          label: "Complete & Finish SDD Cycle",
        },
      ]
  }
}

/**
 * Normalizes a raw string topic into a safe filename slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{Letter}\p{Number}\-]/gu, "")
    .replace(/^-+|-+$/g, "") || "feature"
}

/**
 * Scaffolds a new PRD document in docs/prd/ if missing.
 */
export function scaffoldPrd(cwd: string, topic: string): { path: string; relPath: string; created: boolean } {
  const prdDir = join(cwd, "docs", "prd")
  if (!existsSync(prdDir)) {
    mkdirSync(prdDir, { recursive: true })
  }

  const slug = slugify(topic)
  const filename = `${slug}.md`
  const targetPath = join(prdDir, filename)
  const relPath = join("docs", "prd", filename).replace(/\\/g, "/")

  if (existsSync(targetPath)) {
    return { path: targetPath, relPath, created: false }
  }

  const dateStr = new Date().toISOString().split("T")[0]
  const content = `# PRD: ${topic}

- **Status**: Draft
- **Date**: ${dateStr}
- **Author**: OpenCode / SDD Workflow
- **Lifecycle**: \`/prd\` → \`/adr\` → \`/plan\` → \`/impl\`

---

## 1. Problem Statement & Background
<!-- Why are we building this? What user pain or business goal does this address? -->

## 2. Goals & Success Metrics
<!-- Measurable outcomes, KPIs, or expected impact. -->
- **Goal 1**: 
- **Goal 2**: 

## 3. User Personas & User Stories
<!-- As a [user type], I want [capability] so that [benefit]. -->
- **US-01**: As a user, I want ... so that ...

## 4. Functional Requirements (FR)
- [ ] **FR-01**: 
- [ ] **FR-02**: 

## 5. Non-Functional Requirements (NFR)
- **Performance**: 
- **Security & Permissions**: 
- **Reliability & Scalability**: 

## 6. Out of Scope & Boundaries
<!-- Explicitly declare what is NOT part of this feature to prevent scope creep. -->
- 

## 7. Acceptance Criteria (Given / When / Then)
- **AC-01**: 
  - **Given**: 
  - **When**: 
  - **Then**: 

## 8. UX / UI & Interaction Flow (if applicable)
<!-- Wireframes, CLI commands, or UI workflows. -->

---
*Generated by OpenCode SDD Workflow*
`

  writeFileSync(targetPath, content, "utf-8")
  return { path: targetPath, relPath, created: true }
}

/**
 * Scaffolds a new Plan document in docs/plan/ if missing.
 */
export function scaffoldPlan(cwd: string, topic: string): { path: string; relPath: string; created: boolean } {
  const planDir = join(cwd, "docs", "plan")
  if (!existsSync(planDir)) {
    mkdirSync(planDir, { recursive: true })
  }

  const slug = slugify(topic)
  const filename = `${slug}.md`
  const targetPath = join(planDir, filename)
  const relPath = join("docs", "plan", filename).replace(/\\/g, "/")

  if (existsSync(targetPath)) {
    return { path: targetPath, relPath, created: false }
  }

  const dateStr = new Date().toISOString().split("T")[0]
  
  // Resolve upstream references
  const prdRelPath = `../prd/${slug}.md`
  const prdExists = existsSync(join(cwd, "docs", "prd", `${slug}.md`))
  const artifacts = listSddArtifacts(cwd)
  const recentAdrs = artifacts.adrs.slice(-3)

  let prdRefSection = `  - PRD: [${slug}.md](${prdRelPath}) (if applicable)`
  if (prdExists) {
    prdRefSection = `  - PRD: [${slug}.md](${prdRelPath})`
  } else if (artifacts.prds.length > 0) {
    const latestPrd = artifacts.prds[artifacts.prds.length - 1]
    prdRefSection = `  - PRD: [${latestPrd}](../prd/${latestPrd}) (or [${slug}.md](${prdRelPath}))`
  }

  let adrRefSection = "  - ADR: [ADRs in docs/adr/](../adr/) (if applicable)"
  if (recentAdrs.length > 0) {
    adrRefSection = `  - ADRs:\n${recentAdrs.map((adr) => `    - [${adr}](../adr/${adr})`).join("\n")}`
  }

  const content = `# Implementation Plan: ${topic}

- **Status**: Ready for Implementation
- **Date**: ${dateStr}
- **Author**: OpenCode / SDD Workflow
- **Specification References**:
${prdRefSection}
${adrRefSection}

---

## 1. Overview & Objectives
<!-- Brief summary of what is being built and technical approach. -->

## 2. Technical Architecture & Constraints
<!-- Key patterns, libraries, dependencies, and constraints. -->

## 3. Phased Task Breakdown

### Phase 1: Core Foundation & Data Models
- [ ] **Task 1.1**: Define models/interfaces
- [ ] **Task 1.2**: Scaffold base files

### Phase 2: Business Logic & Core Implementation
- [ ] **Task 2.1**: Implement core handlers/services
- [ ] **Task 2.2**: Integrate with existing components

### Phase 3: Verification, Testing & Tool Guards
- [ ] **Task 3.1**: Write unit tests
- [ ] **Task 3.2**: Integration / E2E verification

## 4. Verification Checklist & Acceptance Gates
- [ ] Unit tests pass: \`bun test\` or \`npm test\`
- [ ] Linter & Type checks pass: \`tsc --noEmit\`
- [ ] No regression on existing modules

## 5. Rollback & Risk Mitigation Strategy
- **Risk**: 
- **Mitigation**: 

---
*Generated by OpenCode SDD Workflow*
`

  writeFileSync(targetPath, content, "utf-8")
  return { path: targetPath, relPath, created: true }
}

/**
 * Lists all existing SDD artifacts in the project.
 */
export function listSddArtifacts(cwd: string): { prds: string[]; adrs: string[]; plans: string[] } {
  const prds: string[] = []
  const adrs: string[] = []
  const plans: string[] = []

  const prdDir = join(cwd, "docs", "prd")
  if (existsSync(prdDir)) {
    try {
      const files = readdirSync(prdDir).filter((f) => f.endsWith(".md"))
      prds.push(...files)
    } catch {
      // ignore
    }
  }

  const adrDir = join(cwd, "docs", "adr")
  if (existsSync(adrDir)) {
    try {
      const scanDir = (dir: string) => {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            scanDir(join(dir, entry.name))
          } else if (entry.name.endsWith(".md") && !entry.name.startsWith("INDEX") && !entry.name.startsWith("README")) {
            adrs.push(entry.name)
          }
        }
      }
      scanDir(adrDir)
    } catch {
      // ignore
    }
  }

  const planDir = join(cwd, "docs", "plan")
  if (existsSync(planDir)) {
    try {
      const files = readdirSync(planDir).filter((f) => f.endsWith(".md"))
      plans.push(...files)
    } catch {
      // ignore
    }
  }

  return { prds, adrs, plans }
}
