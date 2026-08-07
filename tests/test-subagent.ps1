# Test: subagent dispatched by orchestrator
# Verifies that `instructions` also injects Output Protocol into subagent context.
# Expected: tech-writer subagent output follows Protocol format.

Set-Location "$PSScriptRoot\.."
opencode run --agent orchestrator --model llm-router/default "Use @tech-writer to answer: what is 1+1? Keep it very brief."
