# E2E Testing Protocol & Quality Red Line

> [!IMPORTANT]
> **Project Policy (`e2eGuard: "on"`):**
> E2E (End-to-End) tests validate end-user journeys across real or integrated systems. Because E2E suites are slow, resource-heavy, and susceptible to flakiness, they must be executed thoughtfully and **must never be run silently or skipped without explicit user alignment**.

---

## 1. Trigger Scope

You **MUST** perform an E2E assessment whenever:
1. **Working on `feat` (New Feature) or `fix` (Bug Fix) tasks**: Any functional change or bug fix requires evaluating E2E test coverage and execution.
2. **Prior to Task Completion / Handoff**: Before declaring a feature or fix complete.
3. **Prior to Git Commit / Push**: Before executing `git commit` or `git push` for functional code changes.

*(Note: Pure documentation (`docs:`), style/formatting (`style:`), or internal configuration refactors with no runtime behavior changes may skip E2E after a brief impact check.)*

---

## 2. Impact Assessment & Test Gap Analysis

Analyze the working tree changes (`git diff HEAD --stat` or changed files) and project configuration (`package.json`, test runner scripts):

### A. E2E Execution Scope Assessment
- **Targeted E2E (Recommended for local/iterative fixes)**:
  - Changes are localized to specific modules or UI components with matching test specs (e.g., `tests/e2e/checkout.spec.ts` or `cypress/e2e/login.cy.js`).
  - Propose running **only the affected specs** for fast feedback.
- **Full E2E Suite (Recommended for core/cross-cutting changes)**:
  - Changes modify core authentication, global state, routing, database schemas, or foundational architectural layers impacting multiple user flows.
- **No E2E Needed (Skip)**:
  - Changes are strictly covered by unit/integration tests, or are purely cosmetic/non-functional.

### B. Test Gap & Case Supplement Check
- **Check Coverage**: Look for existing E2E specs that cover the modified user path or newly added feature.
- **Identify Gaps**:
  - If a **new feature (`feat`)** lacks an E2E spec covering its critical journey, or
  - If a **bug fix (`fix`)** addresses a flaw missed by existing E2E tests,
  - You **MUST** flag this test gap and offer to author/generate the missing E2E test cases before or alongside running tests.

---

## 3. User Alignment & Interactive Decision (`ask`)

**HARD RULE:** You must NOT silently execute E2E test suites or bypass user consent. **NEVER assume user approval or proceed with git commit/push in the same turn without receiving the user's actual interactive answer.**

Use the interactive `ask` tool to present your assessment and let the user decide.

### Interactive Prompt Requirements:
1. **Change Summary & Type**: (e.g., `feat: Add one-click checkout`)
2. **Impact Assessment**:
   - Affected User Journeys / Specs.
   - Test Gap Status: (e.g., *"No existing E2E spec covers one-click checkout. Missing test coverage detected."*)
3. **Ordered Options (Put your evaluated best choice FIRST with `(Recommended)`):**
   - Option A: **`[Choice] (Recommended)`** — e.g. Targeted E2E / Supplement Cases / Skip.
   - Option B: Alternative choices.
   - Option C: Alternative choices.
   - Option D: **`Skip E2E & Proceed`** — Proceed with unit verification & commit.

---

## 4. Execution Rules

- If user selects **Targeted** or **Full E2E**: Detect project runner CLI (Playwright, Cypress, Pytest, etc.) and execute the exact test command via bash/shell, reporting results clearly.
- If user selects **Supplement E2E Cases**: Generate the new test spec adhering to project test frameworks, confirm with user, and then execute.
- If user selects **Skip**: Proceed with verification via lightweight tiers (unit tests, type-check, lint) and complete the task.
