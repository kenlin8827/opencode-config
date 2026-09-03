# Five Dev Flows

Five Dev Flows represent the flagship multi-agent workflow system in OpenCode's production engineering configuration.

Each flow embodies a **development philosophy** — a distinct trade-off between speed, depth, autonomy, and risk posture. Choose based on the nature of your task, not a linear "better/worse" hierarchy.

---

## The Five Flows at a Glance

| Flow | Emoji | Philosophy | When to Use |
|---|---|---|---|
| `/quick-dev` | ⚡ | **Zero-friction** — code now, review never | Throwaway scripts, UI tweaks, quick prototypes |
| `/fast-dev` | 🚀 | **Agile loop** — fast code + single flagship review | 80% of daily tasks: CRUD, components, single-module refactoring |
| `/prud-dev` | 🛡️ | **Risk-first** — FMEA before code, risk register drives everything | Safety-critical: payments, auth, medical, aviation, anything a bug could harm |
| `/deep-dev` | 🧠 | **Deep consensus** — dual flagship review + arbitration | 20% mission-critical: distributed transactions, full-stack, security-sensitive |
| `/ultra-dev` | 🛸 | **Autonomous** — objective in, phases out, zero interaction | Large-scale systems spanning multiple domains and phases |

---

## Flow Details

### `/quick-dev` — Zero-Review Fast Track

```
User → @build → @fast-coder (Flash) → Done
```

- **Review**: None
- **Rounds**: 1 (instant)
- **Model**: Flash/Lite tier for maximum throughput
- **Alias**: `/flash-dev`

### `/fast-dev` — Agile Single-Review Loop

```
User → @build → @fast-coder (Flash) → @code-review → fix loop → Approve
```

- **Review**: 1 reviewer (`@code-review`)
- **Rounds**: Max 10 (typically 2–3)
- **Exit**: Single reviewer approves

### `/prud-dev` — FMEA Risk-First Development

```
User → Socratic Clarification → FMEA Risk Register → Risk-Driven Plan → Implementation → Register-Audited Verification
```

- **Core**: Pre-implementation risk enumeration (SEV × PROB ranked, top-N)
- **Review**: Configurable (0, 1, or 2 reviewers — risk register drives the bar)
- **Exit**: All top-N risk mitigations verified in register
- **See**: [Prudent Development](prud-dev.md) for full protocol

### `/deep-dev` — Dual-Review Deep Consensus

```
User → @build → @fast-coder → @architect (Review A) + @code-review (Review B) → @advisor arbitration → Consensus
```

- **Review**: 2 reviewers (`@architect` + `@code-review`)
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
                                                         Yes                         No
                                                         /                            \
                                                   🧠 /deep-dev               Is it a throwaway
                                                   (deep consensus)          script or quick fix?
                                                                              /              \
                                                                            Yes                 No
                                                                            /                    \
                                                                      ⚡ /quick-dev         🚀 /fast-dev
                                                                      (zero-friction)      (agile loop)
```

---

## Comparison Matrix

| Dimension | ⚡ `/quick-dev` | 🚀 `/fast-dev` | 🛡️ `/prud-dev` | 🧠 `/deep-dev` | 🛸 `/ultra-dev` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Philosophy** | Zero friction | Agile loop | Risk-first FMEA | Deep consensus | Full autonomy |
| **Use Cases** | Throwaway scripts, UI tweaks, quick prototyping | 80% of daily tasks: CRUD, components, single-module | Safety-critical: payments, auth, medical, aviation | 20% mission-critical: distributed TX, full-stack, security | Large-scale systems spanning multiple domains |
| **Host Agent** | `@build` | `@build` | `@build` | `@build` | `@build` |
| **Coder Agent** | `@fast-coder` | `@fast-coder` | `@fast-coder` or `@<lang>-dev` | `@<lang>-dev` (domain-routed) | `@<lang>-dev` per phase |
| **Review Team** | None | 1 (`@code-review`) | Configurable (risk-driven) | 2 (`@architect` + `@code-review`) | 2 per phase |
| **Pre-Implementation** | None | None | FMEA Risk Register | None | `@explore` survey |
| **Arbitration** | None | Direct fixes | Risk-register-driven | `@advisor` (Safety-First) | `@advisor` per phase |
| **Convergence** | 1 round | Max 10 rounds | Register audit | Max 10 rounds | Max 10 rounds/phase |
| **Autonomy** | None | Low | Low | Low | High |

---

## Dynamic Domain Persona Injection

All flows that involve coding (`/quick-dev`, `/fast-dev`, `/prud-dev`, `/deep-dev`, `/ultra-dev`) leverage **Dynamic Domain Persona Injection**:

1. **Stateless Container**: `@fast-coder` is bound to the fast Flash/Lite model tier, maintaining maximum throughput;
2. **On-the-Fly Persona Enchantment**: Orchestrator `@build` detects the technical stack and injects specialized domain guidelines into the prompt header:
   - **Frontend**: Strict TS (no `any`), atomic Tailwind, no wasteful re-renders, A11y standards;
   - **Go**: Explicit error handling, context propagation, goroutine leak prevention, zero panics in hot paths;
   - **Python**: Pydantic/Type Hints, `asyncio` concurrency, `with` resource cleanup, PEP8;
   - **DBA**: Leftmost prefix index matching, non-blocking migrations, parameterized queries;
3. **Parallel Multirole Execution**: Subagents operate in isolated sessions, allowing `@build` to dispatch multiple `@fast-coder` instances in parallel (e.g. Frontend + Backend concurrently).

---

## Usage & Arguments

### `/quick-dev` (Zero-Review)

```bash
/quick-dev Add copy button to code blocks with toast feedback
/flash-dev Fix off-by-one error in pagination query  # alias
```

### `/fast-dev` (Single-Review)

```bash
/fast-dev Implement user avatar upload and crop component
/fast-dev Optimize order pagination query --max-rounds=5
```

### `/prud-dev` (Risk-First)

```bash
/prud-dev Implement payment settlement with idempotency guarantees --top=5
/prud-dev Add OAuth2 PKCE flow for mobile app --top=3 --max-rounds=8
```

### `/deep-dev` (Dual-Review)

```bash
/deep-dev Refactor settlement engine with distributed transaction compensation
/deep-dev Implement QR-code login: session table, polling API, dialog --max-rounds=10
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
| **Safety-First Arbitration** | `/deep-dev`, `/ultra-dev`, `/prud-dev` (when dual-review enabled) |
| **10-Round Fuse** | All flows with review (per phase for `/ultra-dev`) |
| **Consecutive Fuse Stop** (≥ 3) | `/ultra-dev` |
| **Max-Phases Cap** (default 6, max 20) | `/ultra-dev` |
| **Context Compaction** | `/ultra-dev` (every 2 phases) |
| **Per-Phase Diff Isolation** | `/ultra-dev` (one git commit per phase) |
| **Risk Register Audit** | `/prud-dev` (all top-N mitigations verified) |
