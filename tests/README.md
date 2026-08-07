# Multi-Agent System Tests

Tests for verifying that the `instructions` field in `opencode.json` correctly injects the shared Output Protocol into all agent contexts.

## Prerequisites

Ensure these environment variables are set in your system (PowerShell profile or session):

```powershell
$env:LLM_ROUTER_BASE_URL = "https://router.agent.byteswim.cn/v1"
$env:LLM_ROUTER_API_KEY = "<your-api-key>"
```

## Tests

| Script | What it tests |
|--------|---------------|
| `test-orchestrator.ps1` | Primary agent (custom prompt) follows Output Protocol |
| `test-subagent.ps1` | Subagent dispatched by orchestrator follows Output Protocol |
| `test-default.ps1` | Default build agent (no custom prompt) — baseline, may not follow Protocol |

## Run

```powershell
# Run all tests
powershell -ExecutionPolicy Bypass -File tests/test-all.ps1

# Or run individually
powershell -ExecutionPolicy Bypass -File tests/test-orchestrator.ps1
```

## Expected results

- `test-orchestrator.ps1`: Output contains `**Conclusion**: ...` and `> Counter: ...` — Protocol is applied.
- `test-subagent.ps1`: Subagent output follows Protocol format (dispatched via orchestrator).
- `test-default.ps1`: Default agent may NOT follow Protocol (no custom prompt, instructions may not inject).
