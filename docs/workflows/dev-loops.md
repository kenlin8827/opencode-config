# Five Dev Flows

Five Dev Flows represent the flagship multi-agent workflow system in OpenCode's production engineering configuration.

Each flow embodies a **development philosophy** — a distinct trade-off between speed, depth, autonomy, and risk posture. Choose based on the nature of your task, not a linear "better/worse" hierarchy.

---

## The Five Flows at a Glance

| Flow | Emoji | Philosophy | When to Use |
|---|---|---|---|
| `/quick-dev` | ⚡ | **Zero-friction** — flash-tier coder, code now, review optional | Throwaway scripts, UI tweaks, quick prototypes |
| `/plan-dev` | 📋 | **Plan-first** — clarify, plan, then implement (review optional) | Daily default: features where you want to approve the plan before coding |
| `/review-dev` | 🧠 | **Deep consensus** — dual flagship review + arbitration | 20% mission-critical: distributed transactions, full-stack, security-sensitive |
| `/prud-dev` | 🛡️ | **Risk-first** — FMEA before code, risk register drives everything | Safety-critical: payments, auth, medical, aviation, anything a bug could harm |
| `/ultra-dev` | 🛸 | **Autonomous** — objective in, phases out, zero interaction | Large-scale systems spanning multiple domains and phases |

---

## Flow Details

### `/quick-dev` — Zero-Review Fast Track

```
User → @build → @fast-coder (Flash) → Done
```

- **Review**: None by default; `--review` triggers single audit
- **Rounds**: 1 (instant)
- **Model**: Flash/Lite tier for maximum throughput
- **Not for**: Zero-ceremony at full quality — just ask directly (`lite` → `@code`); no workflow needed
- **Alias**: `/flash-dev`

### `/plan-dev` — Plan-First Development

```
User → @build → @advisor (clarify) → @architect (plan) → confirm → @<lang>-dev (implement) → optional @code-review → Done
```

- **Phases**: Clarification → Plan → Confirm → Implement → [Optional Review]
- **Review**: None by default; `--review` adds single `@code-review` audit (max 5 rounds)
- **Exit**: Plan confirmed + implementation delivered (review passed if `--review`)

### `/prud-dev` — FMEA Risk-First Development

```
User → Socratic Clarification → FMEA Risk Register → Risk-Driven Plan → Implementation → Register-Audited Verification
```

- **Core**: Pre-implementation risk enumeration (SEV × PROB ranked, top-N)
- **Review**: Configurable (0, 1, or 2 reviewers — risk register drives the bar)
- **Exit**: All top-N risk mitigations verified in register
- **See**: [Prudent Development](prud-dev.md) for full protocol

### `/review-dev` — Dual-Review Deep Consensus

```
User → @build → @<lang>-dev → @architect (Review A) + @code-review (Review B) → @advisor arbitration → Consensus
```

- **Review**: 2 reviewers (`@architect` + `@code-review`)
- **Coder**: Domain-routed (`@<lang>-dev`)
- **Arbitration**: `@advisor` resolves disagreements under Safety-First principles
- **Rounds**: Max 10 (typically 3–5)
- **Exit**: Dual-reviewer consensus

### `/ultra-dev` — Autonomous Multi-Phase Execution

```
User → Objective → @build decomposes → Phase 0: @explore → Loop[Phase 1..N: code + dual review] → Final verify
```

- **Review**: 2 reviewers per phase
- **Autonomy**: High — user gives objective, orchestrator drives all phases
- **Phases**: Default 6 (3–6 recommended; compaction extends to 8–10)
- **Stop**: Consecutive phase fuses ≥ 3, files > 100, external dependency unavailable
- **Resume**: `--resume` from `.opencode/ultra-dev-state.md`

---

## Selection Guide

```
                    Is it a large-scale objective
                    spanning multiple domains?
                   /                          \
                 Yes                           No
                 /                              \
           🛸 /ultra-dev               Could a bug cause harm
           (autonomous)                to people or business?
                                     /                        \
                                   Yes                           No
                                   /                              \
                            🛡️ /prud-dev                  Is it mission-critical
                            (risk-first)                   (distributed TX, full-stack)?
                                                           /                      \
                                                         Yes                                                         No
                                                         /                                                          \
                                                   🧠 /review-dev                                           Is plan approval
                                                   (dual-review)                                           desired before coding?
                                                                                                           /              \
                                                                                                           Yes                No
                                                                                                           /                    \
                                                                                                     📋 /plan-dev          ⚡ /quick-dev
                                                                                                     (plan-first)         (zero-friction)
```

---

## Comparison Matrix

| Dimension | ⚡ `/quick-dev` | 📋 `/plan-dev` | 🧠 `/review-dev` | 🛡️ `/prud-dev` | 🛸 `/ultra-dev` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Philosophy** | Zero friction | Plan-first | Deep consensus | Risk-first FMEA | Full autonomy |
| **Use Cases** | Throwaway scripts, UI tweaks, quick prototyping | Daily default: features where plan approval matters | 20% mission-critical: distributed TX, full-stack, security | Safety-critical: payments, auth, medical, aviation | Large-scale systems spanning multiple domains |
| **Host Agent** | `@build` | `@build` | `@build` | `@build` | `@build` |
| **Coder Agent** | `@fast-coder` | `@<lang>-dev` (domain-routed) | `@<lang>-dev` (domain-routed) | `@<lang>-dev` (domain-routed) | `@<lang>-dev` per phase |
| **Review Team** | None (optional `--review`) | None (optional `--review`) | 2 (`@architect` + `@code-review`) | Configurable (risk-driven) | 2 per phase |
| **Pre-Implementation** | None | Socratic clarification + plan | None | FMEA Risk Register | `@explore` survey |
| **Arbitration** | None | Plan-confirmation gate | `@advisor` (Safety-First) | Risk-register-driven | `@advisor` per phase |
| **Convergence** | 1 round | 1 round (+ max 5 if `--review`) | Max 10 rounds | Register audit | Max 10 rounds/phase |
| **Autonomy** | None | Low (plan gate) | Low | Low | High |

---

## Dynamic Domain Persona Injection

All flows that involve coding (`/quick-dev`, `/plan-dev`, `/review-dev`, `/prud-dev`, `/ultra-dev`) leverage **Dynamic Domain Persona Injection**:

1. **Stateless Container**: `@fast-coder` is bound to the fast Flash/Lite model tier, maintaining maximum throughput (used by `/quick-dev`);
2. **On-the-Fly Persona Enchantment**: Orchestrator `@build` detects the technical stack and injects specialized domain guidelines into the prompt header:
   - **Frontend**: Strict TS (no `any`), atomic Tailwind, no wasteful re-renders, A11y standards;
   - **Go**: Explicit error handling, context propagation, goroutine leak prevention, zero panics in hot paths;
   - **Python**: Pydantic/Type Hints, `asyncio` concurrency, `with` resource cleanup, PEP8;
   - **DBA**: Leftmost prefix index matching, non-blocking migrations, parameterized queries;
3. **Parallel Multirole Execution**: Subagents operate in isolated sessions, allowing `@build` to dispatch multiple domain specialists in parallel (e.g. Frontend + Backend concurrently).

---

## Usage & Arguments

### `/quick-dev` (Zero-Review, Optional Review)

```bash
/quick-dev Add copy button to code blocks with toast feedback
/flash-dev Fix off-by-one error in pagination query  # alias
/quick-dev Add dark mode toggle --review  # with single audit
```

### `/plan-dev` (Plan-First, Optional Review)

```bash
/plan-dev Implement user avatar upload and crop component
/plan-dev Optimize order pagination query --review  # plan + single-review audit
/plan-dev Add payment webhook handler --review --max-rounds=5
```

### `/prud-dev` (Risk-First)

```bash
/prud-dev Implement payment settlement with idempotency guarantees --top=5
/prud-dev Add OAuth2 PKCE flow for mobile app --top=3 --max-rounds=8
```

### `/review-dev` (Dual-Review)

```bash
/review-dev Refactor settlement engine with distributed transaction compensation
/review-dev Implement QR-code login: session table, polling API, dialog --max-rounds=10
```

### `/ultra-dev` (Autonomous Multi-Phase)

```bash
/ultra-dev Implement a complete user authentication system with OAuth2, session management, and RBAC
/ultra-dev Build real-time notification service: WebSocket, queue, SDK, dashboard --max-rounds=8 --max-phases=10
/ultra-dev --resume
```

---

## Guardrails & Anti-Lock Mechanisms

| Guardrail | Applies To |
|---|---|
| **Safety-First Arbitration** | `/review-dev`, `/ultra-dev`, `/prud-dev` (when dual-review enabled) |
| **Plan Confirmation Gate** | `/plan-dev` |
| **10-Round Fuse** | All flows with review (per phase for `/ultra-dev`) |
| **Consecutive Fuse Stop** (≥ 3) | `/ultra-dev` |
| **Max-Phases Cap** (default 6, max 20) | `/ultra-dev` |
| **Context Compaction** | `/ultra-dev` (every 2 phases) |
| **Per-Phase Diff Isolation** | `/ultra-dev` (one git commit per phase) |
| **Risk Register Audit** | `/prud-dev` (all top-N mitigations verified) |
