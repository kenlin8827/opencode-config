import { allocateModelKey, deriveModelKey, humanizeModelName } from "../plugins/tui/provider-wizard"

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✅ ${msg}`)
    passed++
  } else {
    console.error(`  ❌ ${msg}`)
    failed++
  }
}

function section(title: string): void {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${"═".repeat(60)}`)
}

section("deriveModelKey trims namespace prefixes")

assert(deriveModelKey("cx/gpt-5.6-luna") === "gpt-5.6-luna", "slash suffix becomes bare model key")
assert(deriveModelKey("qwen-large") === "qwen-large", "ids without slash stay intact")
assert(deriveModelKey("foo/") === "foo", "trailing slash is dropped")

section("humanizeModelName shortens display label")

assert(humanizeModelName("cx/gpt-5.6-luna", "fallback") === "gpt-5.6-luna", "prefix removed from name")
assert(humanizeModelName("GPT 5.6 Luna", "fallback") === "GPT 5.6 Luna", "plain names untouched")
assert(humanizeModelName(undefined, "gpt-5.6-luna") === "gpt-5.6-luna", "fallback used when remote name missing")

section("allocateModelKey enforces uniqueness")

const models: Record<string, { id: string }> = {}

let result = allocateModelKey(models, "gpt-5.6-luna", "cx/gpt-5.6-luna")
assert(!result.duplicate && result.key === "gpt-5.6-luna", "first insert keeps short key")
models[result.key] = { id: "cx/gpt-5.6-luna" }

result = allocateModelKey(models, "gpt-5.6-luna", "cx/gpt-5.6-luna")
assert(result.duplicate, "same remote id detected as duplicate")

result = allocateModelKey(models, "gpt-5.6-luna", "cx/gpt-5.6-terra")
assert(!result.duplicate && result.key === "gpt-5.6-luna-2", "conflicting id receives numeric suffix")

console.log(`\nPassed: ${passed}, Failed: ${failed}`)
if (failed > 0) process.exit(1)
