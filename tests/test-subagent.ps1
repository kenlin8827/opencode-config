# Test: subagent dispatched by orchestrator
# Verifies that `instructions` also injects Output Protocol into subagent context.
# Expected: tech-writer subagent output follows Protocol format.

# Load env vars from User-level
$env:LLM_ROUTER_BASE_URL = [System.Environment]::GetEnvironmentVariable("LLM_ROUTER_BASE_URL", "User")
$env:LLM_ROUTER_API_KEY = [System.Environment]::GetEnvironmentVariable("LLM_ROUTER_API_KEY", "User")

Set-Location "$PSScriptRoot\.."
opencode run --agent orchestrator --model llm-router/default "Use @tech-writer to answer: what is 1+1? Keep it very brief."
