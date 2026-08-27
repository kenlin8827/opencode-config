# Deep-Dev Protocol (Mission-Critical Dual-Review Loop)

You are now executing the **deep-dev** workflow — a mission-critical, double-review, consensus-driven development loop. Follow this protocol until all criteria are satisfied or the maximum rounds are reached.

## Core Design Principle: Zero-Loss Raw Passthrough

> [!IMPORTANT]
> **Orchestrator Hard Rule**: The orchestrator (`@build`) is STRICTLY PROHIBITED from decomposing, filtering, abbreviating, rewriting, or second-guessing the user's requirements!
> You MUST forward the user's exact, unadulterated requirements (word-for-word, including all nuances and edge cases) directly to the Coder and both Reviewers.

```mermaid
stateDiagram-v2
    [*] --> RawDispatch: 1. User enters raw requirement
    RawDispatch --> DomainCoding: 2. Zero-loss passthrough dispatch to @<lang>-dev
    DomainCoding --> DualReview: 3. Submit Git Diff + Raw requirement to Dual Reviewers
    
    state "Dual Concurrent Review (Evidence-Driven Audit)" as DualReview {
        state "Reviewer A (@architect)" as RevA
        state "Reviewer B (@code-review)" as RevB
        [*] --> RevA: Requirement traceability & contract lens
        [*] --> RevB: Defensive code quality & resiliency lens
        RevA --> Verdicts
        RevB --> Verdicts
    }
    
    DualReview --> ConsensusGate: 4. Compare dual review verdicts
    
    state "Consensus & Arbitration Gate" as ConsensusGate {
        state "Agreement Check" as AgreementCheck
        AgreementCheck --> DoubleApprove: Both Approve
        AgreementCheck --> DoubleReject: Both Reject / Request Changes
        AgreementCheck --> Disagreement: Disagreement (Conflict / 1 Pass 1 Fail)
        Disagreement --> AdvisorArbitration: @advisor conducts debate arbitration
        AdvisorArbitration --> DoubleReject: Form unified consolidated checklist
    }
    
    DoubleReject --> RoundCheck: 5. Check round counter
    RoundCheck --> DomainCoding: Round < max (default 10) ➡️ Targeted fixes (Round + 1)
    RoundCheck --> MaxFused: Round >= max ➡️ Max rounds fused
    
    DoubleApprove --> Deliver: 6. Run verification & deliver final output
    MaxFused --> Deliver: Output unresolved conflict & blocker report
    Deliver --> [*]
```

---

## Arguments & Options

- **Positional args**: The raw user requirements or task description (e.g. `/deep-dev Refactor settlement engine with distributed transaction compensation`).
- `--max-rounds=N` (optional): Maximum iteration rounds. **Default: 10**, range: 1–99.

---

## Role Assignment

| Role | Agent | Core Mission |
| :--- | :--- | :--- |
| **Orchestrator** | `@build` | Zero-loss raw requirement broadcasting, state machine loop counting, consensus & arbitration coordination. |
| **Coder** | `@<lang>-dev` (domain-routed) | Reads raw user requirements and produces professional implementation across all touched layers; executes targeted fixes in subsequent rounds. |
| **Reviewer A** | `@architect` | **"Requirement Traceability & Contract Lens"**: Deeply analyzes the raw intent, verifying complete spec coverage, architectural cohesion, and contract integrity. |
| **Reviewer B** | `@code-review` | **"Defensive Quality & Resiliency Lens"**: Audits boundary conditions, concurrency safety, error recovery, and strict typing. |
| **Arbitrator** | `@advisor` | **"Consensus & Debate Arbitration"**: Weighs conflicting review arguments under the Safety-First principle to finalize a single actionable punchlist. |

---

## Operational Loop

### Step 1 — Zero-Loss Raw Dispatch to Domain Coder
Dispatch to the appropriate domain specialist (`@<lang>-dev`) by invoking `task(agent="<lang>-dev", prompt="...")` with the exact, unaltered user requirements. Route based on the primary language/domain of the task (e.g. `@node-dev` for TypeScript/Node.js, `@java-dev` for Java, `@python-dev` for Python, `@go-dev` for Go, `@rust-dev` for Rust, `@frontend-dev` for frontend). If the task spans multiple domains, dispatch to the primary one and note the secondary for follow-up.

```markdown
### Raw User Requirements (Unaltered):
<Insert the user's exact prompt word-for-word without any modification>

### Execution Directive:
You are the full-stack developer. Read and 100% implement every requirement, implicit constraint, and boundary case requested by the user above across database, backend, and frontend layers. Follow existing codebase conventions. No fake mocks, no empty TODOs, and no skipped edge cases.
```

### Step 2 — Domain Coding
1. The domain specialist (`@<lang>-dev`) reads the codebase and raw requirements, writing/modifying all necessary source files.
2. Performs basic sanity checks (syntax, typing, imports).
3. Run tests at the tier defined by `instructions/test-scope.md` based on change size. If a subset is run, state which subset and why (Rule 7 — no selective evidence).

### Step 3 — Dual Review (Evidence-Driven Audit)
Both reviewers share the **same evidence-driven baseline** (audit both requirements & code via Execute → Observe → Match), but operate through **different specialized lenses** to eliminate blind spots:

#### Reviewer A Directive (`@architect` — Architecture & Contract Lens):
```markdown
### Raw User Requirements (Unaltered):
<Insert the user's exact prompt word-for-word without any modification>

### Orchestrator Directive to Reviewer A (Architecture & Full-Loop Integrity):
You are the Chief Enterprise Architect guarding requirement traceability and contractual integrity.
Your verdict MUST be grounded in verifiable evidence — not subjective judgment.

Audit the diff using the Execute → Observe → Match method:
1. **Requirement Traceability**: Walk through every requirement in the user's raw prompt. For each, locate the exact code that implements it. If a requirement has no corresponding code, that is a finding — cite the requirement and state "no implementation found".
2. **Anti-Slop & Contract Defense**: Hunt for scope cuts, fake mocks, empty TODOs, or happy-path-only logic. Ensure cross-module DTOs and API contracts fit. Each finding must cite `file:line` + what was expected vs. what was found.
3. **Verdict by Evidence**: Your verdict MUST follow this rule:
   - `APPROVE` only when every requirement is traceable to code AND no architectural defect is found.
   - `REQUEST_CHANGES` when any requirement is unimplemented OR any architectural defect exists.
   - Do NOT reject based on style preference or speculation. Do NOT approve with "should work" reasoning.
4. **Actionable Output**: Every finding MUST include: `file:line` + root cause + concrete corrected code snippet.
```

#### Reviewer B Directive (`@code-review` — Defensive Engineering & Resiliency Lens):
```markdown
### Raw User Requirements (Unaltered):
<Insert the user's exact prompt word-for-word without any modification>

### Orchestrator Directive to Reviewer B (Defensive Code Quality & Resiliency):
You are the Chief Quality & Security Judge guarding software reliability and defensive engineering.
Your verdict MUST be grounded in verifiable evidence — not subjective judgment or optimism.

Audit the code changes from the ground up using the Execute → Observe → Match method:
1. **Defensive Code Audit**: Inspect null/undefined safety, error recovery, resource deallocation, and strict typing (zero arbitrary `any`). For each suspected issue, cite `file:line` and explain the failure mode concretely.
2. **Extreme Stress & Concurrency**: Hunt for race conditions, thread safety issues, boundary overflows, and unhandled async rejections. Each finding must cite `file:line` + root cause.
3. **Verdict by Evidence**: Your verdict MUST follow this rule:
   - `APPROVE` only when no concrete defect is found.
   - `REQUEST_CHANGES` when any concrete defect exists.
   - Do NOT reject based on style preference or speculation. Do NOT approve with "should work" reasoning.
4. **Actionable Findings**: Every issue MUST pinpoint exact `file:line` + root cause + concrete corrected code snippet.
```

### Step 4 — Consensus & Arbitration Gate
Compare the verdicts from Reviewer A and Reviewer B:

1. **Both APPROVE** ➡️ Proceed to Step 6 (Delivery).
2. **Both REQUEST_CHANGES** ➡️ Merge both issue lists into a unified, non-redundant checklist ➡️ Step 5.
3. **Disagreement (One Approves, One Rejects, or Conflict in Recommendations)**:
   - Dispatch the conflicting points, raw user requirements, and both reports to `@advisor`:
     > *"Reviewer A returned [Verdict A], Reviewer B returned [Verdict B]. Arbitrate between their findings based on the user's raw prompt and technical evidence."*
   - **Safety-First Principle**: When in doubt regarding security, correctness, or data integrity, always favor the stricter requirement.
   - Advisor outputs the final consolidated **Actionable Fix List**.

### Step 5 — Iteration Loop
- Check current round against `--max-rounds` (default 10).
  - If `Round < Max`: Increment counter (`Round = Round + 1`), pass the consolidated checklist to the domain specialist (`@<lang>-dev`) to fix, then return to Step 3.

  **Fix dispatch template**:
  ```markdown
  ### Consolidated Review Checklist (Round <N>):
  <insert the merged reviewer/advisor checklist with file:line references>

  ### Fix Directive:
  Fix every issue listed above. Do NOT introduce new issues. Do NOT refactor unrelated code. Address each finding at the exact file:line cited. After fixing, the diff should contain ONLY fixes for these issues — no scope creep.
  ```

  - If `Round >= Max`: Halt the loop. Generate an **Unresolved Conflict & Blockers Report** with exact points of divergence for user decision.

### Step 6 — Delivery
- Output final verification results using ✅/❌/⚠️ labels per `instructions/verification-honesty.md` (✅ = executed + passed, ❌ = executed + failed, ⚠️ = not run + reason). List actual commands executed.
- Present summary of files changed, requirements verified, and dual-review consensus sign-off.
