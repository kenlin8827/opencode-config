/**
 * herdr config deploy — unit tests for the user-wins merge.
 *
 * Validates `deployHerdrConfig`:
 *   - first install writes the template verbatim
 *   - already-current file → uptodate (byte-for-byte untouched)
 *   - merge appends only template keys missing from the user's file,
 *     never overwriting an existing key (user-wins)
 *   - merged result reparses as valid TOML
 *   - unparseable user file falls back to skipped (untouched)
 *
 * Run: bun tests/herdr-config.test.ts
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { deployHerdrConfig, HERDR_CONFIG_TEMPLATE } from "../install/src/herdr-config"

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

const tmp = join(tmpdir(), "herdr-config-test-" + Date.now())
const xdg = join(tmp, "xdg")
const repo = join(tmp, "repo")
process.env.XDG_CONFIG_HOME = xdg
mkdirSync(join(repo, "install", "herdr-config"), { recursive: true })

const template = `# template comment
[theme]
name = "catppuccin"

[ui]
sidebar_width = 30
sidebar_start_collapsed = false

[ui.sidebar.agents]
rows = [
  ["state_icon", "agent", "tab"],
  ["workspace"],
]

[experimental]
cjk_ime_agents = ["opencode"]
`
writeFileSync(join(repo, HERDR_CONFIG_TEMPLATE), template, "utf8")
const dest = join(xdg, "herdr", "config.toml")

// 1. First install writes template verbatim.
let r = deployHerdrConfig(repo, false)
assert(r.action === "installed", "first install → installed")
assert(readFileSync(dest, "utf8") === template, "first install writes template verbatim")

// 2. No missing keys → uptodate, file untouched.
r = deployHerdrConfig(repo, false)
assert(r.action === "uptodate", "already-current file → uptodate")
assert(readFileSync(dest, "utf8") === template, "uptodate leaves file byte-for-byte")

// 3. User overrides a value + adds a key + drops sections → merge appends
//    only the missing keys, preserving the user's edits.
writeFileSync(dest, `# user comment\n[ui]\nsidebar_width = 40\nuser_only = "keep"\n`, "utf8")
r = deployHerdrConfig(repo, false)
assert(r.action === "merged", "missing-key file → merged")
const merged = readFileSync(dest, "utf8")
assert(merged.includes("sidebar_width = 40"), "user value 40 preserved (not clobbered to 30)")
assert(merged.includes('user_only = "keep"'), "user custom key preserved")
assert(merged.includes('name = "catppuccin"'), "missing [theme].name appended")
assert(merged.includes("sidebar_start_collapsed = false"), "missing [ui].sidebar_start_collapsed appended")
assert(merged.includes('cjk_ime_agents = ["opencode"]'), "missing single-line array appended")

const reparsed = Bun.TOML.parse(merged) as any
assert(reparsed.ui.sidebar_width === 40, "reparse: user sidebar_width wins (40)")
assert(reparsed.ui.user_only === "keep", "reparse: user custom key survives")
assert(reparsed.theme.name === "catppuccin", "reparse: missing theme.name appended")
assert(reparsed.ui.sidebar_start_collapsed === false, "reparse: missing boolean appended")
assert(reparsed.ui.sidebar.agents.rows[0][0] === "state_icon", "reparse: multiline rows array appended")
assert(reparsed.experimental.cjk_ime_agents[0] === "opencode", "reparse: single-line array appended")

// 4. Unparseable user file → skipped, left untouched.
writeFileSync(dest, "garbage", "utf8")
r = deployHerdrConfig(repo, false)
assert(r.action === "skipped", "unparseable user file → skipped")
assert(readFileSync(dest, "utf8") === "garbage", "skipped leaves user file untouched")

rmSync(tmp, { recursive: true, force: true })

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) process.exit(1)