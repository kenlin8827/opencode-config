import {
  allocateModelKey,
  catalogModels,
  catalogCapabilities,
  deriveModelKey,
  humanizeModelName,
  importedModelDef,
} from "../plugins/tui/provider-wizard"

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

section("catalog capabilities conservatively enable image input")

const catalog = [
  { id: "gpt-4o", capabilities: { input: ["text", "image"], output: ["text"] } },
  { id: "text-only", capabilities: { input: ["text"], output: ["text"] } },
]

assert(
  JSON.stringify(catalogCapabilities("gateway/gpt-4o", catalog)) === JSON.stringify({ input: ["text", "image"], output: ["text"] }),
  "namespaced remote ID matches a catalog model by bare ID",
)
assert(catalogCapabilities("text-only", catalog) === undefined, "text-only catalog model does not claim attachment support")
assert(catalogCapabilities("unknown", catalog) === undefined, "unknown model remains capability-unknown")
assert(
  catalogCapabilities("gateway/gpt-4o", [
    { id: "other/gpt-4o", capabilities: { input: ["text", "image"] } },
    { id: "gateway/gpt-4o", capabilities: { input: ["text"] } },
  ]) === undefined,
  "exact text-only ID takes precedence over an earlier bare-ID vision match",
)
assert(
  catalogCapabilities("gateway/gpt-4o", [
    { id: "one/gpt-4o", capabilities: { input: ["text", "image"] } },
    { id: "two/gpt-4o", capabilities: { input: ["text"] } },
  ]) === undefined,
  "ambiguous bare IDs remain capability-unknown",
)
assert(
  catalogModels({ data: { location: {}, data: catalog } }).length === 2,
  "SDK nested model-list response is decoded",
)
assert(catalogModels({ data: catalog }).length === 0, "non-SDK flat catalog response is rejected")

const normalizedCatalog = catalogModels({
  data: {
    location: {},
    data: [null, { id: 42 }, { id: "vision", capabilities: { input: ["text", "image", false], output: ["text", 1] } }],
  },
})
assert(normalizedCatalog.length === 1 && normalizedCatalog[0]?.id === "vision", "malformed catalog entries are ignored")
assert(
  JSON.stringify(catalogCapabilities("vision", normalizedCatalog)) === JSON.stringify({ input: ["text", "image"], output: ["text"] }),
  "malformed input and output modalities are removed before import",
)

const vision = importedModelDef({ id: "gateway/gpt-4o", name: "Gateway GPT-4o" }, "gpt-4o", catalog)
assert(vision.attachment === true, "catalog-proven image model enables attachments")
assert(JSON.stringify(vision.modalities) === JSON.stringify({ input: ["text", "image"], output: ["text"] }), "catalog modalities are preserved")

const unknown = importedModelDef({ id: "unknown", name: "Unknown" }, "unknown", catalog)
assert(unknown.attachment === undefined && unknown.modalities === undefined, "unknown model stays conservatively text-only")

console.log(`\nPassed: ${passed}, Failed: ${failed}`)
if (failed > 0) process.exit(1)
