# Test: build (primary orchestrator agent with custom prompt)
# Verifies that `instructions` in opencode.jsonc injects Output Protocol into the build agent's context.
# Expected: response contains "**Conclusion**:" and "> Counter:"

# Load env vars from User-level (set via [System.Environment]::SetEnvironmentVariable)
$env:LLM_ROUTER_BASE_URL = [System.Environment]::GetEnvironmentVariable("LLM_ROUTER_BASE_URL", "User")
$env:LLM_ROUTER_API_KEY = [System.Environment]::GetEnvironmentVariable("LLM_ROUTER_API_KEY", "User")

Set-Location "$PSScriptRoot\.."
opencode run --agent build --model llm-router/default "What is 1+1? Answer briefly."
