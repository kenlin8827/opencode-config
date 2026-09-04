/**
 * OCP Upgrade — Unit Tests (no host dependency)
 *
 * Pins the force-override semantics of `ocp upgrade -f` for the OCP
 * archive-download branch. The behavior under test is the decision
 * captured by `shouldSkipUpgradeDownload`:
 *
 *   skip === true  ⇔  !force ∧ probed !== null ∧ !isNewerVersion(probed, repoVersion)
 *
 * In plain English: skip ONLY when the user did NOT pass -f, the remote
 * probe succeeded, AND the probed release is not ahead of the local copy.
 * Every other shape must re-fetch the archive (force, probe failed, or
 * remote is actually newer).
 *
 * The passthrough forwarding from `applyComponentUpgrade` → `executeUpgrade`
 * is intentionally a one-line change; verify it in the diff and via the
 * executeUpgrade entry point's own `force` parse, not here.
 *
 * Run: bun run tests/test-updater-unit.ts
 */

import { shouldSkipUpgradeDownload } from "../install/src/updater"

let passed = 0
let failed = 0

function assert(cond: unknown, label: string) {
  if (cond) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ ${label}`)
  }
}

console.log("shouldSkipUpgradeDownload — truth table")

// 1. Today's behavior preserved: no force, probe OK, same version → SKIP.
assert(
  shouldSkipUpgradeDownload(false, "1.0.0", "1.0.0") === true,
  "no force + probe OK + same version → skip (today's behavior)",
)

// 2. The fix: force + probe OK + same version → RE-DOWNLOAD.
assert(
  shouldSkipUpgradeDownload(true, "1.0.0", "1.0.0") === false,
  "force + probe OK + same version → re-download (force overrides)",
)

// 3. Probe failed (CN raw.githubusercontent timeout, etc.) → must re-download.
assert(
  shouldSkipUpgradeDownload(false, null, "1.0.0") === false,
  "no force + probe failed → re-download (graceful degrade)",
)

// 4. Real upgrade available → must re-download (unchanged by the fix).
assert(
  shouldSkipUpgradeDownload(false, "2.0.0", "1.0.0") === false,
  "no force + probe newer → re-download (upgrade available)",
)

// 5. Force + probe failed → still re-download (probe failure must not block force).
assert(
  shouldSkipUpgradeDownload(true, null, "1.0.0") === false,
  "force + probe failed → re-download",
)

// 6. Force + probe newer → re-download (force is a no-op when upgrade already needed).
assert(
  shouldSkipUpgradeDownload(true, "2.0.0", "1.0.0") === false,
  "force + probe newer → re-download",
)

// 7. Repo copy ahead of release (dev build / rolling tag) → skip.
assert(
  shouldSkipUpgradeDownload(false, "0.9.0", "1.0.0") === true,
  "no force + probe older than local → skip (repo copy ahead of release)",
)

// 8. Force + probe older than local → still re-download (force always wins).
assert(
  shouldSkipUpgradeDownload(true, "0.9.0", "1.0.0") === false,
  "force + probe older than local → re-download",
)

// 9. force flag parse: the only flag executeUpgrade honors is one of
//    "-f", "--force", "-Force". Verify the consumer-side detection that
//    wires into shouldSkipUpgradeDownload. (Sanity pin on the contract,
//    not the helper itself — helper only sees the boolean.)
//
//    We can't directly test executeUpgrade's flag parsing here without
//    mocking fs/fetch, but the symbol is small and stable: any change
//    to the flag list should require an explicit test update.

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
