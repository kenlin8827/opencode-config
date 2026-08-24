/// <reference types="bun" />
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CONFIG_REL,
  getProjectDir,
  setProjectDir,
} from "./project-manager/project-manager-config"
import {
  planIndexBackends,
  planInitBackends,
  probeBackends,
  runBackends,
  type BackendResult,
} from "./project-manager/project-manager-index"
import {
  applySwitchesToConfigContent,
  generateConfigContent,
  runInitWithSwitches,
  runSync,
  type ProjectSwitches,
  type ScaffoldResult,
  type SyncResult,
} from "./project-manager/project-manager-scaffold"

/**
 * Project Wizard — TUI dialog-based project initialization and switch configuration.
 *
 * Menu selection flow:
 *   - Each switch opens a dedicated Select dialog with clear choices.
 *   - Built-in `skipFilter: true` ensures pure direction-key selection (no typing required).
 *   - When the project already exists, loads existing configuration and echoes
 *     the active/commented switches in the dialog.
 *
 * Registered via `tui.json` → `plugin` array.
 */

const PLUGIN_ID = "opencode-config.project-wizard"
const SLASH_NAME = "project"

function toast(
  api: TuiPluginApi,
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
): void {
  void api.ui.showToast({ message, variant })
}

export interface DetectedProjectState {
  exists: boolean
  configPath?: string
  configRelPath?: string
  switches: ProjectSwitches
}

/** Toggle helper for on/off/default boolean-like switches. */
export function toggleGuardState(
  current?: "on" | "off" | "default",
): "on" | "off" | "default" {
  if (current === "on") return "off"
  if (current === "off") return "default"
  return "on"
}

/** Cycle helper for autoAdvisorMode (lite -> full -> off -> default -> lite). */
export function cycleAdvisorMode(
  current?: "off" | "lite" | "full" | "default",
): "off" | "lite" | "full" | "default" {
  if (current === "lite") return "full"
  if (current === "full") return "off"
  if (current === "off") return "default"
  return "lite"
}

/** Detect initial switch values from existing project config or defaults. */
export function detectCurrentSwitches(rootDir: string): DetectedProjectState {
  const candidatePaths = [
    { rel: ".opencode/opencode.jsonc", abs: join(rootDir, ".opencode", "opencode.jsonc") },
    { rel: "opencode.jsonc", abs: join(rootDir, "opencode.jsonc") },
  ]

  for (const candidate of candidatePaths) {
    if (!existsSync(candidate.abs)) continue
    try {
      const content = readFileSync(candidate.abs, "utf-8")
      const advisorActive = content.match(/^[^/\n\r]*"autoAdvisorMode"\s*:\s*"([^"]+)"/m)
      const adrActive = content.match(/^[^/\n\r]*"adrGuard"\s*:\s*"([^"]+)"/m)
      const envActive = content.match(/^[^/\n\r]*"envGuard"\s*:\s*"([^"]+)"/m)
      const e2eActive = content.match(/^[^/\n\r]*"e2eGuard"\s*:\s*"([^"]+)"/m)
      const adrDirMatch = content.match(/^\s*(?:\/\/)?\s*"adrGuardDir"\s*:\s*"([^"]+)"/m)
      const adrModeMatch = content.match(/^[^/\n\r]*"adrMode"\s*:\s*"([^"]+)"/m)

      return {
        exists: true,
        configPath: candidate.abs,
        configRelPath: candidate.rel,
        switches: {
          autoAdvisorMode: advisorActive
            ? (advisorActive[1] as ProjectSwitches["autoAdvisorMode"])
            : "default",
          adrGuard: adrActive
            ? (adrActive[1] as ProjectSwitches["adrGuard"])
            : "default",
          adrGuardDir: adrDirMatch ? adrDirMatch[1] : "docs/adr",
          adrMode: adrModeMatch
            ? (adrModeMatch[1] as ProjectSwitches["adrMode"])
            : "default",
          envGuard: envActive
            ? (envActive[1] as ProjectSwitches["envGuard"])
            : "default",
          e2eGuard: e2eActive
            ? (e2eActive[1] as ProjectSwitches["e2eGuard"])
            : "default",
        },
      }
    } catch {
      // Fall through if file read fails
    }
  }

  // No existing config: default initial preset
  return {
    exists: false,
    switches: {
      autoAdvisorMode: "lite",
      adrGuard: "on",
      adrGuardDir: "docs/adr",
      adrMode: "auto",
      envGuard: "on",
      e2eGuard: "on",
    },
  }
}

function formatGuardBadge(val?: "on" | "off" | "default"): string {
  if (val === "on") return "🟢 ON (active)"
  if (val === "off") return "🔴 OFF (disabled)"
  return "⚪ default (off)"
}

function formatAdrModeBadge(val?: "auto" | "flat" | "hierarchical" | "default"): string {
  if (val === "auto") return "🟢 auto (smart adaptive)"
  if (val === "flat") return "📄 flat (single dir)"
  if (val === "hierarchical") return "📦 hierarchical (multi-tier)"
  return "⚪ default (auto)"
}

function formatAdvisorBadge(val?: "off" | "lite" | "full" | "default"): string {
  if (val === "lite") return "🟢 LITE (advisory - recommended)"
  if (val === "full") return "🔵 FULL (decisive)"
  if (val === "off") return "🔴 OFF (disabled)"
  return "⚪ default (off)"
}



function backendLine(r: BackendResult): string {
  if (r.status === "ran") return `  ✅ ${r.backend}: ${r.detail}`
  if (r.status === "failed") return `  ❌ ${r.backend}: ${r.detail}`
  return `  ⏭️ ${r.backend}: skipped — ${r.detail}`
}

function initReport(results: ScaffoldResult[], backends: BackendResult[]): string {
  const lines = results.map((r) => {
    if (r.status === "created") return `  ✅ created ${r.relPath}`
    if (r.status === "updated") return `  ♻️ updated ${r.relPath} (switches updated, existing content preserved)`
    if (r.status === "invalid") return `  ⚠️ ${r.relPath} is malformed`
    return `  ⏭️ skipped ${r.relPath} (already exists)`
  })
  return `[project-manager] Completed in ${getProjectDir()}\n\nFiles:\n${lines.join("\n")}\n\nBackends:\n${backends.map(backendLine).join("\n")}`
}

export function startProjectWizard(
  api: TuiPluginApi,
  stateOverride?: { switches: ProjectSwitches; exists: boolean; configRelPath?: string; currentSelection?: string },
): void {
  const rootDir = process.cwd()
  setProjectDir(rootDir)

  const detected = detectCurrentSwitches(rootDir)
  const isExisting = stateOverride ? stateOverride.exists : detected.exists
  const configRel = stateOverride ? stateOverride.configRelPath : detected.configRelPath
  const current: ProjectSwitches = stateOverride ? stateOverride.switches : detected.switches
  const activeSelection = stateOverride?.currentSelection ?? "__apply_init__"

  const dialogTitle = isExisting
    ? `Project Setup — Existing Config Loaded (${configRel ?? ".opencode/opencode.jsonc"})`
    : "Project Setup — Initialize New Project"

  const mainActionTitle = isExisting
    ? "🚀 [ Apply & Update Project Configuration ]"
    : "🚀 [ Apply & Initialize Project ]"

  const mainActionDesc = isExisting
    ? "Save current switch settings into existing config without touching other fields"
    : "Create baseline files (.opencode/opencode.jsonc, AGENTS.md, etc.) and run backend init"

  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: dialogTitle,
      placeholder: "Select an option to review or configure (Esc cancels)",
      skipFilter: true,
      current: activeSelection,
      options: [
        {
          title: mainActionTitle,
          value: "__apply_init__",
          description: mainActionDesc,
        },
        {
          title: `🤖 autoAdvisorMode: [ ${formatAdvisorBadge(current.autoAdvisorMode)} ]`,
          value: "__switch_advisor__",
          description: "Click to select advisor mode: lite / full / off / default",
        },
        {
          title: `🛡️ adrGuard: [ ${formatGuardBadge(current.adrGuard)} ]`,
          value: "__switch_adr__",
          description: "Click to select ADR guard state: on / off / default",
        },
        {
          title: `📁 adrGuardDir: [ ${current.adrGuardDir ?? "docs/adr"} ]`,
          value: "__switch_adr_dir__",
          description: "Click to select or customize ADR directory path",
        },
        {
          title: `🏛️ adrMode: [ ${formatAdrModeBadge(current.adrMode)} ]`,
          value: "__switch_adr_mode__",
          description: "Click to select ADR mode: auto / flat / hierarchical / default",
        },
        {
          title: `🔒 envGuard: [ ${formatGuardBadge(current.envGuard)} ]`,
          value: "__switch_env__",
          description: "Click to select secret env file guard: on / off / default",
        },
        {
          title: `🧪 e2eGuard: [ ${formatGuardBadge(current.e2eGuard)} ]`,
          value: "__switch_e2e__",
          description: "Click to select E2E assessment guard: on / off / default",
        },
        {
          title: "🔄 [ Sync Existing Config Switches ]",
          value: "__sync__",
          description: "Append any new template switch lines into existing config without overwriting",
        },
        {
          title: "⚡ [ Run Code Index Refresh ]",
          value: "__index__",
          description: "Trigger incremental index catch-up (codegraph sync, gitnexus analyze)",
        },
      ],
      onSelect: async (option) => {
        const nextState = { switches: current, exists: isExisting, configRelPath: configRel }
        switch (option.value) {
          case "__apply_init__": {
            try {
              const results = runInitWithSwitches(current)
              const probe = probeBackends(rootDir)
              const backends = await runBackends(planInitBackends(probe), rootDir).catch(
                (e): BackendResult[] => [
                  { backend: "codegraph", status: "failed", detail: String(e) },
                ],
              )
              const report = initReport(results, backends)
              toast(
                api,
                isExisting ? "Project configuration updated!" : "Project initialized successfully!",
                "success",
              )
              api.ui.dialog.replace(() =>
                api.ui.DialogAlert({
                  title: isExisting ? "Project Update Result" : "Project Initialization Result",
                  message: report,
                  onConfirm: () => api.ui.dialog.clear(),
                }),
              )
            } catch (err) {
              toast(api, `Init/Update failed: ${(err as Error).message}`, "error")
              api.ui.dialog.clear()
            }
            break
          }
          case "__switch_advisor__": {
            api.ui.dialog.replace(() =>
              api.ui.DialogSelect<string>({
                title: "Select autoAdvisorMode",
                placeholder: `Current: ${current.autoAdvisorMode === "default" ? "default (off)" : (current.autoAdvisorMode ?? "default (off)")}`,
                skipFilter: true,
                current: current.autoAdvisorMode ?? "lite",
                options: [
                  {
                    title: `🟢 lite  (Recommended)${current.autoAdvisorMode === "lite" ? "  ← current" : ""}`,
                    value: "lite",
                    description: "Advisor provides insights to user; never decides on user's behalf",
                  },
                  {
                    title: `🔵 full  (Decisive)${current.autoAdvisorMode === "full" ? "  ← current" : ""}`,
                    value: "full",
                    description: "Advisor answers factual questions on user's behalf when confidence ≥ 8",
                  },
                  {
                    title: `🔴 off  (Explicitly disabled)${current.autoAdvisorMode === "off" ? "  ← current" : ""}`,
                    value: "off",
                    description: "Disable advisor completely",
                  },
                  {
                    title: `⚪ default  (Built-in off)${current.autoAdvisorMode === "default" || !current.autoAdvisorMode ? "  ← current" : ""}`,
                    value: "default",
                    description: "Leave switch commented in config (default off)",
                  },
                ],
                onSelect: (sel) => {
                  current.autoAdvisorMode = sel.value as ProjectSwitches["autoAdvisorMode"]
                  startProjectWizard(api, {
                    ...nextState,
                    currentSelection: "__switch_advisor__",
                  })
                },
              }),
            )
            break
          }
          case "__switch_adr__": {
            api.ui.dialog.replace(() =>
              api.ui.DialogSelect<string>({
                title: "Select adrGuard state",
                placeholder: `Current: ${current.adrGuard === "default" ? "default (off)" : (current.adrGuard ?? "default (off)")}`,
                skipFilter: true,
                current: current.adrGuard ?? "on",
                options: [
                  {
                    title: `🟢 on  (Active)${current.adrGuard === "on" ? "  ← current" : ""}`,
                    value: "on",
                    description: "Enforce ADR change check on feat / refactor commits",
                  },
                  {
                    title: `🔴 off  (Explicitly disabled)${current.adrGuard === "off" ? "  ← current" : ""}`,
                    value: "off",
                    description: "Disable ADR guard check",
                  },
                  {
                    title: `⚪ default  (Built-in off)${current.adrGuard === "default" || !current.adrGuard ? "  ← current" : ""}`,
                    value: "default",
                    description: "Leave switch commented in config (default off)",
                  },
                ],
                onSelect: (sel) => {
                  current.adrGuard = sel.value as ProjectSwitches["adrGuard"]
                  startProjectWizard(api, {
                    ...nextState,
                    currentSelection: "__switch_adr__",
                  })
                },
              }),
            )
            break
          }
          case "__switch_adr_dir__": {
            api.ui.dialog.replace(() =>
              api.ui.DialogSelect<string>({
                title: "Select ADR Directory (adrGuardDir)",
                placeholder: `Current: ${current.adrGuardDir ?? "docs/adr"} (Use arrow keys to select)`,
                skipFilter: true,
                current: current.adrGuardDir ?? "docs/adr",
                options: [
                  {
                    title: `📁 docs/adr  (Default)${(current.adrGuardDir ?? "docs/adr") === "docs/adr" ? "  ← current" : ""}`,
                    value: "docs/adr",
                    description: "Standard docs/adr/ directory",
                  },
                  {
                    title: `📁 docs/decisions${current.adrGuardDir === "docs/decisions" ? "  ← current" : ""}`,
                    value: "docs/decisions",
                    description: "docs/decisions/ directory",
                  },
                  {
                    title: `📁 architecture/decisions${current.adrGuardDir === "architecture/decisions" ? "  ← current" : ""}`,
                    value: "architecture/decisions",
                    description: "architecture/decisions/ directory",
                  },
                  {
                    title: "✍️ [ Enter Custom Path... ]",
                    value: "__custom__",
                    description: "Type a custom directory path if needed",
                  },
                ],
                onSelect: (dirOpt) => {
                  if (dirOpt.value === "__custom__") {
                    api.ui.dialog.replace(() =>
                      api.ui.DialogPrompt({
                        title: "Custom ADR Directory",
                        placeholder: "e.g. docs/adr",
                        value: current.adrGuardDir ?? "docs/adr",
                        onConfirm: (val) => {
                          current.adrGuardDir = val.trim() || "docs/adr"
                          startProjectWizard(api, {
                            ...nextState,
                            currentSelection: "__switch_adr_dir__",
                          })
                        },
                        onCancel: () =>
                          startProjectWizard(api, {
                            ...nextState,
                            currentSelection: "__switch_adr_dir__",
                          }),
                      }),
                    )
                  } else {
                    current.adrGuardDir = dirOpt.value
                    startProjectWizard(api, {
                      ...nextState,
                      currentSelection: "__switch_adr_dir__",
                    })
                  }
                },
              }),
            )
            break
          }
          case "__switch_adr_mode__": {
            api.ui.dialog.replace(() =>
              api.ui.DialogSelect<string>({
                title: "Select adrMode (ADR Governance Mode)",
                placeholder: `Current: ${current.adrMode === "default" ? "default (auto)" : (current.adrMode ?? "default (auto)")}`,
                skipFilter: true,
                current: current.adrMode ?? "auto",
                options: [
                  {
                    title: `🟢 auto  (Smart Adaptive - Recommended)${current.adrMode === "auto" ? "  ← current" : ""}`,
                    value: "auto",
                    description: "Flat by default for monoliths; auto-expands when sub-packages exist",
                  },
                  {
                    title: `📦 hierarchical  (Multi-tier L1/L2/L3)${current.adrMode === "hierarchical" ? "  ← current" : ""}`,
                    value: "hierarchical",
                    description: "Enforce multi-tier hierarchy and cross-module DAG relationships",
                  },
                  {
                    title: `📄 flat  (Strict Single-Directory)${current.adrMode === "flat" ? "  ← current" : ""}`,
                    value: "flat",
                    description: "All ADRs strictly stored in root docs/adr/ (no sub-packages)",
                  },
                  {
                    title: `⚪ default  (Built-in auto)${current.adrMode === "default" || !current.adrMode ? "  ← current" : ""}`,
                    value: "default",
                    description: "Leave switch commented in config (default auto)",
                  },
                ],
                onSelect: (sel) => {
                  current.adrMode = sel.value as ProjectSwitches["adrMode"]
                  startProjectWizard(api, {
                    ...nextState,
                    currentSelection: "__switch_adr_mode__",
                  })
                },
              }),
            )
            break
          }
          case "__switch_env__": {
            api.ui.dialog.replace(() =>
              api.ui.DialogSelect<string>({
                title: "Select envGuard state",
                placeholder: `Current: ${current.envGuard === "default" ? "default (off)" : (current.envGuard ?? "default (off)")}`,
                skipFilter: true,
                current: current.envGuard ?? "on",
                options: [
                  {
                    title: `🟢 on  (Active - Recommended)${current.envGuard === "on" ? "  ← current" : ""}`,
                    value: "on",
                    description: "Blocks agent access to secret .env* files (.env.example exempt)",
                  },
                  {
                    title: `🔴 off  (Explicitly disabled)${current.envGuard === "off" ? "  ← current" : ""}`,
                    value: "off",
                    description: "Allow agent unrestricted access to all env files",
                  },
                  {
                    title: `⚪ default  (Built-in off)${current.envGuard === "default" || !current.envGuard ? "  ← current" : ""}`,
                    value: "default",
                    description: "Leave switch commented in config (default off)",
                  },
                ],
                onSelect: (sel) => {
                  current.envGuard = sel.value as ProjectSwitches["envGuard"]
                  startProjectWizard(api, {
                    ...nextState,
                    currentSelection: "__switch_env__",
                  })
                },
              }),
            )
            break
          }
          case "__switch_e2e__": {
            api.ui.dialog.replace(() =>
              api.ui.DialogSelect<string>({
                title: "Select e2eGuard state",
                placeholder: `Current: ${current.e2eGuard === "default" ? "default (off)" : (current.e2eGuard ?? "default (off)")}`,
                skipFilter: true,
                current: current.e2eGuard ?? "on",
                options: [
                  {
                    title: `🟢 on  (Active - Recommended)${current.e2eGuard === "on" ? "  ← current" : ""}`,
                    value: "on",
                    description: "Evaluate E2E impact on feat/fix & ask user before execution",
                  },
                  {
                    title: `🔴 off  (Explicitly disabled)${current.e2eGuard === "off" ? "  ← current" : ""}`,
                    value: "off",
                    description: "Skip E2E assessment check",
                  },
                  {
                    title: `⚪ default  (Built-in off)${current.e2eGuard === "default" || !current.e2eGuard ? "  ← current" : ""}`,
                    value: "default",
                    description: "Leave switch commented in config (default off)",
                  },
                ],
                onSelect: (sel) => {
                  current.e2eGuard = sel.value as ProjectSwitches["e2eGuard"]
                  startProjectWizard(api, {
                    ...nextState,
                    currentSelection: "__switch_e2e__",
                  })
                },
              }),
            )
            break
          }

          case "__sync__": {
            try {
              const res = runSync()
              if (res.status === "missing") {
                toast(api, "Config file does not exist. Run Init first.", "warning")
              } else if (res.status === "up-to-date") {
                toast(api, "Config is already up to date.", "info")
              } else if (res.status === "added") {
                toast(api, `Appended switches: ${res.added.join(", ")}`, "success")
              } else {
                toast(api, "Config file is invalid/malformed.", "error")
              }
            } catch (err) {
              toast(api, `Sync error: ${(err as Error).message}`, "error")
            }
            api.ui.dialog.clear()
            break
          }
          case "__index__": {
            try {
              const probe = probeBackends(rootDir)
              const results = await runBackends(planIndexBackends(probe), rootDir)
              const msg = results.map(backendLine).join("\n") || "No backends needed index catch-up."
              api.ui.dialog.replace(() =>
                api.ui.DialogAlert({
                  title: "Code Index Results",
                  message: msg,
                  onConfirm: () => api.ui.dialog.clear(),
                }),
              )
            } catch (err) {
              toast(api, `Index failed: ${(err as Error).message}`, "error")
              api.ui.dialog.clear()
            }
            break
          }
        }
      },
    }),
  )
}

// ─── Plugin entry ────────────────────────────────────────────────────

const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: [
      {
        name: "project.wizard",
        title: "Project setup wizard",
        desc: "Configure project switches and initialize scaffolding + code indexes",
        category: "Project",
        namespace: "palette",
        slashName: SLASH_NAME,
        run() {
          startProjectWizard(api)
        },
      },
      {
        name: "project.setup",
        title: "Project setup wizard",
        desc: "Configure project switches in interactive dialog",
        category: "Project",
        namespace: "palette",
        slashName: "project-setup",
        run() {
          startProjectWizard(api)
        },
      },
      {
        name: "project.init.wizard",
        title: "Project init wizard",
        desc: "Interactive project initialization dialog",
        category: "Project",
        namespace: "palette",
        slashName: "project-init",
        run() {
          startProjectWizard(api)
        },
      },
    ],
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
}

export default plugin
