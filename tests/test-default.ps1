# Test: default build agent (no custom prompt)
# Baseline test — the built-in build agent may NOT follow Output Protocol
# because `instructions` may only inject into agents with custom `prompt` fields.
# Expected: response may be plain text without Protocol format.

Set-Location "$PSScriptRoot\.."
opencode run --model llm-router/default "What is 1+1? Answer briefly."
