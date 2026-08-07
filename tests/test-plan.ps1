# Test: plan orchestrator (primary agent with custom prompt)
# Verifies that `instructions` in opencode.json injects Output Protocol into the plan agent's context.
# Expected: response contains "**Conclusion**:" and suggests switching to Build mode.

# Load env vars from User-level
$env:LLM_ROUTER_BASE_URL = [System.Environment]::GetEnvironmentVariable("LLM_ROUTER_BASE_URL", "User")
$env:LLM_ROUTER_API_KEY = [System.Environment]::GetEnvironmentVariable("LLM_ROUTER_API_KEY", "User")

Set-Location "$PSScriptRoot\.."
opencode run --agent plan --model llm-router/default "What is 1+1? Answer briefly."
