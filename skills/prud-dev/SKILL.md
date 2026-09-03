---
name: prud-dev
description: Prudent-dev (prud-dev) - FMEA-front-loaded development - Socratic clarification plus a pre-implementation risk register (SEVxPROB ranked, top-N) that drives planning, implementation, and register-audited verification. Load ONLY when the user invokes /prud-dev.
---

# Prudent-Dev Protocol (FMEA-Front-Loaded Development)

You are now executing the **prud-dev** workflow — risk enumeration happens BEFORE any code exists, then the register drives every downstream phase. Follow this protocol until the acceptance report is delivered.

**Core principle**: enumerate failure modes while they are still cheap to eliminate (FMEA at the requirements stage), score them by risk exposure, and let that register — not improvisation — steer the plan, the implementation, and the verification loop.

## Arguments & Options

- **Positional args**: the raw requirement or task description (e.g. `/prud-dev Implement refund API with idempotency and partial refunds`).
- `--top=N` (optional): maximum number of enumerated risks. **Default: 50**, range 10–200. Non-numeric/missing → 50. Clamp to [10, 200].
- `--max-rounds=N` (optional): maximum verification-fix iterations (Step 7). **Default: 5**, range 1–99. Non-numeric/missing → 5. Clamp to [1, 99].

## When to use (and when NOT to)

**Use this command** when the cost of a late bug is high: payment/settlement, auth/permission changes, data migrations, irreversible operations, cross-module features, unattended autonomous runs.

**Do NOT use this command** for:
- Small edits, style changes, docs, throwaway scripts → `/quick-dev`.
- Routine features where post-hoc review suffices → `/fast-dev` or `/deep-dev`.
- You only want requirement clarification, no development → `/grill-me`.

## Graph

```
[*] → 1. Clarify: @advisor Socratic loop (batch questions → user answers → contradiction check)
       → CLEAN or 3 rounds exhausted (unresolved items become explicit assumptions)
  → 2. Enumerate: @advisor surface model → failure modes bound to surface elements
       → SEV×PROB scoring → portability self-check → top-N ranked
  → 3. Archive: write docs/risk/<topic>.md (Tier A mandatory / Tier B observation)
  → 4. Confirm: user approves register (auto-advisor full may proxy-approve FACTUAL)
  → 5. Plan: @architect — every Tier A risk mapped to a named design decision
  → 6. Implement: @<lang>-dev (domain-routed) — Tier A mitigations are hard requirements
       + tests at the test-scope.md tier before reporting done
  → 7. VERIFY LOOP (max --max-rounds, default 5):
       a. Tests: round 1 — @qa derives regression tests from Tier A acceptance
          criteria; every round — orchestrator runs the suite (bug-fix floor
          tier per test-scope.md), failing test = blocking finding
       b. @code-review x2 (parallel): register audit (Tier A line-by-line, Tier B
          spot-check; passing register tests count as evidence) + out-of-register
          red team in a SEPARATE dispatch that never sees the register
       c. Uncovered Tier A / failing tests / P0/P1 / out-of-register findings
          → domain-routed fix (out-of-register findings written back tagged
          missed-by-enumeration)
       d. Re-run tests + re-verify → loop
       → all Tier A covered or protected AND tests green AND no P0/P1 → ✅ Cleared
       → round = max → ⚠️ Max rounds → report unresolved blockers
       → blocking ambiguity → 🔴 Escalate to user
  → 8. Report: acceptance report — 4-way risk classification + non-exhaustive
       declaration + verification evidence (verification-honesty.md)
```

## Phase tracking

At the start of every reply, output a one-line phase marker (compaction recovery):

```
[prud-dev] Phase: <Clarify|Enumerate|Archive|Confirm|Plan|Implement|Verify|Report> | Round: <N/max> | Register: <count> risks (<a> Tier A)
```

If compacted and unsure of the phase, recover from the last marker; if none found, restart from Clarify.

## Role assignment

| Role | Agent | Core mission |
| :--- | :--- | :--- |
| **Orchestrator** | `@build` | Phase sequencing, register write/archive, confirmation gate, fix routing, acceptance report. Never writes production code itself. |
| **Clarifier + Enumerator** | `@advisor` | Socratic clarification; then surface-model-driven risk enumeration with SEV×PROB scoring. |
| **Planner** | `@architect` | Implementation plan; every Tier A risk mapped to a named design decision. |
| **Coder** | `@<lang>-dev` (domain-routed) | Implementation with Tier A mitigations; targeted fixes in the verify loop. |
| **Verifier** | `@code-review` | Register audit + out-of-register red team on the diff. |
| **Test engineer** | `@qa` | Derives regression tests from Tier A acceptance criteria (round 1) — mechanical evidence for the register audit. |

## Operational protocol

### Step 1 — Clarification loop (Socratic, max 3 rounds)

Dispatch `@advisor` with the raw requirement (template A below). The advisor returns: a requirement summary, a numbered list of Socratic questions (each tagged FACTUAL/PREFERENCE with a recommended answer and confidence), and any contradictions it already sees.

Present the questions to the user **in one batch** via the `question` tool (recommended option first). Auto-advisor compatibility:
- **full mode**: questions the advisor tagged FACTUAL with confidence ≥ 8 are auto-adopted without asking the user (note this in your reply); PREFERENCE and lower-confidence questions go to the user. Session cap 10 auto-adopts, then degrade to lite behavior.
- **lite/off**: all questions reach the user.

After the user answers, dispatch `@advisor` once more with the Q&A to detect contradictions:
- **CONTRADICTIONS** → re-ask only the contradiction points (round + 1, max 3) → repeat.
- **CLEAN** → advisor outputs the consolidated requirement statement; proceed to Step 2.
- **3 rounds exhausted** with unresolved ambiguity → proceed anyway; every unresolved item becomes an **explicit assumption** recorded in the register header. Do not stall the workflow on clarification — the enumeration step will surface the risk consequences anyway.

### Step 2 — Risk enumeration (surface model first, one dispatch)

Dispatch `@advisor` with the consolidated requirement + assumptions (template B). The dispatch forces a two-stage enumeration that structurally excludes generic filler risks:

1. **Surface model** — the advisor first enumerates the feature's concrete surface: data objects and invariants, states and transitions, external interfaces/IO, actors and permission boundaries, timing/concurrency dimensions. This is the anchor; no risk may exist without one.
2. **Failure modes bound to surface elements** — each risk MUST name the surface element it attacks (trigger condition + failure mode). "Null pointer" is invalid; "refund callback arrives before local transaction commit → state machine reads inconsistent order status (State: PAID→REFUNDING transition)" is valid.
3. **Scoring** — Risk Exposure = SEV × PROB, each 1–5:
   - SEV: 1 trivial → 5 catastrophic (data loss/corruption, security breach, financial damage)
   - PROB: 1 rare → 5 likely (concurrency involved, no codebase precedent, external dependency)
4. **Portability self-check** — strike any risk that would survive replacing the feature name with another feature's name word-for-word (it is generic filler, already covered by coding standards).
5. **Output** — top-N risks sorted by score (N = `--top`, default 50). Every risk with score ≥ 16 (or SEV = 5 with PROB ≥ 3) additionally carries: mitigation direction + acceptance criterion ("how to verify this failure did NOT happen").

### Step 3 — Archive the risk register

The orchestrator writes `docs/risk/<topic>.md` (topic = kebab-case slug of the requirement; same convention as `docs/plan/<topic>.md`). File format below. Tiers:
- **Tier A (mandatory)**: score ≥ 16, or SEV = 5 with PROB ≥ 3. Full obligations: named mitigation, acceptance criterion, plan mapping, line-by-line verification.
- **Tier B (observation)**: everything else. Archived; spot-checked during verification; never blocking.

### Step 4 — Confirmation gate

Present the register summary (Tier A list + Tier B count) via the `question` tool: **Confirm** / **Revise** (user edits priorities, adds/removes risks → update register, re-confirm) / **Stop**.

Auto-advisor full mode: dispatch `@advisor` (neutral stance) to review the register for completeness and ranking sanity; if it classifies the question FACTUAL with confidence ≥ 8 → proxy-approve and note it in the reply. PREFERENCE or < 8 → back to the user. Never proxy-approve in lite/off.

### Step 5 — Implementation plan

Dispatch `@architect` (template C) with the register. Hard requirement: **every Tier A risk maps to a named design decision** in the plan (a guard, a constraint, a transaction boundary, a fallback). Tier A risks with no plan mapping are a plan defect — send the plan back once; if still unmapped, escalate to the user with the orphaned risks.

Information flow discipline: the plan receives **Tier A in full + Tier B as a one-line digest** — never the whole register verbatim.

### Step 6 — Implementation

Dispatch the domain specialist per `build.md` trigger routing (`@node-dev`, `@python-dev`, `@dba`, `@frontend-dev`, …; multi-domain → sequential dispatches in dependency order, like `/deep-dev` staging). The dispatch carries: the plan, **Tier A risks with their mitigations and acceptance criteria** (hard requirements — no fake mocks, no skipped edge cases), and the Tier B digest. The dev agent runs tests at the tier defined by `instructions/test-scope.md` (change-size based, as in `/deep-dev`) before reporting completion. Zero-loss: forward the consolidated requirement verbatim, never your paraphrase.

### Step 7 — Verification loop (max `--max-rounds`, default 5)

Each round:

**a. Test evidence** — round 1 only, if Tier A is non-empty: dispatch `@qa` (template F) to derive regression tests from the Tier A acceptance criteria. Every round: the orchestrator runs the test suite itself at the bug-fix floor tier (`instructions/test-scope.md`) — a failing test is a blocking finding with the same standing as an `uncovered` Tier A risk. Passing register-derived tests are mechanical evidence for the audit below.

**b. Audit + red team (two parallel dispatches)** — dispatch `@code-review` (template D) with the change scope, the register, and current test results for the **register audit**: Tier A line-by-line — verdict per risk: `covered` (mitigation implemented; a passing register-derived test is the strongest evidence), `protected` (design makes the failure unreachable — evidence required), or `uncovered`. Tier B: spot-check a representative sample. Any `uncovered` Tier A = blocking finding. Concurrently dispatch a second `@code-review` (template E) with the change scope ONLY — the **out-of-register red team** attacks the code for P0/P1 issues without ever knowing the register; every finding it makes outside the register gets tagged `missed-by-enumeration`, the empirical estimate of register blind spots. The two dispatches are independent and MAY run in parallel; both pass scope references (files/commits), not inline diffs — `@code-review` fetches diffs itself via git.

**c. Quick triage** — read the code at each cited `file:line` to confirm the finding is real and reachable (guards, upstream checks, dead code). Evident false positives are dismissed with reasons and carried forward in the next dispatch so they are not re-reported. Genuinely inconclusive findings go to the user, not to a fix. **Failing tests get triaged too**: test defect (wrong assertion, environment/timing dependency, flaky) vs product defect. Test defects are fixed in the test itself (one dispatch to the test's owner — `@qa` or the domain agent — never counted as a product fix); product defects proceed to step d. A test that fails twice with unchanged product code is flaky — downgrade its criterion to a manual-verification note in the register and stop letting it burn rounds.

**d. Fix** — dispatch each verified finding to the domain agent per `build.md` routing (finding's file language decides the agent, not the repo's primary language); a failing test routes to the agent owning the tested file. Batching rule: same file + same agent → one dispatch; different agents → parallel dispatches allowed. **Write every `missed-by-enumeration` finding back into `docs/risk/<topic>.md`** under a `## Found outside the register` section with its verdict.

**e. Re-verify** → next round, carrying forward: prior fixes applied, dismissed false positives with reasons, round counter. Tests re-run via step a.

**Exit conditions (exactly one):**
| Exit | Condition | Next |
|---|---|---|
| ✅ Cleared | All Tier A `covered`/`protected` AND test suite green AND no P0/P1 remaining | Step 8 |
| ⚠️ Max rounds | Rounds exhausted, findings remain | Step 8 with unresolved blockers |
| 🔴 Escalated | Inconclusive finding or blocking ambiguity | User decides with evidence |

### Step 8 — Acceptance report

The orchestrator verifies final state itself (build/test/lint per `instructions/test-scope.md`, evidence per `instructions/verification-honesty.md`) and delivers the report (format below). Every risk in the register is classified exactly one way:

| Classification | Meaning |
|---|---|
| **Mitigated** | Acceptance criterion verified — mitigation is implemented and evidenced. |
| **Protected by design** | Failure mode is structurally unreachable; evidence (guard/constraint) cited. |
| **Residual accepted** | Known risk consciously left open. **Tier A residuals require explicit user sign-off** — present them via the `question` tool before closing; Tier B residuals are listed only. |
| **Found outside register** | Discovered during verification (`missed-by-enumeration`) — fixed or classified as above. |

The report MUST include the declaration: *the register is not exhaustive — unenumerated risks remain possible.* Never state "safe" or "all risks eliminated".

## Risk register file format

```markdown
# Risk Register: <topic>

---
date: <YYYY-MM-DD>
requirement: <one-line summary>
status: <draft | confirmed | verified | closed>
assumptions: <explicit assumptions from unresolved clarification items, or "none">
---

## Surface model
- Data objects: <list with invariants>
- States & transitions: <list>
- External interfaces: <list>
- Actors & permissions: <list>
- Timing & concurrency: <list>

## Tier A — mandatory (score >= 16, or SEV 5 x PROB >= 3)
| # | Risk (bound to surface element) | SEV | PROB | Score | Mitigation | Acceptance criterion |
|---|---|---|---|---|---|---|

## Tier B — observation
| # | Risk (bound to surface element) | SEV | PROB | Score | Note |
|---|---|---|---|---|---|

## Found outside the register (written back during verification)
| # | Finding | Round | Verdict | Disposition |
|---|---|---|---|---|
```

Downstream propagation is lossy by design: plan gets Tier A full + Tier B digest; implementation gets plan + Tier A; `@qa` gets Tier A acceptance criteria; the audit dispatch gets Tier A line-by-line + Tier B list + test results; the red-team dispatch gets the change scope only — NEVER the register (anchoring would defeat its purpose).

## Dispatch templates

All templates are subagent tool invocations — never print them as plain text.

**A — Clarify:**
```
@advisor
Grill this requirement: <raw requirement>
Always consider: edge cases, failure modes, error handling, concurrency, permission boundaries —
even if the description seems complete.
Return: (1) requirement summary, (2) numbered Socratic questions — each tagged FACTUAL/PREFERENCE
with a recommended answer and confidence 1-10, (3) contradictions you already spot.
```

**B — Enumerate:**
```
@advisor
Enumerate the risk register for: <consolidated requirement + explicit assumptions>
Method (mandatory order):
1. Surface model first: data objects & invariants, states & transitions, external interfaces,
   actors & permission boundaries, timing/concurrency dimensions.
2. Failure modes MUST bind to a named surface element with a concrete trigger condition.
   Generic risks without an anchor (bare "null pointer", "race condition") are invalid.
3. Score each: SEV 1-5 (trivial → catastrophic), PROB 1-5 (rare → likely). Exposure = SEV × PROB.
4. Portability check: strike any risk that survives replacing the feature name word-for-word.
5. Output top <N> sorted by score. For every risk with score >= 16 (or SEV 5 × PROB >= 3) also give:
   mitigation direction + acceptance criterion (how to verify the failure did NOT happen).
```

**C — Plan:**
```
@architect
Requirement: <consolidated requirement>
Risk register (Tier A full, Tier B digest): <from docs/risk/<topic>.md>
Task: Produce an implementation plan where EVERY Tier A risk maps to a named design decision
(guard, constraint, transaction boundary, or fallback) at a specific step.
Expected output: ordered steps with agent assignments; a Tier A → design-decision mapping table;
anything you cannot mitigate within the plan flagged explicitly.
```

**D — Register audit:**
```
@code-review
Register audit: verify the changes against the risk register below.
  Tier A — verdict per risk: covered | protected (evidence) | uncovered. Tier B — spot-check.
  A passing register-derived test is the strongest "covered" evidence.
Register: <Tier A table + Tier B list>
Test results: <current suite outcome — failing tests are blocking; passing register-derived tests are evidence>
Scope: <files/commits/diff — fetch via git yourself>
Expected output: per-risk verdict table + register-related findings with file:line and fix suggestions.
```

**E — Out-of-register red team (separate dispatch — NEVER include the register):**
```
@code-review
Attack the current changes for P0/P1 issues: correctness, security, data integrity —
no checklist, no prior assumptions. You have NOT seen any risk analysis for this change;
your job is to find what such an analysis would miss.
Scope: <same files/commits/diff as the audit dispatch — fetch via git yourself>
Expected output: severity-ranked findings with file:line and concrete fix suggestions.
```

**F — Register tests:**
```
@qa
Tier A acceptance criteria (from docs/risk/<topic>.md): <list — risk + criterion>
Task: Derive regression tests from these acceptance criteria — each criterion becomes
at least one executable test asserting the failure mode does NOT happen. First check
the tests the implementation already added: skip criteria with existing coverage and
note which. Follow the project's test framework and conventions.
Tier: bug-fix floor per instructions/test-scope.md; escalate only per its promotion rules.
Expected output: new/extended test files + a criterion → test mapping (file:line).
Do not weaken or delete existing tests.
```

## Agent failure handling

1. **Retry once** per agent per phase with the same dispatch + failure note. Never more.
2. `@advisor` fails in Step 1 → present your own clarification questions to the user directly. Fails in Step 2 → escalate: enumeration is the workflow's foundation; do not improvise the register yourself.
3. `@architect` fails → orchestrator drafts the plan mapping itself, marked "plan not architect-reviewed" in the report.
4. `@code-review` audit dispatch fails in the verify loop → the round cannot proceed; escalate with partial results. Red-team dispatch fails → retry once; if it fails again, proceed audit-only and mark "red team unavailable — blind-spot coverage degraded" in the report.
5. `@qa` fails → retry once; if it fails again, proceed with the code-review-only audit and mark "register tests not generated" in the report.
6. Persistent failures → stop and report; never skip a phase silently.

## Hard rules

- **Dispatch means tool call** — every `@advisor` / `@architect` / `@<lang>-dev` / `@code-review` reference is a subagent invocation; printing it as text stalls the protocol.
- **No code before the register is confirmed** — Steps 5–6 may not start before the Step 4 gate passes.
- **Surface binding** — a risk not anchored to a named surface element is invalid and must be struck.
- **Tier A is blocking** — an `uncovered` Tier A risk fails verification regardless of code quality elsewhere. Tier B never blocks.
- **Red-team isolation** — the out-of-register dispatch never receives the register, not even a summary; merging it into the audit dispatch contaminates the blind-spot estimate. Scope references only.
- **Criteria become tests** — every Tier A acceptance criterion gets an executable test where feasible; an untestable criterion carries an explicit reason in the register (manual-verification note). Projects with no test framework: all criteria degrade to manual-verification notes — the audit relies on `@code-review` evidence alone.
- **Test noise must not burn rounds** — a failing test is triaged (test defect vs product defect) before any dispatch; flaky tests (fail twice, product code unchanged) are downgraded to manual-verification notes, never looped on.
- **Write back missed-by-enumeration findings** — the register is a living artifact; blind spots found in Step 7 are recorded, not discarded.
- **Tier A residuals need user sign-off** — never close a Tier A risk as "residual accepted" on your own authority.
- **Honest reporting** — final classifications follow the four-way table and the non-exhaustive declaration; no "safe" claims (verification-honesty.md).
- **Escalate when stuck** — ambiguous requirement forks, unmitigatable Tier A risks, or fix loops that regenerate the same finding → user decision, with evidence.

## Output format

**Per-verify-round output (concise):**

```
### Verify Round N
- Tests: <X passed, Y failed> (bug-fix floor tier; <k> register-derived from Tier A criteria)
- Register audit: <a>/<total> Tier A covered, <b> protected, <c> uncovered (blocking)
- Red team: <n> out-of-register findings (missed-by-enumeration)
- Fixes dispatched: <agent → what>
- Dismissed as false positive: <list with reasons>
- Remaining blockers: <yes/no>
```

**Final acceptance report:**

```
## Prudent-Dev Acceptance Report

**Verdict: <Cleared | Max rounds — blockers remain | Escalated>**
Register: docs/risk/<topic>.md — <total> risks (<a> Tier A, <b> Tier B), <m> found outside register

### Risk classification
| Tier | Mitigated | Protected by design | Residual accepted | Unresolved |
|---|---|---|---|---|
| A | <n> | <n> | <n> (user sign-off: yes/no) | <n> |
| B | <n> | <n> | <n> | <n> |

### Requirements & scope
<consolidated requirement one-liner; files changed list>

### Verification
- ✅/❌/⚠️ Build: <result>
- ✅/❌/⚠️ Tests: <X passed, Y failed> (tier per test-scope.md; <k> register-derived from Tier A criteria)
- ✅/❌/⚠️ Lint: <result>

### Declaration
The risk register is not exhaustive — unenumerated risks remain possible.

### Recommended next steps
- <regression tests / follow-ups / re-run with adjusted --top>
```
