# Test: default build agent (no custom prompt)
# Baseline test — the built-in build agent may NOT follow Output Protocol
# because `instructions` may only inject into agents with custom `prompt` fields.
# Expected: response may be plain text without Protocol format.

# Load env vars from User-level
$env:LLM_ROUTER_BASE_URL = [System.Environment]::GetEnvironmentVariable("LLM_ROUTER_BASE_URL", "User")
$env:LLM_ROUTER_API_KEY = [System.Environment]::GetEnvironmentVariable("LLM_ROUTER_API_KEY", "User")

Set-Location "$PSScriptRoot\.."
opencode run --model llm-router/default "What is 1+1? Answer briefly."
