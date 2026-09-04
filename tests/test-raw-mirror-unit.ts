/**
 * OCP mirror helpers — Unit Tests (no host dependency)
 *
 * Pins the behavior of the env-var-driven mirror helpers in
 * install/src/installer.ts and the call sites that wire them through
 * install/src/updater.ts. Together they form the CN-friendliness layer:
 *
 *   - OCP_RAW_MIRROR  → rawMirrorUrls(url)        : raw.githubusercontent.com
 *                     → rewriteRawMirror(cmd)     : shell command URLs
 *                     → installCommandSequence()  : mirror-fallback orch.
 *
 *   - OCP_API_MIRROR  → apiMirrorUrls(url)        : api.github.com
 *
 *   - OCP_RELEASE_MIRROR is the existing github.com-releases convention
 *     handled in updater.ts.downloadArchive — not unit-tested here
 *     because it's tightly coupled to fs work (file write).
 *
 * Run: bun run tests/test-raw-mirror-unit.ts
 */

import {
  apiMirrorUrls,
  installCommandSequence,
  rawMirrorUrls,
  rewriteRawMirror,
  rewriteReleaseMirror,
} from "../install/src/installer"

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

function assertEq<T>(actual: T, expected: T, label: string) {
  let ok = false
  if (Array.isArray(actual) && Array.isArray(expected)) {
    ok =
      actual.length === expected.length &&
      actual.every((v, i) => v === expected[i])
  } else if (
    actual !== null &&
    expected !== null &&
    typeof actual === "object" &&
    typeof expected === "object"
  ) {
    // Shallow object compare — sufficient for the {primary, fallback}
    // shape used by installCommandSequence.
    const aKeys = Object.keys(actual as object)
    const eKeys = Object.keys(expected as object)
    ok =
      aKeys.length === eKeys.length &&
      aKeys.every((k) => (actual as Record<string, unknown>)[k] === (expected as Record<string, unknown>)[k])
  } else {
    ok = actual === expected
  }
  if (ok) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ ${label}`)
    console.error(`     expected: ${JSON.stringify(expected)}`)
    console.error(`     actual:   ${JSON.stringify(actual)}`)
  }
}

const RAW_URL =
  "https://raw.githubusercontent.com/kenlin8827/opencode-prime/main/install/version.json"
const GH_RELEASE_URL =
  "https://github.com/kenlin8827/opencode-prime/releases/latest/download/opencode-prime-latest.tar.gz"

// ─── rawMirrorUrls ──────────────────────────────────────────────────────

console.log("rawMirrorUrls — env unset")

// No env → official URL only, untouched
delete process.env.OCP_RAW_MIRROR
assertEq(
  rawMirrorUrls(RAW_URL),
  [RAW_URL],
  "raw URL with env unset → [raw] only",
)
assertEq(
  rawMirrorUrls(GH_RELEASE_URL),
  [GH_RELEASE_URL],
  "github.com release URL with env unset → [url] only",
)

console.log("\nrawMirrorUrls — env set, mirror first")

process.env.OCP_RAW_MIRROR = "https://ghfast.top"

// Order: mirror first (CN-friendly), official second
assertEq(
  rawMirrorUrls(RAW_URL),
  [`https://ghfast.top/${RAW_URL}`, RAW_URL],
  "raw URL with env set → [mirror, official] (mirror first)",
)

// github.com release URLs are NEVER touched by OCP_RAW_MIRROR — that is
// OCP_RELEASE_MIRROR's job (separate convention, separate env var).
assertEq(
  rawMirrorUrls(GH_RELEASE_URL),
  [GH_RELEASE_URL],
  "github.com release URL with env set → [url] only (OCP_RELEASE_MIRROR territory)",
)

console.log("\nrawMirrorUrls — trailing slash handling")

process.env.OCP_RAW_MIRROR = "https://ghfast.top/"
assertEq(
  rawMirrorUrls(RAW_URL),
  [`https://ghfast.top/${RAW_URL}`, RAW_URL],
  "trailing slash on mirror prefix is stripped before prepending",
)

process.env.OCP_RAW_MIRROR = "https://ghfast.top///"
assertEq(
  rawMirrorUrls(RAW_URL),
  [`https://ghfast.top/${RAW_URL}`, RAW_URL],
  "multiple trailing slashes on mirror prefix are stripped",
)

// ─── rewriteRawMirror ───────────────────────────────────────────────────

console.log("\nrewriteRawMirror — env unset (no-op)")

delete process.env.OCP_RAW_MIRROR
const RTK_CMD =
  "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh"
assertEq(
  rewriteRawMirror(RTK_CMD),
  RTK_CMD,
  "rtk install command with env unset → unchanged",
)
assertEq(
  rewriteRawMirror("echo hello"),
  "echo hello",
  "command without any URL with env unset → unchanged",
)

console.log("\nrewriteRawMirror — env set, raw.github rewrites")

process.env.OCP_RAW_MIRROR = "https://ghfast.top"

assertEq(
  rewriteRawMirror(RTK_CMD),
  `curl -fsSL https://ghfast.top/https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh`,
  "curl … raw.github … | sh → raw URL gets mirror prefix",
)

assertEq(
  rewriteRawMirror("https://raw.githubusercontent.com/foo/bar/baz.txt"),
  `https://ghfast.top/https://raw.githubusercontent.com/foo/bar/baz.txt`,
  "bare raw URL → mirror prefix prepended",
)

// Two raw URLs in one command — both rewritten
const MULTI = "curl https://raw.githubusercontent.com/a/b/c.sh -o /tmp/c.sh && curl https://raw.githubusercontent.com/x/y/z.sh -o /tmp/z.sh"
assertEq(
  rewriteRawMirror(MULTI),
  "curl https://ghfast.top/https://raw.githubusercontent.com/a/b/c.sh -o /tmp/c.sh && curl https://ghfast.top/https://raw.githubusercontent.com/x/y/z.sh -o /tmp/z.sh",
  "multiple raw URLs in one command → all rewritten",
)

console.log("\nrewriteRawMirror — does NOT touch github.com release URLs")

// The Windows rtk install hits github.com releases (not raw). It must be
// left alone by OCP_RAW_MIRROR — those URLs go through OCP_RELEASE_MIRROR.
const WIN_RTK =
  "Invoke-WebRequest -Uri 'https://github.com/rtk-ai/rtk/releases/latest/download/rtk-x86_64-pc-windows-msvc.zip' -OutFile rtk.zip"
assertEq(
  rewriteRawMirror(WIN_RTK),
  WIN_RTK,
  "github.com release URL alongside raw → only raw is touched",
)

console.log("\nrewriteRawMirror — shell quoting is preserved")

// Single-quoted URL: regex must NOT eat the closing quote.
const QUOTED = "iwr 'https://raw.githubusercontent.com/x/y/install.ps1' -useb | iex"
assertEq(
  rewriteRawMirror(QUOTED),
  `iwr 'https://ghfast.top/https://raw.githubusercontent.com/x/y/install.ps1' -useb | iex`,
  "single-quoted URL → closing quote preserved",
)

console.log("\nrewriteRawMirror — trailing slash on mirror prefix")

process.env.OCP_RAW_MIRROR = "https://ghfast.top/"
assertEq(
  rewriteRawMirror(RTK_CMD),
  `curl -fsSL https://ghfast.top/https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh`,
  "trailing slash on mirror → single /, not double",
)

process.env.OCP_RAW_MIRROR = ""
assertEq(
  rewriteRawMirror(RTK_CMD),
  RTK_CMD,
  "empty string env var treated as unset → command unchanged",
)

// Cleanup: don't leak env into other tests.
delete process.env.OCP_RAW_MIRROR

// ─── apiMirrorUrls — api.github.com mirror ─────────────────────────────

console.log("\napiMirrorUrls — same shape as rawMirrorUrls, but for api.github.com")

const API_URL =
  "https://api.github.com/repos/anomalyco/opencode/releases/latest"

console.log("\napiMirrorUrls — env unset")

delete process.env.OCP_API_MIRROR

// api URL → unchanged when env unset
assertEq(
  apiMirrorUrls(API_URL),
  [API_URL],
  "api URL with env unset → [api] only",
)

// Non-api URLs are NEVER touched by OCP_API_MIRROR (rawMirrorUrls territory)
assertEq(
  apiMirrorUrls(RAW_URL),
  [RAW_URL],
  "raw.githubusercontent URL with OCP_API_MIRROR unset → [url] only (OCP_RAW_MIRROR territory)",
)
assertEq(
  apiMirrorUrls(GH_RELEASE_URL),
  [GH_RELEASE_URL],
  "github.com release URL with OCP_API_MIRROR unset → [url] only (OCP_RELEASE_MIRROR territory)",
)

console.log("\napiMirrorUrls — env set, mirror first")

process.env.OCP_API_MIRROR = "https://ghfast.top"

// api URL → mirror first, official second (CN-friendly)
assertEq(
  apiMirrorUrls(API_URL),
  [`https://ghfast.top/${API_URL}`, API_URL],
  "api URL with env set → [mirror, official] (mirror first)",
)

// Non-api URLs are NEVER touched even when env is set (separate domains
// have separate env vars — never overload one variable to cover all)
assertEq(
  apiMirrorUrls(RAW_URL),
  [RAW_URL],
  "raw.githubusercontent URL with OCP_API_MIRROR set → [url] only (OCP_RAW_MIRROR territory)",
)
assertEq(
  apiMirrorUrls(GH_RELEASE_URL),
  [GH_RELEASE_URL],
  "github.com release URL with OCP_API_MIRROR set → [url] only",
)

console.log("\napiMirrorUrls — trailing slash handling")

process.env.OCP_API_MIRROR = "https://ghfast.top/"
assertEq(
  apiMirrorUrls(API_URL),
  [`https://ghfast.top/${API_URL}`, API_URL],
  "trailing slash on mirror prefix is stripped",
)

// Cleanup: don't leak env into other tests.
delete process.env.OCP_API_MIRROR

// ─── rewriteReleaseMirror — github.com release-asset URLs ──────────────

console.log("\nrewriteReleaseMirror — env unset (no-op)")

delete process.env.OCP_RELEASE_MIRROR

// The Windows rtk install command (one-liner, hard to read in JSONC; this
// is the real shape from install/tools.jsonc:46,55):
const WIN_RTK_CMD =
  "$cmd=Get-Command rtk -ErrorAction SilentlyContinue; $dst=if($cmd){$cmd.Source}else{Join-Path $env:USERPROFILE '.local\\bin\\rtk.exe'}; $dir=Split-Path $dst; if(-not (Test-Path $dir)){New-Item -ItemType Directory -Path $dir -Force|Out-Null}; $tmp=Join-Path $env:TEMP ([Guid]::NewGuid().ToString('N').Substring(0,8)); New-Item -ItemType Directory -Path $tmp -Force|Out-Null; try{$zip=Join-Path $tmp 'rtk.zip'; Invoke-WebRequest -Uri 'https://github.com/rtk-ai/rtk/releases/latest/download/rtk-x86_64-pc-windows-msvc.zip' -OutFile $zip -UseBasicParsing; Expand-Archive -Path $zip -DestinationPath $tmp -Force; Copy-Item -Path (Join-Path $tmp 'rtk.exe') -Destination $dst -Force} finally{Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue}"

assertEq(
  rewriteReleaseMirror(WIN_RTK_CMD),
  WIN_RTK_CMD,
  "Windows rtk install with env unset → unchanged",
)
assertEq(
  rewriteReleaseMirror("echo hello"),
  "echo hello",
  "command with no URL with env unset → unchanged",
)

console.log("\nrewriteReleaseMirror — env set, github.com release URLs rewritten")

process.env.OCP_RELEASE_MIRROR = "https://ghfast.top"

assertEq(
  rewriteReleaseMirror(
    "Invoke-WebRequest -Uri 'https://github.com/rtk-ai/rtk/releases/latest/download/rtk.zip' -OutFile rtk.zip",
  ),
  "Invoke-WebRequest -Uri 'https://ghfast.top/https://github.com/rtk-ai/rtk/releases/latest/download/rtk.zip' -OutFile rtk.zip",
  "Windows rtk release URL → mirror prefix prepended (single quote preserved)",
)

console.log("\nrewriteReleaseMirror — does NOT touch non-release github.com URLs")

// The regex requires `/releases/` so plain repo URLs, /blob/, /raw/ etc.
// are left alone — they're not release assets and don't need mirroring.
assertEq(
  rewriteReleaseMirror(
    "git clone https://github.com/rtk-ai/rtk",
  ),
  "git clone https://github.com/rtk-ai/rtk",
  "github.com project URL (no /releases/) → untouched",
)
assertEq(
  rewriteReleaseMirror(
    "curl -L https://github.com/rtk-ai/rtk/raw/main/README.md",
  ),
  "curl -L https://github.com/rtk-ai/rtk/raw/main/README.md",
  "github.com /raw/ URL (not /releases/) → untouched",
)
assertEq(
  rewriteReleaseMirror(
    "curl -L https://github.com/rtk-ai/rtk/blob/main/README.md",
  ),
  "curl -L https://github.com/rtk-ai/rtk/blob/main/README.md",
  "github.com /blob/ URL (not /releases/) → untouched",
)

// api.github.com and raw.githubusercontent.com are NOT github.com
// release URLs — separate env vars handle them. Don't overload.
assertEq(
  rewriteReleaseMirror(
    "fetch https://api.github.com/repos/x/y/releases/latest",
  ),
  "fetch https://api.github.com/repos/x/y/releases/latest",
  "api.github.com URL → untouched (OCP_API_MIRROR territory, even though path contains /releases/)",
)
assertEq(
  rewriteReleaseMirror(
    "curl https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh",
  ),
  "curl https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh",
  "raw.githubusercontent.com URL → untouched (OCP_RAW_MIRROR territory)",
)

console.log("\nrewriteReleaseMirror — edge cases")

process.env.OCP_RELEASE_MIRROR = "https://ghfast.top/"
assertEq(
  rewriteReleaseMirror(
    "curl https://github.com/x/y/releases/latest/download/file.zip -o f.zip",
  ),
  "curl https://ghfast.top/https://github.com/x/y/releases/latest/download/file.zip -o f.zip",
  "trailing slash on mirror prefix stripped before prepending",
)

process.env.OCP_RELEASE_MIRROR = ""
assertEq(
  rewriteReleaseMirror(WIN_RTK_CMD),
  WIN_RTK_CMD,
  "empty string env var treated as unset → command unchanged",
)

// Cleanup
delete process.env.OCP_RELEASE_MIRROR

// ─── Combined rewrite — both rewriters in sequence ─────────────────────
// Verifies the real runInstallCommand pipeline: chained rewriteRawMirror
// + rewriteReleaseMirror on a hypothetical command that has BOTH URL
// classes. Each rewriter targets a non-overlapping domain so they must
// both fire.

console.log("\nChained rewrite — both raw.github and github.com releases in one cmd")

// Set BOTH mirror env vars so each rewriter fires.
process.env.OCP_RAW_MIRROR = "https://ghfast.top"
process.env.OCP_RELEASE_MIRROR = "https://ghfast.top"

const MIXED =
  "curl -fsSL https://raw.githubusercontent.com/x/y/install.sh -o /tmp/i.sh && Invoke-WebRequest -Uri 'https://github.com/x/y/releases/latest/download/binary.zip' -OutFile b.zip"
const MIXED_EXPECTED =
  "curl -fsSL https://ghfast.top/https://raw.githubusercontent.com/x/y/install.sh -o /tmp/i.sh && Invoke-WebRequest -Uri 'https://ghfast.top/https://github.com/x/y/releases/latest/download/binary.zip' -OutFile b.zip"

let chained = rewriteRawMirror(MIXED)
chained = rewriteReleaseMirror(chained)
assertEq(
  chained,
  MIXED_EXPECTED,
  "chained rewriters: both raw and release URLs rewritten, neither stomps on the other",
)

// And installCommandSequence should produce a fallback because the chained
// output differs from the original (at least one rewrite actually fired).
assertEq(
  installCommandSequence(chained, MIXED, true),
  { primary: chained, fallback: MIXED },
  "installCommandSequence: at least one mirror env set + chained differs from original → fallback to original",
)

// Cleanup
delete process.env.OCP_RAW_MIRROR
delete process.env.OCP_RELEASE_MIRROR

// ─── installCommandSequence — fallback orchestration ────────────────────

console.log("\ninstallCommandSequence — fallback orchestration")

// env unset → mirror is a no-op, run original once
assertEq(
  installCommandSequence("rewritten-cmd", "original-cmd", false),
  { primary: "original-cmd", fallback: null },
  "env unset → primary=original, fallback=null (no second try)",
)

// env set + rewrite actually changed the command → try rewritten first,
// fall back to original on failure (the headline user request: "mirror
// might be down, please fall back to raw.githubusercontent.com").
assertEq(
  installCommandSequence(
    "curl -fsSL https://ghfast.top/https://raw.githubusercontent.com/foo.sh | sh",
    "curl -fsSL https://raw.githubusercontent.com/foo.sh | sh",
    true,
  ),
  {
    primary:
      "curl -fsSL https://ghfast.top/https://raw.githubusercontent.com/foo.sh | sh",
    fallback: "curl -fsSL https://raw.githubusercontent.com/foo.sh | sh",
  },
  "env set + rewrite changed cmd → primary=rewritten, fallback=original",
)

// env set but rewrite was a no-op (no raw.githubusercontent.com URL in
// the command — e.g. github.com release URL) → don't retry the same
// command twice. The "rewrite" string is identical to "original".
assertEq(
  installCommandSequence("same-cmd", "same-cmd", true),
  { primary: "same-cmd", fallback: null },
  "env set but rewrite was no-op → no fallback (avoid duplicate exec)",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)