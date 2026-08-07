# Test: orchestrator (primary agent with custom prompt)
# Verifies that `instructions` in opencode.json injects Output Protocol into the orchestrator's context.
# Expected: response contains "**Conclusion**:" and "> Counter:"

Set-Location "$PSScriptRoot\.."
opencode run --agent orchestrator --model llm-router/default "What is 1+1? Answer briefly."
