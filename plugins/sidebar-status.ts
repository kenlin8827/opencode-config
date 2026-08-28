/// <reference types="bun" />
/**
 * Sidebar Status — TUI slot plugin that renders a vertical status group
 * inside the OpenCode right sidebar, showing the active state of all
 * guard/mode plugins (adr-guard, e2e-guard, auto-advisor, deepseek-anchor).
 *
 * This replaces the per-plugin session.created announce (toast/inject) with
 * a single always-visible "OCP" section. When a user toggles a guard via
 * its slash command, the panel picks up the change on the next poll cycle
 * (the server-side plugin still fires a confirmation toast for the toggle).
 *
 * Registration: `tui.json` → `plugin` array (TUI plugins have no directory
 * auto-discovery — they must be listed there).
 *
 * Slot: `sidebar_content` (session view) — renders as a vertical group
 * labeled "OCP" inside the right sidebar, mirroring the MCP/LSP section
 * style already used by OpenCode's sidebar.
 *
 * State sources (all read-only, same logic as each plugin's config module):
 *   - adrGuard        → project opencode.jsonc field (on | off, default off)
 *   - e2eGuard        → project opencode.jsonc field (on | off, default off)
 *   - autoAdvisorMode → project opencode.jsonc field (off | lite | full, default off)
 *   - deepSeekAnchor  → ~/.config/opencode/.deepseek-anchor-enabled (on | off, default on)
 *
 * The panel always shows all four plugin badges — ON or OFF — so the user
 * can see the full configuration at a glance. The color (variant)
 * signals urgency: warning = active/guarding, info = idle/default.
 */

import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
  TuiSlotContext,
} from "@opencode-ai/plugin/tui"
import { createSignal } from "solid-js"
// Programmatically create JSX elements via the SolidJS factory.
// We use `jsx()` instead of JSX syntax to avoid tsconfig jsxImportSource
// complications — the @opentui/solid JSX namespace is local, not global.
import { jsx } from "@opentui/solid/jsx-runtime"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

// ─── Theme shape ───────────────────────────────────────────────────

interface ThemeColors {
  warning: unknown
  info: unknown
  success: unknown
  textMuted: unknown
  borderSubtle: unknown
  text: unknown
  backgroundPanel: unknown
  border: unknown
}

// ─── Types ───────────────────────────────────────────────────────────

interface Badge {
  label: string
  state: string
  variant: "warning" | "info" | "success"
}

// ─── Config readers (mirror each plugin's config module) ────────────

/** Strip JSONC comments so project .jsonc files can be JSON.parsed. */
function stripJsonc(raw: string): string {
  return stripTrailingCommas(stripComments(raw))
}

function stripComments(raw: string): string {
  let result = ""
  let i = 0
  const len = raw.length
  let state: "normal" | "string" | "lineComment" | "blockComment" = "normal"
  while (i < len) {
    const c = raw[i]
    const next = i + 1 < len ? raw[i + 1] : ""
    switch (state) {
      case "normal":
        if (c === '"') { result += c; state = "string" }
        else if (c === "/" && next === "/") { state = "lineComment"; i++ }
        else if (c === "/" && next === "*") { state = "blockComment"; i++ }
        else { result += c }
        break
      case "string":
        result += c
        if (c === "\\") { i++; if (i < len) result += raw[i] }
        else if (c === '"') { state = "normal" }
        break
      case "lineComment":
        if (c === "\n") { result += c; state = "normal" }
        break
      case "blockComment":
        if (c === "*" && next === "/") { state = "normal"; i++ }
        break
    }
    i++
  }
  return result
}

function stripTrailingCommas(src: string): string {
  let result = ""
  let inString = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inString) {
      result += c
      if (c === "\\") { if (i + 1 < src.length) result += src[++i] }
      else if (c === '"') { inString = false }
      continue
    }
    if (c === '"') { inString = true; result += c; continue }
    if (c === ",") {
      let j = i + 1
      while (j < src.length && /\s/.test(src[j])) j++
      if (j < src.length && (src[j] === "}" || src[j] === "]")) continue
    }
    result += c
  }
  return result
}

function projectConfigFiles(projectDir: string): string[] {
  return [
    join(projectDir, ".opencode", "opencode.jsonc"),
    join(projectDir, ".opencode", "opencode.json"),
    join(projectDir, "opencode.jsonc"),
    join(projectDir, "opencode.json"),
  ]
}

function readProjectConfig(projectDir: string): Record<string, unknown> | null {
  for (const path of projectConfigFiles(projectDir)) {
    if (!existsSync(path)) continue
    try {
      return JSON.parse(stripJsonc(readFileSync(path, "utf-8")))
    } catch {
      // try next
    }
  }
  return null
}

// ─── State resolvers ────────────────────────────────────────────────

function normalizeOnOff(v: unknown): "on" | "off" | null {
  if (typeof v === "boolean") return v ? "on" : "off"
  if (typeof v !== "string") return null
  const s = v.trim().toLowerCase()
  if (["on", "enabled", "true"].includes(s)) return "on"
  if (["off", "disabled", "false"].includes(s)) return "off"
  return null
}

function resolveAdrGuard(projectDir: string): "on" | "off" {
  return normalizeOnOff(readProjectConfig(projectDir)?.adrGuard) ?? "off"
}

function resolveE2eGuard(projectDir: string): "on" | "off" {
  return normalizeOnOff(readProjectConfig(projectDir)?.e2eGuard) ?? "off"
}

function resolveAutoAdvisor(projectDir: string): "off" | "lite" | "full" {
  const cfg = readProjectConfig(projectDir)
  const raw = cfg?.autoAdvisorMode ?? cfg?.advisorMode
  if (typeof raw !== "string") return "off"
  const m = raw.trim().toLowerCase()
  if (["full", "decisive"].includes(m)) return "full"
  if (["lite", "advisory"].includes(m)) return "lite"
  return "off"
}

function resolveDeepSeekAnchor(): "on" | "off" {
  const stateFile = join(homedir(), ".config", "opencode", ".deepseek-anchor-enabled")
  if (existsSync(stateFile)) {
    try {
      const m = normalizeOnOff(readFileSync(stateFile, "utf-8"))
      if (m) return m
    } catch { /* fall through */ }
  }
  const globalCfg = join(homedir(), ".config", "opencode", "opencode.jsonc")
  if (existsSync(globalCfg)) {
    try {
      const cfg = JSON.parse(stripJsonc(readFileSync(globalCfg, "utf-8")))
      const m = normalizeOnOff(cfg?.deepSeekAnchor)
      if (m) return m
    } catch { /* fall through */ }
  }
  return "on"
}

// ─── Badge builders ─────────────────────────────────────────────────

function buildBadges(projectDir: string): Badge[] {
  const badges: Badge[] = []

  // Always show all four plugin states — ON or OFF — so the user
  // can see the full configuration at a glance.
  const adr = resolveAdrGuard(projectDir)
  badges.push({ label: "adr-guard", state: adr.toUpperCase(), variant: adr === "on" ? "warning" : "info" })

  const e2e = resolveE2eGuard(projectDir)
  badges.push({ label: "e2e-guard", state: e2e.toUpperCase(), variant: e2e === "on" ? "warning" : "info" })

  const advisor = resolveAutoAdvisor(projectDir)
  badges.push({ label: "auto-advisor", state: advisor.toUpperCase(), variant: advisor === "full" ? "warning" : advisor === "lite" ? "info" : "info" })

  const ds = resolveDeepSeekAnchor()
  badges.push({ label: "deepseek-anchor", state: ds.toUpperCase(), variant: ds === "on" ? "info" : "warning" })

  return badges
}

// ─── Slot renderer (programmatic JSX via jsx()) ─────────────────────

/**
 * Build a vertical status panel JSX tree.
 * Layout:
 *   ┌─ OCP ─────────────────────┐
 *   │ ● adr-guard    ON          │
 *   │ ● e2e-guard    OFF         │
 *   │ ● auto-advisor OFF         │
 *   │ ● deepseek-anchor ON      │
 *   └───────────────────────────┘
 *
 * Mirrors the sidebar section style used by MCP/LSP groups.
 */
function renderStatusPanel(badges: Badge[], theme: ThemeColors, version: string): unknown {
  if (badges.length === 0) return null

  // Build one row per badge — each row is a <box> containing a status dot
  // and a <text> with label + state.
  const rows: unknown[] = badges.map((b) => {
    const isActive = b.variant === "warning" || b.variant === "success"
    const dotColor =
      b.variant === "warning" ? theme.warning :
      b.variant === "success" ? theme.success :
      theme.info
    const stateColor =
      b.variant === "warning" ? theme.warning :
      b.variant === "success" ? theme.success :
      theme.textMuted

    return jsx("box", {
      style: { flexDirection: "row", paddingLeft: 1, height: 1 },
      children: [
        // Status dot
        jsx("text", {
          style: { color: dotColor },
          children: jsx("span", { children: isActive ? "● " : "○ " }),
        }),
        // Label (muted)
        jsx("text", {
          style: { color: theme.textMuted },
          children: jsx("span", { children: b.label.padEnd(14) }),
        }),
        // State value
        jsx("text", {
          style: { color: stateColor },
          children: jsx("span", { children: b.state }),
        }),
      ],
    })
  })

  // Section header row: "─ OCP v0.7.3 ─"
  // Version comes from ~/.config/opencode/installed.version (written by installer).
  const header = jsx("box", {
    style: { paddingLeft: 1, height: 1 },
    children: jsx("text", {
      style: { color: theme.borderSubtle },
      children: [
        jsx("span", { children: `─ OCP v${version} ─` }),
      ],
    }),
  })

  // Combine header + rows in a vertical container
  return jsx("box", {
    style: { flexDirection: "column", paddingTop: 0, paddingBottom: 0 },
    children: [header, ...rows],
  })
}

// ─── Plugin entry ──────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000

const tui: TuiPlugin = async (api: TuiPluginApi) => {
  // Poll config files because slash-command toggles write to disk
  // asynchronously — there is no server→TUI event for "config field changed".
  // A 2s interval is cheap (4 small file reads) and keeps the panel snappy.
  const [badges, setBadges] = createSignal<Badge[]>([])
  const projectDir = api.state.path.directory || process.cwd()

  const refresh = () => {
    try {
      setBadges(buildBadges(projectDir))
    } catch {
      // Never crash the TUI — a config read error just means no badges.
    }
  }

  // Read OCP version from installed.version (written by the installer to
  // the config directory, e.g. ~/.config/opencode/installed.version).
  const configDir = api.state.path.config
  const versionFile = join(configDir, "installed.version")
  let ocpVersion = "unknown"
  try {
    if (existsSync(versionFile)) {
      ocpVersion = readFileSync(versionFile, "utf-8").trim()
    }
  } catch { /* ignore */ }

  refresh()
  const timer = setInterval(refresh, POLL_INTERVAL_MS)

  // Also refresh when a new session is created (user may have toggled
  // a guard just before opening a new session).
  const offSessionCreated = api.event.on("session.created", () => refresh())

  // Register into sidebar_content so the OCP group appears as a vertical
  // section inside the right sidebar, just like the MCP/LSP groups.
  const renderFn = (ctx: Readonly<TuiSlotContext>) => {
    return renderStatusPanel(badges(), {
      warning: ctx.theme.current.warning,
      info: ctx.theme.current.info,
      success: ctx.theme.current.success,
      textMuted: ctx.theme.current.textMuted,
      borderSubtle: ctx.theme.current.borderSubtle,
      text: ctx.theme.current.text,
      backgroundPanel: ctx.theme.current.backgroundPanel,
      border: ctx.theme.current.border,
    }, ocpVersion)
  }

  api.slots.register({
    slots: {
      sidebar_content: (ctx: Readonly<TuiSlotContext>, _props: { session_id: string }) => {
        return renderFn(ctx)
      },
    },
  })

  // Cleanup on plugin dispose.
  api.lifecycle.onDispose(() => {
    clearInterval(timer)
    offSessionCreated()
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "sidebar-status",
  tui,
}

export default plugin
