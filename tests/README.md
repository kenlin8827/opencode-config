# Multi-Agent System Tests

Tests for verifying that `instructions` in `opencode.jsonc` correctly injects shared protocols (Output Protocol + Ponytail) into all agent contexts.

## Prerequisites

Ensure these environment variables are set in your system (PowerShell profile or session):

```powershell
$env:LLM_ROUTER_BASE_URL = "https://router.agent.byteswim.cn/v1"
$env:LLM_ROUTER_API_KEY = "<your-api-key>"
```

## Tests

| Script | What it tests |
|--------|---------------|
| `test-all.ps1` | Runner — structural checks + all prompt tests |
| `test-decisions.ps1` | Decision strategy structural checks (invoked by test-all) |
| `test-profiles.ps1` | profiles/ stress test: every profile applied to a fresh template copy, refs asserted (no API calls) |
| `test-build.ps1` | Primary build agent follows Output Protocol |
| `test-plan.ps1` | Primary plan agent follows Output Protocol |
| `test-subagent.ps1` | Subagent dispatched by build agent follows Output Protocol |
| `test-default.ps1` | Default build agent (no custom prompt) — baseline |

## Run

```powershell
# Structural checks + prompt tests (requires API)
powershell -ExecutionPolicy Bypass -File tests/test-all.ps1

# Include ponytail behavioral tests (lite: build + suggest)
powershell -ExecutionPolicy Bypass -File tests/test-all.ps1 -IncludePrompts

# Or run individually
powershell -ExecutionPolicy Bypass -File tests/test-build.ps1
```

## What test-all.ps1 checks

### Structural (no API calls)
- `opencode.jsonc` instructions array contains both protocols
- `ponytail.md` content: frontmatter, advisory checklist, lazier alternative, rules, off switch
- `ponytail.md` is language-agnostic (no Java/Node-specific content)
- `ponytail.md` has no Output/Intensity sections (orthogonality with output-protocol)
- `ponytail.md` limits scope to coding tasks
- java/python/node agents mention ecosystem libraries
- Security rules intact in all coding agents
- researcher.md has no ponytail rules (non-coding isolation)
- All 20 agent files exist (including explorer.md)
- `profiles/*.json`: each profile applies cleanly to a fresh template
  copy (agent refs, root model, untouched tiers); every profile must cover
  all five tiers

### Behavioral (opt-in via `-IncludePrompts`)
- Prompt with speculative need → agent builds it, suggests lazier alternative
- Prompt with existing utility → agent reuses it
- Non-coding prompt → agent ignores ponytail

## Expected results

- `test-build.ps1`: Output contains `**Conclusion**: ...` — Protocol is applied.
- `test-plan.ps1`: Output contains `**Conclusion**: ...` and suggests switching to Build mode.
- `test-subagent.ps1`: Subagent output follows Protocol format (dispatched via build agent).
- `test-default.ps1`: Default agent may NOT follow Protocol (no custom prompt, instructions may not inject).
- Ponytail behavioral: Agent challenges speculative scope, reuses existing code, references ladder.
