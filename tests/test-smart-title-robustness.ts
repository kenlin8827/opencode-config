/**
 * Smart Title Plugin — Robustness Edge-Case Tests
 *
 * Tests every exported function with null / undefined / wrong-type inputs
 * to ensure no crash can escape to the opencode server process.
 *
 * Run: bun run tests/test-smart-title-robustness.ts
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
  userQuestionTitle,
  sessionModelRef,
} from "../plugins/smart-title/smart-title"

let passed = 0
let failed = 0

function assertNoThrow(label: string, fn: () => void) {
  try {
    fn()
    passed++
  } catch (e) {
    failed++
    console.error(`  ✗ FAIL: ${label} — ${(e as Error).message}`)
  }
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++
  } else {
    failed++
    console.error(`  ✗ FAIL: ${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`)
  }
}

// ── 1: stripJsonComments — non-string inputs ────────────────────────────
console.log("\n== 1: stripJsonComments robustness ==")
assertNoThrow("stripJsonComments(null)", () => stripJsonComments(null as any))
assertNoThrow("stripJsonComments(undefined)", () => stripJsonComments(undefined as any))
assertNoThrow("stripJsonComments(123)", () => stripJsonComments(123 as any))
assertNoThrow("stripJsonComments({})", () => stripJsonComments({} as any))
assertNoThrow("stripJsonComments(unterminated string)", () => stripJsonComments('{ "a": "unterminated'))
assertNoThrow("stripJsonComments(unterminated block comment)", () => stripJsonComments("/* never closed"))
assertNoThrow("stripJsonComments(only comment)", () => stripJsonComments("// just a comment"))

// ── 2: parseConfig — edge cases ─────────────────────────────────────────
console.log("\n== 2: parseConfig robustness ==")
assertEq(parseConfig(null).enabled, true, "null → defaults")
assertEq(parseConfig("").enabled, true, "empty → defaults")
assertEq(parseConfig("null").enabled, true, "JSON null → defaults")
assertEq(parseConfig("[]").enabled, true, "JSON array → defaults")
assertEq(parseConfig("42").enabled, true, "JSON number → defaults")
assertEq(parseConfig('"string"').enabled, true, "JSON string → defaults")
assertEq(parseConfig('{"enabled": "yes"}').enabled, true, "non-boolean enabled → default")
assertEq(parseConfig('{"updateThreshold": -5}').updateThreshold, 1, "negative threshold → default")
assertEq(parseConfig('{"updateThreshold": 0.5}').updateThreshold, 1, "fractional threshold → floored to 1")

// ── 3: resolveTargets — null/undefined config ───────────────────────────
console.log("\n== 3: resolveTargets robustness ==")
assertEq(resolveTargets(null, "").length, 0, "null config → no targets")
assertEq(resolveTargets(undefined, "").length, 0, "undefined config → no targets")
assertEq(resolveTargets("", "").length, 0, "string config → no targets")
assertEq(resolveTargets(42, "").length, 0, "number config → no targets")
assertEq(resolveTargets({}, "").length, 0, "empty config → no targets")
assertEq(resolveTargets({ provider: null }, "").length, 0, "null provider → no targets")
assertEq(resolveTargets({ provider: { a: null } }, "a/flash").length, 0, "null provider entry → no targets")
assertEq(resolveTargets({ provider: { a: {} } }, "a/flash").length, 0, "provider without options → no targets")
assertEq(resolveTargets({ provider: { a: { options: null } } }, "a/flash").length, 0, "null options → no targets")
assertEq(resolveTargets({ provider: { a: { options: {} } } }, "a/flash").length, 0, "empty options → no targets")

// ── 4: resolveEndpoint — edge cases ─────────────────────────────────────
console.log("\n== 4: resolveEndpoint robustness ==")
assertNoThrow("resolveEndpoint(null)", () => resolveEndpoint(null as any))
assertNoThrow("resolveEndpoint(undefined)", () => resolveEndpoint(undefined as any))
assertNoThrow("resolveEndpoint(123)", () => resolveEndpoint(123 as any))
assertNoThrow("resolveEndpoint('')", () => resolveEndpoint(""))
assertNoThrow("resolveEndpoint('not a url')", () => resolveEndpoint("not a url"))

// ── 5: parseCompletionBody — edge cases ─────────────────────────────────
console.log("\n== 5: parseCompletionBody robustness ==")
assertNoThrow("parseCompletionBody(null)", () => parseCompletionBody(null as any))
assertNoThrow("parseCompletionBody(undefined)", () => parseCompletionBody(undefined as any))
assertNoThrow("parseCompletionBody(123)", () => parseCompletionBody(123 as any))
assertEq(parseCompletionBody("").text, "", "empty body → empty text")
assertEq(parseCompletionBody("{}").text, "", "empty object → empty text")
assertEq(parseCompletionBody('{"choices":[]}').text, "", "no choices → empty text")
assertEq(parseCompletionBody('{"choices":[{}]}').text, "", "empty choice → empty text")

// ── 6: cleanTitle — non-string inputs ───────────────────────────────────
console.log("\n== 6: cleanTitle robustness ==")
assertNoThrow("cleanTitle(null)", () => cleanTitle(null as any))
assertNoThrow("cleanTitle(undefined)", () => cleanTitle(undefined as any))
assertNoThrow("cleanTitle(123)", () => cleanTitle(123 as any))
assertNoThrow("cleanTitle({})", () => cleanTitle({} as any))
assertEq(cleanTitle(""), "", "empty → empty")
assertEq(cleanTitle("   "), "", "whitespace only → empty")

// ── 7: stripWrappers — non-string inputs ────────────────────────────────
console.log("\n== 7: stripWrappers robustness ==")
assertNoThrow("stripWrappers(null)", () => stripWrappers(null as any))
assertNoThrow("stripWrappers(undefined)", () => stripWrappers(undefined as any))
assertNoThrow("stripWrappers(123)", () => stripWrappers(123 as any))
assertNoThrow("stripWrappers({})", () => stripWrappers({} as any))
assertEq(stripWrappers(""), "", "empty → empty")

// ── 8: applyTitleFormat — non-string inputs ──────────────────────────────
console.log("\n== 8: applyTitleFormat robustness ==")
assertEq(applyTitleFormat(undefined as any, "T", "/p"), "T", "undefined format → title")
assertEq(applyTitleFormat(null as any, "T", "/p"), "T", "null format → title")
assertEq(applyTitleFormat(123 as any, "T", "/p"), "T", "number format → title")
assertEq(applyTitleFormat({} as any, "T", "/p"), "T", "object format → title")
assertEq(applyTitleFormat("", "T", "/p"), "T", "empty format → title")

// ── 9: buildTurns — edge cases ──────────────────────────────────────────
console.log("\n== 9: buildTurns robustness ==")
assertEq(buildTurns(null as any).length, 0, "null → no turns")
assertEq(buildTurns(undefined as any).length, 0, "undefined → no turns")
assertEq(buildTurns(42 as any).length, 0, "number → no turns")
assertEq(buildTurns("string" as any).length, 0, "string → no turns")
assertEq(buildTurns([null, undefined, 42, "str"] as any).length, 0, "non-object elements → no turns")
assertEq(buildTurns([{ info: null }] as any).length, 0, "null info → no turns")
assertEq(buildTurns([{ info: {} }] as any).length, 0, "empty info → no turns")
assertEq(buildTurns([{ info: { role: "user" } }] as any).length, 0, "user with no parts → empty turn dropped")

// ── 10: formatContext — edge cases ──────────────────────────────────────
console.log("\n== 10: formatContext robustness ==")
assertNoThrow("formatContext(null)", () => formatContext(null as any))
assertNoThrow("formatContext(undefined)", () => formatContext(undefined as any))
assertNoThrow("formatContext(42)", () => formatContext(42 as any))
assertEq(formatContext([]), "", "empty turns → empty context")
assertNoThrow("formatContext with undefined turn.user", () => {
  formatContext([{ user: undefined as any }] as any)
})

// ── 11: userQuestionTitle — edge cases ──────────────────────────────────
console.log("\n== 11: userQuestionTitle robustness ==")
assertNoThrow("userQuestionTitle(null)", () => userQuestionTitle(null as any))
assertNoThrow("userQuestionTitle(undefined)", () => userQuestionTitle(undefined as any))
assertNoThrow("userQuestionTitle(42)", () => userQuestionTitle(42 as any))
assertNoThrow("userQuestionTitle([{user: undefined}])", () => userQuestionTitle([{ user: undefined as any }] as any))
assertNoThrow("userQuestionTitle([{user: 123}])", () => userQuestionTitle([{ user: 123 as any }] as any))
assertEq(userQuestionTitle(null as any), "", "null → empty")

// ── 12: sessionModelRef — edge cases ─────────────────────────────────────
console.log("\n== 12: sessionModelRef robustness ==")
assertNoThrow("sessionModelRef(null)", () => sessionModelRef(null as any))
assertNoThrow("sessionModelRef(undefined)", () => sessionModelRef(undefined as any))
assertNoThrow("sessionModelRef(42)", () => sessionModelRef(42 as any))
assertNoThrow("sessionModelRef([null])", () => sessionModelRef([null] as any))
assertNoThrow("sessionModelRef([{info: null}])", () => sessionModelRef([{ info: null }] as any))
assertEq(sessionModelRef(null as any), "", "null → empty")

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
