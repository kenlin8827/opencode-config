/**
 * Smart Title Plugin — Unit Tests (no API dependency)
 *
 * Coverage:
 *   - JSONC comment stripping (line/block comments, URLs inside strings)
 *   - config parsing (defaults, overrides, malformed input fallback)
 *   - candidate chain resolution from opencode config (resolveTargets)
 *   - router endpoint normalization (with/without /v1, trailing slashes)
 *   - completion body parsing (plain JSON + SSE streams)
 *   - title cleaning (think tags, markdown/quote wrappers, truncation)
 *   - titleFormat placeholders ({title}, {cwd}, {cwdTip}, {cwdTip:N})
 *   - conversation turn building & context formatting (incl. size cap)
 *   - candidate fallback loop (generateWithFallback)
 *   - deterministic fallback (first user question as title, session model ref)
 *
 * Run: bun run tests/test-smart-title-unit.ts   (or: npx tsx tests/test-smart-title-unit.ts)
 */

import {
  stripJsonComments,
  parseConfig,
  resolveTargets,
  resolveEndpoint,
  parseCompletionBody,
  cleanTitle,
  stripWrappers,
  applyTitleFormat,
  buildTurns,
  formatContext,
  generateWithFallback,
  userQuestionTitle,
  sessionModelRef,
} from "../plugins/smart-title/smart-title"

let passed = 0
let failed = 0

function assert(cond: unknown, label: string) {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`  ✗ FAIL: ${label}`)
  }
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  assert(
    actual === expected,
    `${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`,
  )
}

// ── 1: JSONC comment stripping ─────────────────────────────────────────
console.log("\n== 1: stripJsonComments ==")
assertEq(
  stripJsonComments('{ "a": 1 } // trailing'),
  '{ "a": 1 } ',
  "line comment removed",
)
assertEq(
  stripJsonComments('{ /* block */ "a": 1 }'),
  '{  "a": 1 }',
  "block comment removed",
)
assertEq(
  stripJsonComments('{ "url": "https://x.dev/v1" }'),
  '{ "url": "https://x.dev/v1" }',
  "URL slashes inside strings preserved",
)
assertEq(
  stripJsonComments('{ "s": "a // not comment", "b": 2 }'),
  '{ "s": "a // not comment", "b": 2 }',
  "// inside string preserved",
)
assertEq(
  stripJsonComments('{ "esc": "quote \\" then // x" }'),
  '{ "esc": "quote \\" then // x" }',
  "escaped quote handled",
)

// ── 2: config parsing ──────────────────────────────────────────────────
console.log("\n== 2: parseConfig ==")
const defaults = parseConfig(null)
assertEq(defaults.enabled, true, "default enabled")
assertEq(defaults.model, "", "default model empty (flash-tier resolved at runtime)")
assertEq(defaults.titleFormat, "{title}", "default titleFormat")
assertEq(defaults.updateThreshold, 1, "default updateThreshold")

const custom = parseConfig(`{
  // comment
  "enabled": true,
  "model": "ds/deepseek-v4-flash",
  "updateThreshold": 3,
  "titleFormat": "[{cwdTip}] {title}"
}`)
assertEq(custom.model, "ds/deepseek-v4-flash", "model override")
assertEq(custom.updateThreshold, 3, "updateThreshold override")
assertEq(custom.titleFormat, "[{cwdTip}] {title}", "titleFormat override")

assertEq(parseConfig("{ not json").enabled, true, "malformed JSON → defaults")
assertEq(parseConfig('{"updateThreshold": 0}').updateThreshold, 1, "threshold < 1 rejected")
assertEq(parseConfig('{"model": ""}').model, "", "empty model stays empty")

// ── 2b: candidate chain resolution (resolveTargets) ──────────────────
console.log("\n== 2b: resolveTargets ==")
const ocConfig = {
  model: "llm-router/standard",
  agent: {
    explorer: { model: "llm-router/flash" },
  },
  provider: {
    "llm-router": {
      options: { baseURL: "https://router.example.cn/v1", apiKey: "sk-test" },
      models: {
        flash: { id: "flash" },
        standard: { id: "standard" },
        pro: { id: "pro" },
      },
    },
    anthropic: {},
  },
}
const t1 = resolveTargets(ocConfig, "")
assertEq(t1.length, 2, "flash tier + global model → 2 candidates")
assertEq(t1[0]?.model, "flash", "flash-tier agent model first")
assertEq(t1[0]?.baseUrl, "https://router.example.cn/v1", "provider baseURL resolved")
assertEq(t1[0]?.apiKey, "sk-test", "provider apiKey resolved")
assertEq(t1[1]?.model, "standard", "global model second")

const t2 = resolveTargets(ocConfig, "llm-router/standard")
assertEq(t2[0]?.model, "standard", "explicit override wins over flash tier")
assertEq(t2.length, 2, "global duplicate deduped")

const t3 = resolveTargets(ocConfig, "anthropic/claude")
assertEq(t3.some((t) => t.model === "claude"), false, "provider without baseURL skipped")
assertEq(t3[0]?.model, "flash", "chain continues after unusable override")

assertEq(
  resolveTargets({ agent: { explorer: { model: "llm-router/flash" } }, provider: {} }, "").length,
  0,
  "unknown provider → no candidates",
)
assertEq(resolveTargets({}, "").length, 0, "empty config → no candidates")
assertEq(
  resolveTargets(
    {
      agent: { explorer: { model: "llm-router/flash" } },
      provider: { "llm-router": { options: { baseURL: "{env:MISSING}", apiKey: "k" } } },
    },
    "",
  ).length,
  0,
  "unresolved {env:...} placeholder → no candidates",
)
const noExplorer = resolveTargets({ model: "llm-router/standard", provider: ocConfig.provider }, "")
assertEq(noExplorer[0]?.model, "standard", "falls back to global model when flash agent missing")

// Subscription-style flash tier (no baseURL) skipped, router global kept —
// mirrors the local machine where explorer is pinned to zhipuai.
const zhipuaiLike = resolveTargets(
  {
    model: "llm-router/standard",
    agent: { explorer: { model: "zhipuai-coding-plan/glm-5.2-highspeed" } },
    provider: ocConfig.provider,
  },
  "",
)
assertEq(zhipuaiLike.length, 1, "subscription flash tier skipped, global kept")
assertEq(zhipuaiLike[0]?.model, "standard", "usable global model survives")

// Session model enters the chain between flash tier and global model
const withSession = resolveTargets(ocConfig, "", "explorer", "llm-router/pro")
assertEq(withSession.map((t) => t.model).join(","), "flash,pro,standard", "session model slotted after flash tier")
const dupSession = resolveTargets(ocConfig, "", "explorer", "llm-router/flash")
assertEq(dupSession.map((t) => t.model).join(","), "flash,standard", "session model equal to flash tier deduped")

// Model "id" field remapping: when a provider defines models with a
// namespaced id (e.g. codex-router maps "gpt-5.6-luna" → "cx/gpt-5.6-luna"),
// that id must be sent to the router instead of the dictionary key.
// Without this, the router cannot dispatch and returns model_not_found.
const codexConfig = {
  model: "llm-router/standard",
  agent: {
    explorer: { model: "codex-router/gpt-5.6-luna" },
  },
  provider: {
    "codex-router": {
      options: { baseURL: "https://router.example.cn/v1", apiKey: "sk-cx" },
      models: {
        "gpt-5.6-luna": { id: "cx/gpt-5.6-luna" },
        "gpt-5.6-terra": { id: "cx/gpt-5.6-terra" },
      },
    },
    "llm-router": ocConfig.provider["llm-router"],
  },
}
const cxTargets = resolveTargets(codexConfig, "")
assertEq(cxTargets[0]?.model, "cx/gpt-5.6-luna", "codex-router model id remapped to cx/gpt-5.6-luna")
assertEq(cxTargets[1]?.model, "standard", "llm-router global model keeps plain id")

// Provider without model id field: fall back to the dictionary key.
const noIdConfig = {
  model: "llm-router/standard",
  agent: { explorer: { model: "llm-router/flash" } },
  provider: {
    "llm-router": {
      options: { baseURL: "https://router.example.cn/v1", apiKey: "sk-test" },
      models: { flash: { name: "Flash" } },  // no "id" field
    },
  },
}
const noIdTargets = resolveTargets(noIdConfig, "")
assertEq(noIdTargets[0]?.model, "flash", "missing model id field → fall back to dictionary key")

// ── 3: endpoint normalization ──────────────────────────────────────────
console.log("\n== 3: resolveEndpoint ==")
assertEq(
  resolveEndpoint("https://router.example.cn/v1"),
  "https://router.example.cn/v1/chat/completions",
  "baseURL with /v1",
)
assertEq(
  resolveEndpoint("https://router.example.cn"),
  "https://router.example.cn/v1/chat/completions",
  "baseURL without /v1",
)
assertEq(
  resolveEndpoint("https://router.example.cn/v1/"),
  "https://router.example.cn/v1/chat/completions",
  "trailing slash stripped",
)

// ── 4: completion body parsing ─────────────────────────────────────────
console.log("\n== 4: parseCompletionBody ==")
const plain = parseCompletionBody(
  JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "Session Title" } }] }),
)
assertEq(plain.text, "Session Title", "plain JSON response")
assertEq(plain.truncated, false, "finish_reason=stop not truncated")
const truncated = parseCompletionBody(
  JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "半截标题" } }] }),
)
assertEq(truncated.text, "半截标题", "truncated body keeps text")
assertEq(truncated.truncated, true, "finish_reason=length flagged")
const truncatedAlt = parseCompletionBody(
  JSON.stringify({ choices: [{ finish_reason: "max_tokens", message: { content: "优先与" } }] }),
)
assertEq(truncatedAlt.truncated, true, "finish_reason=max_tokens flagged (non-standard backend)")
const sse = [
  'data: {"choices":[{"delta":{"role":"assistant"}}]}',
  "",
  'data: {"choices":[{"delta":{"content":"Hello "}}]}',
  'data: {"choices":[{"delta":{"content":"World"},"finish_reason":"stop"}]}',
  "data: [DONE]",
].join("\n")
const sseParsed = parseCompletionBody(sse)
assertEq(sseParsed.text, "Hello World", "SSE stream accumulated")
assertEq(sseParsed.truncated, false, "SSE stop not truncated")
assertEq(parseCompletionBody("garbage").text, "", "garbage body → empty")

// ── 5: title cleaning ──────────────────────────────────────────────────
console.log("\n== 5: cleanTitle ==")
assertEq(cleanTitle("**Bold Title**"), "Bold Title", "markdown emphasis stripped")
assertEq(cleanTitle('"Quoted Title"'), "Quoted Title", "quotes stripped")
assertEq(cleanTitle("`code title`"), "code title", "backticks stripped")
assertEq(cleanTitle("# Heading Title"), "Heading Title", "heading marker stripped")
assertEq(
  cleanTitle("First Line\nSecond Line"),
  "First Line",
  "first non-empty line kept",
)
assertEq(
  cleanTitle("one\ntwo"),
  "one",
  "multiline collapsed",
)
assert(cleanTitle("x".repeat(150)).endsWith("..."), "long title truncated")
assertEq(cleanTitle(""), "", "empty stays empty")

// ── 6: titleFormat placeholders ────────────────────────────────────────
console.log("\n== 6: applyTitleFormat ==")
const winCwd = "D:\\OpenHub\\opencode-prime\\plugins"
assertEq(
  applyTitleFormat("{title}", "My Title", winCwd),
  "My Title",
  "{title} only",
)
assertEq(
  applyTitleFormat("[{cwdTip}] {title}", "Fix bug", winCwd),
  "[plugins] Fix bug",
  "{cwdTip} last segment (Windows path)",
)
assertEq(
  applyTitleFormat("{cwdTip:2}", "t", winCwd),
  "opencode-prime/plugins",
  "{cwdTip:2} two segments",
)
assertEq(
  applyTitleFormat("{cwd}", "t", "/home/user/proj"),
  "/home/user/proj",
  "{cwd} full path (posix)",
)
// Defensive guards: non-string format must not throw, returns title as-is
assertEq(applyTitleFormat(undefined as any, "My Title", "/path"), "My Title", "undefined format → title returned")
assertEq(applyTitleFormat(null as any, "My Title", "/path"), "My Title", "null format → title returned")
assertEq(applyTitleFormat("" as any, "My Title", "/path"), "My Title", "empty format → title returned")
assertEq(applyTitleFormat(123 as any, "My Title", "/path"), "My Title", "non-string format → title returned")
// Non-string title/cwd: String() coercion happens before replace; replace
// then converts undefined/null to "" per JS spec (replace with undefined → "")
assertEq(applyTitleFormat("{title}", 42 as any, "/path"), "42", "number title → stringified")
assertEq(applyTitleFormat("{cwd}", "t", 42 as any), "42", "number cwd → stringified")

// ── 7: turn building & context formatting ──────────────────────────────
console.log("\n== 7: buildTurns + formatContext ==")
const messages = [
  {
    info: { role: "user" },
    parts: [{ type: "text", text: "why is the plugin broken?" }],
  },
  {
    info: { role: "assistant" },
    parts: [{ type: "text", text: "first answer" }, { type: "tool", tool: "bash" }],
  },
  {
    info: { role: "assistant" },
    parts: [{ type: "text", text: "final answer" }],
  },
  {
    info: { role: "user" },
    parts: [{ type: "text", text: "fix it", synthetic: true }],
  },
]
const turns = buildTurns(messages as any)
assertEq(turns.length, 1, "synthetic-only user turn dropped (empty user text)")
assertEq(turns[0].user, "why is the plugin broken?", "real user text kept")
assertEq(turns[0].assistantFirst, "first answer", "first assistant text kept")
assertEq(turns[0].assistantLast, "final answer", "last assistant text kept")
assertEq(formatContext(turns).includes("User: why is the plugin broken?"), true, "context has user line")
assertEq(
  formatContext(turns).includes("Assistant (initial): first answer"),
  true,
  "context splits initial/final assistant",
)
// A second turn with real user text is kept alongside synthetic filtering
const twoTurns = buildTurns([
  { info: { role: "user" }, parts: [{ type: "text", text: "first" }] },
  { info: { role: "assistant" }, parts: [{ type: "text", text: "a1" }] },
  { info: { role: "user" }, parts: [{ type: "text", text: "second" }] },
] as any)
assertEq(twoTurns.length, 2, "two real turns kept")
assertEq(buildTurns([]).length, 0, "empty messages → no turns")
assertEq(buildTurns(null as any).length, 0, "null messages → no turns")

// Context size cap
const huge = buildTurns([
  { info: { role: "user" }, parts: [{ type: "text", text: "x".repeat(6000) }] },
] as any)
const capped = formatContext(huge)
assert(capped.length <= 4004, "context capped near 4000 chars")
assert(capped.endsWith("..."), "capped context ends with ellipsis")

// ── 8: candidate fallback loop (generateWithFallback) ─────────────────
console.log("\n== 8: generateWithFallback ==")
const chainTargets = [
  { baseUrl: "https://a/v1", apiKey: "k", model: "first" },
  { baseUrl: "https://b/v1", apiKey: "k", model: "second" },
]
const hitOrder: string[] = []
const okSecond = await generateWithFallback(
  chainTargets,
  { prompt: "p", context: "c" },
  async (t) => {
    hitOrder.push(t.model)
    if (t.model === "first") throw new Error("title response truncated")
    return "Good Title"
  },
)
assertEq(okSecond, "Good Title", "second candidate used after first fails")
assertEq(hitOrder.join(","), "first,second", "candidates tried in priority order")

const emptyThenOk = await generateWithFallback(
  chainTargets,
  { prompt: "p", context: "c" },
  async (t) => (t.model === "first" ? "" : "Fallback Title"),
)
assertEq(emptyThenOk, "Fallback Title", "empty title rejects candidate, chain continues")

const allFail = await generateWithFallback(
  chainTargets,
  { prompt: "p", context: "c" },
  async () => {
    throw new Error("boom")
  },
)
assertEq(allFail, null, "all candidates fail → null (built-in titling applies)")
assertEq(
  await generateWithFallback([], { prompt: "p", context: "c" }, async () => "x"),
  null,
  "no candidates → null",
)

// ── 9: deterministic fallback (userQuestionTitle + sessionModelRef) ───
console.log("\n== 9: deterministic fallback ==")
const qTurns = buildTurns([
  { info: { role: "user" }, parts: [{ type: "text", text: "为什么设置标题的插件感觉无效呢？" }] },
  { info: { role: "assistant" }, parts: [{ type: "text", text: "answer" }] },
] as any)
assertEq(userQuestionTitle(qTurns), "为什么设置标题的插件感觉无效呢？", "short question used as-is")
assertEq(userQuestionTitle([]), "", "no turns → empty")
const longQ = buildTurns([
  {
    info: { role: "user" },
    parts: [{ type: "text", text: "why is the smart title plugin not working at all in my opencode setup today" }],
  },
] as any)
const longTitle = userQuestionTitle(longQ)
assert(longTitle.length <= 62, "long question truncated near 60 chars")
assert(longTitle.endsWith("…"), "truncated question ends with ellipsis")
assert(userQuestionTitle(longQ).includes("why is the smart title"), "truncation keeps the beginning")

assertEq(
  sessionModelRef([
    { info: { role: "user" } },
    { info: { role: "assistant", providerID: "llm-router", modelID: "pro" } },
  ] as any),
  "llm-router/pro",
  "session model ref from assistant message",
)
assertEq(
  sessionModelRef([
    { info: { role: "assistant", providerID: "a", modelID: "old" } },
    { info: { role: "assistant", providerID: "b", modelID: "new" } },
  ] as any),
  "b/new",
  "latest assistant message wins",
)
assertEq(sessionModelRef([{ info: { role: "user" } }] as any), "", "no assistant message → empty")

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
