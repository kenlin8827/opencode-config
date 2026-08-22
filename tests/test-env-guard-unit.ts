/**
 * Env Guard Plugin — Unit Tests (no API dependency)
 *
 * Coverage:
 *   - path classification (.env* sensitive, .env.example exempt)
 *   - file-path extraction from tool args (filePath / path / file_path)
 *   - bash leak detection: read verbs, redirection, chained segments,
 *     copy source vs destination, PowerShell forms
 *   - state normalize & project switch (config field > default off)
 *   - tool guard: blocks sensitive access when on, complete no-op when off
 *
 * Run: bun run tests/test-env-guard-unit.ts   (or: npx tsx tests/test-env-guard-unit.ts)
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
} from "../plugins/env-guard/env-guard-config"
import {
  isSensitiveEnvPath,
  extractFilePath,
  bashLeaksEnv,
  segmentLeaks,
  blockMessage,
} from "../plugins/env-guard/env-guard-runtime"
import { makeToolGuardHook } from "../plugins/env-guard/env-guard-tool-guard"

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
    assert(String(err).includes("[ENV-GUARD]"), `${label} — ENV-GUARD error raised`)
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

// ─── Path classification ─────────────────────────────────────────────

console.log("\n== isSensitiveEnvPath ==")
assert(isSensitiveEnvPath(".env"), ".env is sensitive")
assert(isSensitiveEnvPath(".env.local"), ".env.local is sensitive")
assert(isSensitiveEnvPath(".env.production"), ".env.production is sensitive")
assert(isSensitiveEnvPath("config/.env"), "nested .env is sensitive")
assert(isSensitiveEnvPath("a\\b\\.env.local"), "windows-separator .env.local is sensitive")
assert(!isSensitiveEnvPath(".env.example"), ".env.example is exempt")
assert(!isSensitiveEnvPath("dir/.env.example.bak"), ".env.example.* variants are exempt")
assert(!isSensitiveEnvPath("env"), "plain 'env' is not sensitive")
assert(!isSensitiveEnvPath(".envoy"), ".envoy is not sensitive")
assert(!isSensitiveEnvPath("foo.env"), "foo.env is not sensitive")
assert(!isSensitiveEnvPath(""), "empty string is not sensitive")
assert(!isSensitiveEnvPath(null), "null is not sensitive")

// ─── File path extraction ────────────────────────────────────────────

console.log("\n== extractFilePath ==")
assertEq(extractFilePath({ filePath: "x" }), "x", "filePath field")
assertEq(extractFilePath({ path: "y" }), "y", "path field")
assertEq(extractFilePath({ file_path: "z" }), "z", "file_path field")
assertEq(extractFilePath({ filePath: ".env" }), ".env", "sensitive path passes through")
assertEq(extractFilePath({ other: 1 }), null, "unknown field → null")
assertEq(extractFilePath(null), null, "null args → null")

// ─── Bash leak detection ─────────────────────────────────────────────

console.log("\n== bashLeaksEnv — read verbs ==")
assert(bashLeaksEnv("cat .env"), "cat .env")
assert(bashLeaksEnv("head -n 5 .env.production"), "head on .env.production")
assert(bashLeaksEnv("Get-Content .env.local"), "PowerShell Get-Content")
assert(bashLeaksEnv("gc .env"), "PowerShell gc alias")
assert(bashLeaksEnv("grep KEY .env"), "grep on .env")
assert(bashLeaksEnv('cat ".env"'), "quoted .env reference")
assert(bashLeaksEnv("type .env"), "type (windows cat)")

console.log("\n== bashLeaksEnv — redirection & chaining ==")
assert(bashLeaksEnv("wc -l < .env"), "stdin redirection")
assert(bashLeaksEnv("cat .env && ls"), "leak in FIRST chained segment")
assert(bashLeaksEnv("ls && cat .env"), "leak in SECOND chained segment")
assert(bashLeaksEnv("echo hi; cat .env"), "semicolon-chained leak")

console.log("\n== bashLeaksEnv — allowed shapes ==")
assert(!bashLeaksEnv("cat .env.example"), ".env.example always allowed")
assert(!bashLeaksEnv("cp .env.example .env"), "scaffold copy allowed (dest is .env)")
assert(!bashLeaksEnv("touch .env"), "touch allowed")
assert(!bashLeaksEnv("rm .env"), "rm allowed (no leak)")
assert(!bashLeaksEnv("ls -la .env"), "ls allowed")
assert(!bashLeaksEnv("git add .env"), "git verb not gated")
assert(!bashLeaksEnv("cat file.txt"), "unrelated file allowed")
assert(!bashLeaksEnv(""), "empty command allowed")
assert(!bashLeaksEnv('echo "hello world"'), "plain echo allowed")

console.log("\n== bashLeaksEnv — copy-out ==")
assert(bashLeaksEnv("cp .env /tmp/out"), "cp with sensitive SOURCE blocked")
assert(bashLeaksEnv("mv .env secrets.txt"), "mv from sensitive blocked")
assert(bashLeaksEnv("Copy-Item .env x.txt"), "PowerShell Copy-Item blocked")

console.log("\n== segmentLeaks ==")
assert(segmentLeaks("cat", [".env"]), "cat + sensitive arg")
assert(!segmentLeaks("cp", [".env.example", ".env"]), "cp example→env (dest exempt source)")
assert(segmentLeaks("cp", [".env", "x"]), "cp sensitive source")
assert(!segmentLeaks("ls", [".env"]), "non-read verb passes")
assert(!segmentLeaks("cat", []), "no args passes")

// ─── State normalize ─────────────────────────────────────────────────

console.log("\n== normalizeState ==")
assertEq(normalizeState("on"), "on", "'on'")
assertEq(normalizeState("enabled"), "on", "'enabled'")
assertEq(normalizeState("off"), "off", "'off'")
assertEq(normalizeState("false"), "off", "'false'")
assertEq(normalizeState(true), "on", "boolean true")
assertEq(normalizeState("bogus"), null, "unknown string → null")
assertEq(normalizeState(42), null, "non-string/boolean → null")

// ─── Project switch resolution ───────────────────────────────────────

console.log("\n== project switch ==")
const tmp = mkdtempSync(join(tmpdir(), "env-guard-test-"))
setProjectDir(tmp)

assertEq(getState(), "off", "default state is OFF")
assertEq(getStateSource(), "default", "default source")

// setState writes the envGuard field into the project opencode.jsonc.
setState("on")
assertEq(getState(), "on", "setState writes the config field on")
assertEq(getStateSource(), "config", "config source after setState")
assert(isEnabled(), "isEnabled when on")

setState("off")
assertEq(getState(), "off", "setState overwrites the field to off")
assertEq(getStateSource(), "config", "explicit off is still the config source")

// clearState removes the field → back to the default.
clearState()
assertEq(getState(), "off", "clearState reverts to default off")
assertEq(getStateSource(), "default", "default source after clearState")

// A hand-written JSONC config field is honored (comments tolerated on read).
// Drop the bootstrapped .opencode copy first so the root file below is
// the effective one (it has read precedence).
rmSync(join(tmp, ".opencode"), { recursive: true, force: true })
writeFileSync(join(tmp, "opencode.jsonc"), `{
  // project config with JSONC comments
  "envGuard": "on",
}`)
assertEq(getState(), "on", "config field envGuard honored")
assertEq(getStateSource(), "config", "config source")
clearState()

// A commented-out template line (the /project init shape) gets uncommented
// in place when the switch is set — the value is not written inside the
// comment while the line stays inactive.
writeFileSync(join(tmp, "opencode.jsonc"), `{
  "$schema": "https://opencode.ai/config.json",
  // "envGuard": "off",  // on | off — blocks agent access to secret .env* files
}`)
assertEq(getState(), "off", "commented template line reads as default off")
setState("on")
const uncommented = readFileSync(join(tmp, "opencode.jsonc"), "utf-8")
assert(uncommented.includes('"envGuard": "on"'), "setState uncomments the template line")
assert(!uncommented.includes('// "envGuard"'), "no commented envGuard line remains")
assert(uncommented.includes("blocks agent access"), "trailing explanation comment preserved")
assertEq(getState(), "on", "uncommented field becomes active")

// Reset re-comments the line (back to the template shape) instead of
// dropping it, keeping the switch documentation in place.
clearState()
const reset = readFileSync(join(tmp, "opencode.jsonc"), "utf-8")
assert(!reset.includes('\n  "envGuard":'), "clearState deactivates the field")
assert(reset.includes('// "envGuard": "on"'), "reset re-comments the switch line")
assert(reset.includes("blocks agent access"), "explanation comment kept on reset")
assertEq(getState(), "off", "back to default after clearing")

// No config file at all → setState bootstraps from the /project init
// template at .opencode/opencode.jsonc (the same location /project init
// scaffolds), then uncomments the requested switch.
rmSync(join(tmp, "opencode.jsonc"))
assert(setState("on"), "setState succeeds without any config file")
const created = readFileSync(join(tmp, ".opencode", "opencode.jsonc"), "utf-8")
assert(created.includes("Project-level OpenCode configuration"), "created from the project template")
assert(created.includes('\n  "envGuard": "on"'), "template bootstrapped with the switch active")
assert(created.includes('// "adrGuard":'), "other switches stay commented in the bootstrapped config")
assertEq(getState(), "on", "created config holds the switch")
clearState()

// ─── Tool guard integration ──────────────────────────────────────────

console.log("\n== tool guard ==")
const guard = makeToolGuardHook(fakeClient)
const call = (tool: string, args: unknown) => guard({ tool }, { args })

// OFF (remove every config file → default off for this block)
rmSync(join(tmp, "opencode.jsonc"), { force: true })
rmSync(join(tmp, ".opencode"), { recursive: true, force: true })
assertEq(getState(), "off", "back to default off")
await expectOk(() => call("read", { filePath: ".env" }), "off → read .env allowed")
await expectOk(() => call("bash", { command: "cat .env" }), "off → cat .env allowed")

// ON
setState("on")
await expectThrow(() => call("read", { filePath: ".env" }), "on → read .env blocked")
await expectThrow(() => call("write", { filePath: "config/.env.local" }), "on → write nested .env.local blocked")
await expectThrow(() => call("edit", { filePath: ".env" }), "on → edit .env blocked")
await expectThrow(() => call("grep", { path: ".env" }), "on → grep .env blocked")
await expectThrow(() => call("bash", { command: "cat .env" }), "on → bash cat .env blocked")
await expectThrow(() => call("shell", { command: "Get-Content .env.local" }), "on → shell Get-Content blocked")
await expectThrow(() => call("bash", { command: "cp .env out.txt" }), "on → cp out blocked")

await expectOk(() => call("read", { filePath: ".env.example" }), "on → .env.example allowed")
await expectOk(() => call("bash", { command: "cp .env.example .env" }), "on → scaffold copy allowed")
await expectOk(() => call("bash", { command: "git status" }), "on → unrelated bash allowed")
await expectOk(() => call("read", { filePath: "src/main.ts" }), "on → unrelated file allowed")
await expectOk(() => call("bash", {}), "on → bash without command allowed")

// Block message sanity
assert(blockMessage("read on .env").includes(".env.example"), "block message offers .env.example")
assert(blockMessage("x").includes("envsitter"), "block message offers envsitter escape hatch")

// ─── Cleanup & summary ───────────────────────────────────────────────

rmSync(tmp, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
