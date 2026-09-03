# Prudent Development (`/prud-dev`)

Prudent-dev (prud from "prudent") front-loads **FMEA-style failure-mode enumeration before any code exists**, then lets that risk register drive planning, implementation, and verification. It is one of the [Five Dev Flows](dev-loops.md) — the risk-first philosophy: where other flows focus on reviewing code after it's written, prud-dev manufactures the review ammunition *before* the first line is written.

Grounded in established practice: FMEA (IEC 60812 — design-stage failure-mode enumeration, RPN ranking), ISTQB risk-based testing (Risk Exposure = Likelihood × Impact), and Boehm's risk-driven spiral model (each iteration opens with risk analysis).

---

## Workflow

```
1. Clarify   @advisor Socratic loop — batch questions, contradiction check,
             max 3 rounds; leftovers become explicit assumptions
2. Enumerate @advisor surface model → failure modes bound to surface elements
             → SEV×PROB scoring → portability self-check → top-N ranked
3. Archive   docs/risk/<topic>.md — Tier A (mandatory) / Tier B (observation)
4. Confirm   user gate — or auto-advisor full proxy-approve (FACTUAL, ≥ 8)
5. Plan      @architect — every Tier A risk maps to a named design decision
6. Implement @<lang>-dev (domain-routed) — Tier A mitigations are hard requirements;
             tests at the test-scope.md tier before done
7. Verify    LOOP (default 5 rounds): @qa derives register tests from Tier A
             acceptance criteria (round 1) → orchestrator runs the suite (bug-fix
             floor tier) → @code-review register audit + a SEPARATE out-of-register
             red-team dispatch (never sees the register) → domain-routed fixes
             → re-run → re-verify
8. Report    acceptance report — 4-way classification, non-exhaustive declaration
```

## The risk register

Stored at `docs/risk/<topic>.md` (same convention as `docs/plan/`). Every risk is scored:

**Risk Exposure = SEV × PROB** (each 1–5)

| Tier | Rule | Obligations |
|---|---|---|
| **A — mandatory** | score ≥ 16, or SEV 5 × PROB ≥ 3 | Named mitigation, acceptance criterion, plan mapping, line-by-line verification. `uncovered` Tier A blocks the loop. |
| **B — observation** | everything else | Archived; spot-checked; never blocking. |

Tier A acceptance criteria do not stay prose: round 1 of the verify loop dispatches `@qa` to materialize each criterion into an executable regression test. The strongest evidence a risk can carry is a test asserting its failure mode does not happen — failing tests block the loop exactly like uncovered Tier A risks, and passing register-derived tests are the top evidence tier in the audit.

### Anti-generic mechanisms

Raw "list the bugs this feature might have" prompts produce filler. The enumeration dispatch forces:

1. **Surface model first** — data objects & invariants, states & transitions, external interfaces, actors & permissions, timing/concurrency. No risk may exist without an anchor.
2. **Binding** — each risk names the surface element it attacks with a concrete trigger. "Race condition" is invalid; "refund callback arrives before local transaction commit → PAID→REFUNDING reads inconsistent status" is valid.
3. **Portability self-check** — any risk that survives replacing the feature name word-for-word is generic filler; struck.

### Honesty about blind spots

The register's recall is unknowable in advance, so the verify loop runs a second, fully separate `@code-review` dispatch that attacks the diff **without ever seeing the register** — anchoring would defeat it — and every finding it makes outside the register is written back tagged `missed-by-enumeration`. The final report classifies every risk as **Mitigated / Protected by design / Residual accepted / Found outside register** — Tier A residuals require explicit user sign-off — and always carries the declaration: *the register is not exhaustive.*

## Selection guide

| Factor | Pick |
|---|---|
| Late bug is expensive (payment, auth, migration, irreversible ops) | `/prud-dev` |
| Requirement is ambiguous, no development wanted yet | `/grill-me` |
| Post-hoc dual review suffices | `/review-dev` |
| Large autonomous multi-phase objective | `/ultra-dev` |
| Small edits, docs, throwaway scripts | `/quick-dev` |

## Usage

```bash
# Mission-critical feature — full default register (top 50)
/prud-dev Implement refund API with idempotency and partial refunds

# Focused register for a narrower change
/prud-dev Add webhook retry with exponential backoff --top=20

# Deep verification loop for a sprawling diff
/prud-dev Migrate user table to partitioned schema --top=80 --max-rounds=8
```

Arguments: `--top=N` (enumeration cap, default 50, range 10–200), `--max-rounds=N` (verify-fix loop, default 5, range 1–99).
