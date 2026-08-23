/**
 * E2E Guard Plugin — Unit Tests (no API dependency)
 *
 * Coverage:
 *   - E2E command detection: pm run scripts (*e2e*), runner CLIs
 *     (playwright test, cypress run, nightwatch, codeceptjs run),
 *     Python runners gated on e2e evidence (pytest/tox/uv/poetry),
 *     chained segments, non-executing verbs allowed
 *   - risk classification: full (no target) vs targeted (spec/test file),
 *     highest level wins across chained segments
 *   - state normalize & project switch (config field > default off)
 *   - session approval store: one-shot pass + sticky unlock lifecycle
 *   - tool guard: graded gating (full = fresh pass each run, targeted =
 *     auto-pass once unlocked), complete no-op when off
 *   - command argument parsing (state / reset / allow)
 *
 * Run: bun run tests/test-e2e-guard-unit.ts   (or: npx tsx tests/test-e2e-guard-unit.ts)
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  normalizeState,
  getState,
  getStateSource,
  setState,
  clearState,
  setProjectDir,
  isEnabled,
  parseStateArg,
  parseResetArg,
  parseAllowArg,
} from "../plugins/e2e-guard/e2e-guard-config"
import {
  isE2eCommand,
  classifyE2e,
  blockMessage,
  blockMessageFull,
  blockMessageTargeted,
  approveSession,
  unlockSession,
  isApproved,
  isUnlocked,
  consumeApproval,
  revokeApproval,
  clearApprovals,
} from "../plugins/e2e-guard/e2e-guard-runtime"
import { makeToolGuardHook } from "../plugins/e2e-guard/e2e-guard-tool-guard"

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
  assert(actual === expected, `${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`)
}

// Fake plugin client — only app.log is used by the guard.
const fakeClient = { app: { log: async () => {} } } as any

async function expectThrow(fn: () => Promise<unknown>, label: string) {
  try {
    await fn()
    assert(false, `${label} — expected throw, got success`)
  } catch (err) {
    assert(String(err).includes("[E2E-GUARD]"), `${label} — E2E-GUARD error raised`)
  }
}

async function expectOk(fn: () => Promise<unknown>, label: string) {
  try {
    await fn()
    assert(true, label)
  } catch (err) {
    assert(false, `${label} — unexpected throw: ${String(err)}`)
  }
}

// ─── E2E command detection ───────────────────────────────────────────

console.log("\n== isE2eCommand — package-manager run scripts ==")
assert(isE2eCommand("npm run e2e"), "npm run e2e")
assert(isE2eCommand("npm run test:e2e"), "npm run test:e2e")
assert(isE2eCommand("pnpm run e2e:smoke"), "pnpm run e2e:smoke")
assert(isE2eCommand("pnpm test:e2e"), "pnpm script shorthand")
assert(isE2eCommand("yarn e2e"), "yarn script shorthand")
assert(isE2eCommand("bun run e2e"), "bun run e2e")
assert(isE2eCommand("npm run e2e -- --headed"), "flags after the script")
assert(isE2eCommand('npm run "test:e2e"'), "quoted script name")

console.log("\n== isE2eCommand — runner CLIs ==")
assert(isE2eCommand("playwright test"), "playwright test")
assert(isE2eCommand("npx playwright test tests/login.spec.ts"), "npx playwright test")
assert(isE2eCommand("playwright test --project=chromium"), "flags between runner and verb")
assert(isE2eCommand("cypress run"), "cypress run")
assert(isE2eCommand("npx cypress run --browser chrome"), "npx cypress run with flags")
assert(isE2eCommand("nightwatch tests/e2e/login.js"), "nightwatch (any invocation)")
assert(isE2eCommand("codeceptjs run"), "codeceptjs run")

console.log("\n== isE2eCommand — Python runners (gated only with e2e evidence) ==")
assert(isE2eCommand("pytest tests/e2e/test_login.py"), "pytest with e2e path")
assert(isE2eCommand("pytest -m e2e"), "pytest e2e marker")
assert(isE2eCommand('pytest -m "e2e and not slow"'), "quoted marker expression")
assert(isE2eCommand("python -m pytest tests/e2e/"), "python -m pytest e2e dir")
assert(isE2eCommand("python3 -m pytest tests/e2e/test_a.py"), "python3 -m pytest")
assert(isE2eCommand("uv run pytest tests/e2e/test_a.py"), "uv run pytest")
assert(isE2eCommand("poetry run pytest -m e2e"), "poetry run pytest marker")
assert(isE2eCommand("pdm run pytest tests/e2e"), "pdm run pytest e2e dir")
assert(isE2eCommand("pipenv run pytest tests/e2e/test_a.py"), "pipenv run pytest")
assert(isE2eCommand("tox -e e2e"), "tox e2e environment")
assert(isE2eCommand("tox --env py-e2e"), "tox long env flag")

console.log("\n== isE2eCommand — chained segments ==")
assert(isE2eCommand("npm run build && playwright test"), "E2E in second segment")
assert(isE2eCommand("playwright test; npm run report"), "E2E in first segment")
assert(isE2eCommand("echo hi && npm run test:e2e"), "semicolon-free && chain")

console.log("\n== isE2eCommand — allowed shapes ==")
assert(!isE2eCommand("npm run build"), "plain build script")
assert(!isE2eCommand("npm test"), "unit test script")
assert(!isE2eCommand("bun test"), "bun builtin unit tests")
assert(!isE2eCommand("vitest run"), "vitest is not gated")
assert(!isE2eCommand("playwright install"), "playwright install is not a run")
assert(!isE2eCommand("cypress open"), "cypress open (interactive) is not gated")
assert(!isE2eCommand("git status"), "unrelated command")
assert(!isE2eCommand("npm run deploy"), "script without e2e in the name")
assert(!isE2eCommand("pytest"), "bare pytest is usually the unit suite")
assert(!isE2eCommand("pytest tests/unit/test_a.py"), "pytest with non-e2e path")
assert(!isE2eCommand("pytest -m unit"), "pytest non-e2e marker")
assert(!isE2eCommand("python -m pytest"), "bare python -m pytest")
assert(!isE2eCommand("uv run pytest tests/unit/"), "uv pytest non-e2e dir")
assert(!isE2eCommand("tox -e lint"), "tox non-e2e environment")
assert(!isE2eCommand('pytest -m "not e2e"'), "marker expression EXCLUDING e2e")
assert(!isE2eCommand("pytest --co -q tests/e2e/"), "--co collect-only does not execute")
assert(!isE2eCommand("pytest --collect-only tests/e2e/test_a.py"), "--collect-only does not execute")
assert(!isE2eCommand("nightwatch --help"), "nightwatch --help is informational")
assert(!isE2eCommand("nightwatch --version"), "nightwatch --version is informational")
assert(!isE2eCommand("uv run ruff check ."), "env tool without pytest")
assert(!isE2eCommand(""), "empty command")

// ─── Risk classification ────────────────────────────────────────

console.log("\n== classifyE2e — full (no explicit target) ==")
assertEq(classifyE2e("npm run e2e"), "full", "bare e2e script")
assertEq(classifyE2e("npm run test:e2e"), "full", "test:e2e script")
assertEq(classifyE2e("playwright test"), "full", "playwright test with no args")
assertEq(classifyE2e("playwright test --project=chromium"), "full", "flags only ≠ target")
assertEq(classifyE2e("cypress run --browser chrome"), "full", "flag values ≠ target")
assertEq(classifyE2e("nightwatch"), "full", "bare nightwatch")

console.log("\n== classifyE2e — targeted (explicit spec/test file) ==")
assertEq(classifyE2e("playwright test tests/login.spec.ts"), "targeted", "spec path arg")
assertEq(classifyE2e("playwright test --project=chromium tests/login.spec.ts"), "targeted", "spec after flags")
assertEq(classifyE2e("cypress run --spec cypress/e2e/login.cy.js"), "targeted", "cypress --spec")
assertEq(classifyE2e("nightwatch tests/e2e/login.js"), "targeted", "nightwatch with file")
assertEq(classifyE2e("codeceptjs run tests/login_test.js"), "targeted", "codeceptjs with file")
assertEq(classifyE2e("npm run e2e -- tests/login.spec.ts"), "targeted", "npm -- passthrough")
assertEq(classifyE2e("pnpm test:e2e tests/a.spec.ts"), "targeted", "pnpm script + path")
assertEq(classifyE2e('playwright test "e2e/checkout.spec.ts"'), "targeted", "quoted spec path")
assertEq(classifyE2e("pytest tests/e2e/test_login.py"), "targeted", "pytest explicit e2e file")
assertEq(classifyE2e("uv run pytest tests/e2e/test_a.py"), "targeted", "uv pytest explicit file")
assertEq(classifyE2e("python3 -m pytest tests/e2e/test_a.py"), "targeted", "python3 -m pytest file")
assertEq(classifyE2e("pytest tests/e2e/test_login.py::test_happy_path"), "targeted", "pytest node ID (file::test)")
assertEq(classifyE2e("pytest tests/e2e/test_a.py::test_x[param-1]"), "targeted", "parametrized node ID")

console.log("\n== classifyE2e — Python full-suite shapes ==")
assertEq(classifyE2e("pytest tests/e2e/"), "full", "pytest e2e directory")
assertEq(classifyE2e("pytest -m e2e"), "full", "marker selection is a suite run")
assertEq(classifyE2e("poetry run pytest tests/e2e"), "full", "poetry pytest e2e dir")
assertEq(classifyE2e("tox -e e2e"), "full", "tox e2e environment")
assertEq(classifyE2e("pytest tests/e2e/test_a.py && pytest tests/unit"), "targeted", "chain with unit segment")

console.log("\n== classifyE2e — chained segments take the highest risk ==")
assertEq(classifyE2e("playwright test a.spec.ts && playwright test"), "full", "full wins over targeted")
assertEq(classifyE2e("npm run build && playwright test tests/a.spec.ts"), "targeted", "targeted segment in a chain")
assertEq(classifyE2e("npm run build && npm test"), null, "no E2E at all")

// ─── One-shot approval store ─────────────────────────────────────────

console.log("\n== approval store ==")
clearApprovals()
assert(!isApproved("s1"), "no approval before grant")
assert(!isUnlocked("s1"), "not unlocked before grant")
approveSession("s1")
assert(isApproved("s1"), "approved after grant")
assert(isUnlocked("s1"), "unlocked after grant")
assert(!isApproved("s2"), "approval is per-session")
assert(consumeApproval("s1"), "consume succeeds once")
assert(!consumeApproval("s1"), "consume fails the second time")
assert(!isApproved("s1"), "approval gone after consume")
assert(isUnlocked("s1"), "unlock SURVIVES consuming the one-shot pass")
revokeApproval("s1")
assert(!isUnlocked("s1"), "revoke removes the unlock mark too")
approveSession("s1")
clearApprovals()
assert(!isUnlocked("s1"), "clearApprovals drops unlock marks as well")
approveSession("")
assert(!isApproved(""), "empty sessionID is never approved")
assert(!isUnlocked(""), "empty sessionID is never unlocked")

// ─── State normalize & argument parsing ──────────────────────────────

console.log("\n== normalizeState ==")
assertEq(normalizeState("on"), "on", "'on'")
assertEq(normalizeState("enabled"), "on", "'enabled'")
assertEq(normalizeState("off"), "off", "'off'")
assertEq(normalizeState("false"), "off", "'false'")
assertEq(normalizeState(true), "on", "boolean true")
assertEq(normalizeState("bogus"), null, "unknown string → null")
assertEq(normalizeState(42), null, "non-string/boolean → null")

console.log("\n== command argument parsing ==")
assertEq(parseStateArg("on"), "on", "parseStateArg on")
assertEq(parseStateArg("off and more"), "off", "parseStateArg first token")
assertEq(parseStateArg(""), null, "parseStateArg empty → status")
assertEq(parseStateArg(undefined), null, "parseStateArg missing → status")
assert(parseResetArg("reset"), "parseResetArg reset")
assert(parseResetArg("clear"), "parseResetArg clear")
assert(!parseResetArg("on"), "parseResetArg rejects state")
assert(parseAllowArg("allow"), "parseAllowArg allow")
assert(parseAllowArg("approve"), "parseAllowArg approve")
assert(parseAllowArg("yes"), "parseAllowArg yes")
assert(!parseAllowArg("on"), "parseAllowArg rejects state")
assert(!parseAllowArg(undefined), "parseAllowArg missing")
assertEq(parseAllowArg("allow"), "full", "bare allow grants the full scope")
assertEq(parseAllowArg("allow targeted"), "targeted", "allow targeted scope")
assertEq(parseAllowArg("approve affected"), "targeted", "approve affected alias")
assertEq(parseAllowArg("allow scoped"), "targeted", "allow scoped alias")
assertEq(parseAllowArg("confirm impact"), "targeted", "confirm impact alias")
assertEq(parseAllowArg("allow bogus-word"), "full", "unknown second word degrades to full")

console.log("\n== unlockSession (allow targeted grant) ==")
clearApprovals()
unlockSession("s1")
assert(isUnlocked("s1"), "unlock granted")
assert(!isApproved("s1"), "unlock does NOT grant a one-shot full pass")
assert(!consumeApproval("s1"), "nothing to consume after unlock-only")
revokeApproval("s1")
assert(!isUnlocked("s1"), "revoke clears the unlock mark")
unlockSession("")
assert(!isUnlocked(""), "empty sessionID is never unlocked")

// ─── Project switch resolution ───────────────────────────────────────

console.log("\n== project switch ==")
const tmp = mkdtempSync(join(tmpdir(), "e2e-guard-test-"))
setProjectDir(tmp)

assertEq(getState(), "off", "default state is OFF")
assertEq(getStateSource(), "default", "default source")

setState("on")
assertEq(getState(), "on", "setState writes the config field on")
assertEq(getStateSource(), "config", "config source after setState")
assert(isEnabled(), "isEnabled when on")

setState("off")
assertEq(getState(), "off", "setState overwrites the field to off")

clearState()
assertEq(getState(), "off", "clearState reverts to default off")
assertEq(getStateSource(), "default", "default source after clearState")

// A hand-written JSONC config field is honored (comments tolerated on read).
rmSync(join(tmp, ".opencode"), { recursive: true, force: true })
writeFileSync(join(tmp, "opencode.jsonc"), `{
  // project config with JSONC comments
  "e2eGuard": "on",
}`)
assertEq(getState(), "on", "config field e2eGuard honored")
assertEq(getStateSource(), "config", "config source")
clearState()

// ─── Tool guard integration ──────────────────────────────────────────

console.log("\n== tool guard ==")
const guard = makeToolGuardHook(fakeClient)
const call = (tool: string, args: unknown, sessionID?: string) =>
  guard({ tool, sessionID }, { args })

// OFF (remove every config file → default off for this block)
rmSync(join(tmp, "opencode.jsonc"), { force: true })
rmSync(join(tmp, ".opencode"), { recursive: true, force: true })
assertEq(getState(), "off", "back to default off")
await expectOk(() => call("bash", { command: "playwright test" }), "off → E2E run allowed")
await expectOk(() => call("bash", { command: "npm run e2e" }), "off → e2e script allowed")

// ON
setState("on")
await expectThrow(() => call("bash", { command: "playwright test" }, "s1"), "on → playwright test blocked")
await expectThrow(() => call("shell", { command: "npm run test:e2e" }, "s1"), "on → shell e2e script blocked")
await expectThrow(() => call("bash", { command: "npm run build && playwright test" }, "s1"), "on → chained E2E blocked")

await expectOk(() => call("bash", { command: "npm test" }, "s1"), "on → unit tests allowed")
await expectOk(() => call("bash", { command: "playwright install" }, "s1"), "on → playwright install allowed")
await expectOk(() => call("bash", { command: "git status" }, "s1"), "on → unrelated bash allowed")
await expectOk(() => call("read", { filePath: "x" }, "s1"), "on → non-bash tools untouched")
await expectOk(() => call("bash", {}, "s1"), "on → bash without command allowed")

// Approval pass-through, graded by risk.
clearApprovals()
await expectThrow(() => call("bash", { command: "npx cypress run" }, "s1"), "on → full suite blocked before approval")
await expectThrow(() => call("bash", { command: "playwright test tests/a.spec.ts" }, "s1"), "on → targeted blocked before ANY approval")

approveSession("s1")
await expectOk(() => call("bash", { command: "playwright test tests/a.spec.ts" }, "s1"), "on → targeted run consumes the pending pass")
await expectOk(() => call("bash", { command: "playwright test tests/b.spec.ts" }, "s1"), "on → targeted re-run passes via unlock (no pass needed)")
await expectThrow(() => call("bash", { command: "npx cypress run" }, "s1"), "on → full suite still blocked after pass consumed")

approveSession("s1")
await expectOk(() => call("bash", { command: "npx cypress run" }, "s1"), "on → full suite passes with a fresh approval")
await expectOk(() => call("bash", { command: "nightwatch tests/e2e/x.js" }, "s1"), "on → targeted still unlocked after the full run")
await expectThrow(() => call("bash", { command: "npx cypress run" }, "s1"), "on → every full-suite run needs a fresh approval")

approveSession("s2")
await expectOk(() => call("bash", { command: "playwright test tests/a.spec.ts" }, "s1"), "on → s1's own unlock still works (not from s2)")
await expectThrow(() => call("bash", { command: "npx cypress run" }, "s1"), "on → s2's one-shot pass does not leak into s1's full run")
revokeApproval("s1")
await expectThrow(() => call("bash", { command: "playwright test tests/a.spec.ts" }, "s1"), "on → after revoke, s1 is gated again despite s2's approval")
clearApprovals()

// Targeted-only unlock (the "affected specs only" choice): full stays gated.
unlockSession("s1")
await expectOk(() => call("bash", { command: "playwright test tests/a.spec.ts" }, "s1"), "on → targeted passes after unlock-only grant")
await expectOk(() => call("bash", { command: "pytest tests/e2e/test_a.py::test_x" }, "s1"), "on → targeted re-run of another affected spec also passes")
await expectThrow(() => call("bash", { command: "npx cypress run" }, "s1"), "on → full suite still blocked under unlock-only")
approveSession("s1")
await expectOk(() => call("bash", { command: "npx cypress run" }, "s1"), "on → later full allow still works on top of the unlock")
clearApprovals()

// Block message sanity
assert(blockMessageFull().includes("/e2e-guard allow"), "full block message offers the allow path")
assert(blockMessageFull().includes("allow targeted"), "full block message offers the affected-only choice")
assert(blockMessageFull().includes("impact analysis"), "full block message steers to affected-spec runs")
assert(blockMessageFull().toUpperCase().includes("FULL-SUITE"), "full block message names the risk level")
assert(blockMessageTargeted().toLowerCase().includes("targeted"), "targeted block message names the level")
assert(blockMessageTargeted().includes("pass automatically"), "targeted block message explains the unlock")
assert(blockMessage() === blockMessageFull(), "generic blockMessage delegates to the full variant")

// ─── Cleanup & summary ───────────────────────────────────────────────

rmSync(tmp, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
