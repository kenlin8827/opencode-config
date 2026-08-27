/// <reference types="bun" />
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tr, initI18n, languageOption, toggleLocale, localeName, SWITCH_LANG } from "./i18n"
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

function toast(
  api: TuiPluginApi,
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
): void {
  try {
    api.ui.toast({ title: tr("project.toastTitle"), message, variant })
  } catch {
    // safe fallback if ui.toast is unsupported
  }
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
  if (val === "on") return "🟢 ON"
  if (val === "off") return "🔴 OFF"
  return "⚪ default"
}

function formatAdrModeBadge(val?: "auto" | "flat" | "hierarchical" | "default"): string {
  if (val === "auto") return "🟢 auto"
  if (val === "flat") return "📄 flat"
  if (val === "hierarchical") return "📦 hierarchy"
  return "⚪ default"
}

function formatAdvisorBadge(val?: "off" | "lite" | "full" | "default"): string {
  if (val === "lite") return "🟢 lite"
  if (val === "full") return "🔵 full"
  if (val === "off") return "🔴 off"
  return "⚪ default"
}

function backendLine(r: BackendResult): string {
  if (r.status === "ran") return `  ✅ ${r.backend}: ${r.detail}`
  if (r.status === "failed") return `  ❌ ${r.backend}: ${r.detail}`
  return `  ⏭️ ${r.backend}: skipped (${r.detail})`
}

function initReport(results: ScaffoldResult[], backends: BackendResult[]): string {
  const lines = results.map((r) => {
    if (r.status === "created") return `  ✅ created ${r.relPath}`
    if (r.status === "updated") return `  ♻️ updated ${r.relPath}`
    if (r.status === "invalid") return `  ⚠️ malformed ${r.relPath}`
    return `  ⏭️ kept ${r.relPath}`
  })
  return `Target: ${getProjectDir()}\n\nFiles:\n${lines.join("\n")}\n\nBackends:\n${backends.map(backendLine).join("\n")}`
}

export interface WizardState {
  switches: ProjectSwitches
  exists: boolean
  configRelPath?: string
  currentSelection?: string
}

export function startProjectWizard(
  api: TuiPluginApi,
  stateOverride?: WizardState,
): void {
  const rootDir = process.cwd()
  setProjectDir(rootDir)

  const detected = detectCurrentSwitches(rootDir)
  const isExisting = stateOverride ? stateOverride.exists : detected.exists
  const configRel = stateOverride ? stateOverride.configRelPath : detected.configRelPath
  const current: ProjectSwitches = stateOverride ? stateOverride.switches : detected.switches

  showMainMenu(api, {
    switches: current,
    exists: isExisting,
    configRelPath: configRel,
    currentSelection: stateOverride?.currentSelection ?? "__action_init__",
  })
}

/**
 * Renders authentic DialogAlert popup modal and safely returns to wizard
 * upon confirmation or Esc.
 *
 * DialogAlert only has onConfirm (no onCancel), so we use dialog.replace's
 * second argument (onClose) to catch the Esc key.  A navigated flag
 * prevents double-firing when onConfirm runs first.
 */
function showAlertModal(
  api: TuiPluginApi,
  params: {
    title: string
    message: string
    onDismiss: () => void
  },
): void {
  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogAlert({
        title: params.title,
        message: params.message,
        onConfirm: () => {
          navigated = true
          setTimeout(() => {
            params.onDismiss()
          }, 20)
        },
      }),
    () => {
      if (!navigated) params.onDismiss()
    },
  )
}

/** Level 1 Menu: Select primary action */
function showMainMenu(api: TuiPluginApi, state: WizardState): void {
  const rootDir = process.cwd()
  const { switches: current, exists: isExisting, configRelPath: configRel } = state
  const activeSelection = state.currentSelection ?? "__action_init__"

  const dialogTitle = isExisting
    ? tr("project.setupExisting", { config: configRel ?? ".opencode/opencode.jsonc" })
    : tr("project.newProject")

  const mainActionTitle = isExisting
    ? tr("project.applyUpdate")
    : tr("project.applyInit")

  const mainActionDesc = isExisting
    ? tr("project.applyUpdateDesc")
    : tr("project.applyInitDesc")

  const switchesSummary = `adv:${current.autoAdvisorMode ?? "def"} · adr:${current.adrGuard ?? "def"} · env:${current.envGuard ?? "def"} · e2e:${current.e2eGuard ?? "def"}`

  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<string>({
      title: dialogTitle,
      placeholder: tr("project.mainPlaceholder"),
      skipFilter: true,
      current: activeSelection,
      options: [
        {
          title: mainActionTitle,
          value: "__action_init__",
          description: mainActionDesc,
        },
        {
          title: tr("project.configureSwitches"),
          value: "__action_switches__",
          description: switchesSummary,
        },
        {
          title: tr("project.syncTemplates"),
          value: "__action_sync__",
          description: tr("project.syncTemplatesDesc"),
        },
        {
          title: tr("project.refreshIndex"),
          value: "__action_index__",
          description: tr("project.refreshIndexDesc"),
        },
        languageOption(api),
        {
          title: tr("project.exitWizard"),
          value: "__action_exit__",
          description: tr("project.exitWizardDesc"),
        },
      ],
      onSelect: async (option) => {
        navigated = true
        switch (option.value) {
          case SWITCH_LANG: {
            const next = toggleLocale(api)
            toast(api, tr("common.langSwitched", { lang: localeName(next) }), "info")
            showMainMenu(api, state)
            return
          }
          case "__action_exit__": {
            api.ui.dialog.clear()
            break
          }
          case "__action_init__": {
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
                isExisting ? tr("project.configUpdated") : tr("project.initSuccess"),
                "success",
              )
              showAlertModal(api, {
                title: isExisting ? tr("project.updateResult") : tr("project.initResult"),
                message: report,
                onDismiss: () =>
                  showMainMenu(api, {
                    ...state,
                    exists: true,
                    currentSelection: "__action_init__",
                  }),
              })
            } catch (err) {
              showAlertModal(api, {
                title: tr("project.initFailed"),
                message: tr("project.operationFailed", { err: (err as Error).message }),
                onDismiss: () =>
                  showMainMenu(api, {
                    ...state,
                    currentSelection: "__action_init__",
                  }),
              })
            }
            break
          }

          case "__action_switches__": {
            showSwitchesMenu(api, {
              ...state,
              currentSelection: "__switch_advisor__",
            })
            break
          }

          case "__action_sync__": {
            try {
              const res = runSync()
              let syncMsg = ""
              if (res.status === "missing") {
                syncMsg = "⚠️ Config file (.opencode/opencode.jsonc) does not exist.\nPlease run Init first."
              } else if (res.status === "up-to-date") {
                syncMsg = "ℹ️ Configuration is already up to date.\nAll latest template switch keys are already present."
              } else if (res.status === "added") {
                syncMsg = `✅ Successfully appended ${res.added.length} new switch line(s) to config:\n\n${res.added.map((k) => `  + ${k}`).join("\n")}\n\nExisting configuration content was preserved.`
              } else {
                syncMsg = "❌ Configuration file is malformed (missing proper closing brace).\nPlease fix the file manually."
              }
              showAlertModal(api, {
                title: tr("project.syncResult"),
                message: syncMsg,
                onDismiss: () =>
                  showMainMenu(api, {
                    ...state,
                    currentSelection: "__action_sync__",
                  }),
              })
            } catch (err) {
              showAlertModal(api, {
                title: tr("project.syncError"),
                message: `Sync operation failed: ${(err as Error).message}`,
                onDismiss: () =>
                  showMainMenu(api, {
                    ...state,
                    currentSelection: "__action_sync__",
                  }),
              })
            }
            break
          }

          case "__action_index__": {
            try {
              const probe = probeBackends(rootDir)
              const results = await runBackends(planIndexBackends(probe), rootDir)
              const msg =
                results.map(backendLine).join("\n") || "ℹ️ No backends needed index refresh."
              showAlertModal(api, {
                title: tr("project.indexResult"),
                message: msg,
                onDismiss: () =>
                  showMainMenu(api, {
                    ...state,
                    currentSelection: "__action_index__",
                  }),
              })
            } catch (err) {
              showAlertModal(api, {
                title: tr("project.indexError"),
                message: tr("project.indexFailed", { err: (err as Error).message }),
                onDismiss: () =>
                  showMainMenu(api, {
                    ...state,
                    currentSelection: "__action_index__",
                  }),
              })
            }
            break
          }
        }
      },
    }),
    () => {
      // Esc on main menu = close wizard entirely
      if (!navigated) api.ui.dialog.clear()
    },
  )
}

/** Level 2 Menu: Configure Switches and Quality Guards */
function showSwitchesMenu(api: TuiPluginApi, state: WizardState): void {
  const rootDir = process.cwd()
  const { switches: current, exists: isExisting, configRelPath: configRel } = state
  const activeSelection = state.currentSelection ?? "__switch_advisor__"

  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<string>({
      title: tr("project.configureSwitchesTitle", { config: configRel ?? ".opencode/opencode.jsonc" }),
      placeholder: tr("project.configureSwitchesPlaceholder"),
      skipFilter: true,
      current: activeSelection,
      options: [
        {
          title: `🤖 autoAdvisorMode:  ${formatAdvisorBadge(current.autoAdvisorMode)}`,
          value: "__switch_advisor__",
          description: "Advisor reviews (lite / full / off)",
        },
        {
          title: `🛡️ adrGuard:         ${formatGuardBadge(current.adrGuard)}`,
          value: "__switch_adr__",
          description: "Enforce ADR on feat/refactor",
        },
        {
          title: `📁 adrGuardDir:      ${current.adrGuardDir ?? "docs/adr"}`,
          value: "__switch_adr_dir__",
          description: "ADR markdown folder path",
        },
        {
          title: `🏛️ adrMode:          ${formatAdrModeBadge(current.adrMode)}`,
          value: "__switch_adr_mode__",
          description: "ADR structure (auto/flat/hierarchy)",
        },
        {
          title: `🔒 envGuard:         ${formatGuardBadge(current.envGuard)}`,
          value: "__switch_env__",
          description: "Protect secret .env file reads",
        },
        {
          title: `🧪 e2eGuard:         ${formatGuardBadge(current.e2eGuard)}`,
          value: "__switch_e2e__",
          description: "Assess E2E before test execution",
        },
        {
          title: tr("project.saveApply"),
          value: "__save_switches__",
          description: tr("project.saveApplyDesc"),
        },
        {
          title: tr("project.backToMain"),
          value: "__back_main__",
          description: tr("project.backToMainDesc"),
        },
      ],
      onSelect: async (option) => {
        navigated = true
        const nextState = { switches: current, exists: isExisting, configRelPath: configRel }
        switch (option.value) {
          case "__save_switches__": {
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
                isExisting ? tr("project.configSavedToast") : tr("project.initSuccess"),
                "success",
              )
              showAlertModal(api, {
                title: isExisting ? tr("project.saveResult") : tr("project.initResult"),
                message: report,
                onDismiss: () =>
                  showSwitchesMenu(api, {
                    ...nextState,
                    exists: true,
                    currentSelection: "__save_switches__",
                  }),
              })
            } catch (err) {
              showAlertModal(api, {
                title: tr("project.saveFailed"),
                message: tr("project.saveFailedMsg", { err: (err as Error).message }),
                onDismiss: () =>
                  showSwitchesMenu(api, {
                    ...nextState,
                    currentSelection: "__save_switches__",
                  }),
              })
            }
            break
          }

          case "__back_main__": {
            showMainMenu(api, {
              ...nextState,
              currentSelection: "__action_switches__",
            })
            break
          }

          case "__switch_advisor__": {
            let navAdvisor = false
            api.ui.dialog.replace(
              () =>
                api.ui.DialogSelect<string>({
                title: "Select autoAdvisorMode",
                placeholder: `Current: ${current.autoAdvisorMode ?? "default"}`,
                skipFilter: true,
                current: current.autoAdvisorMode ?? "lite",
                options: [
                  {
                    title: `🟢 lite${current.autoAdvisorMode === "lite" ? "  (current)" : ""}`,
                    value: "lite",
                    description: "Advisory mode (recommended)",
                  },
                  {
                    title: `🔵 full${current.autoAdvisorMode === "full" ? "  (current)" : ""}`,
                    value: "full",
                    description: "Decisive review mode",
                  },
                  {
                    title: `🔴 off${current.autoAdvisorMode === "off" ? "  (current)" : ""}`,
                    value: "off",
                    description: "Disable advisor completely",
                  },
                  {
                    title: `⚪ default${current.autoAdvisorMode === "default" || !current.autoAdvisorMode ? "  (current)" : ""}`,
                    value: "default",
                    description: "Leave commented in config (default off)",
                  },
                  {
                    title: "🔙 Cancel",
                    value: "__cancel__",
                    description: "Keep current and return",
                  },
                ],
                onSelect: (sel) => {
                  navAdvisor = true
                  if (sel.value !== "__cancel__") {
                    current.autoAdvisorMode = sel.value as ProjectSwitches["autoAdvisorMode"]
                    toast(api, `autoAdvisorMode -> ${formatAdvisorBadge(current.autoAdvisorMode)}`, "success")
                  }
                  showSwitchesMenu(api, {
                    ...nextState,
                    currentSelection: "__switch_advisor__",
                  })
                },
              }),
              () => {
                // Esc on advisor picker = back to switches menu
                if (!navAdvisor) setTimeout(() => showSwitchesMenu(api, { ...nextState, currentSelection: "__switch_advisor__" }), 0)
              },
            )
            break
          }
          case "__switch_adr__": {
            let navAdr = false
            api.ui.dialog.replace(
              () =>
                api.ui.DialogSelect<string>({
                title: "Select adrGuard",
                placeholder: `Current: ${current.adrGuard ?? "default"}`,
                skipFilter: true,
                current: current.adrGuard ?? "on",
                options: [
                  {
                    title: `🟢 on${current.adrGuard === "on" ? "  (current)" : ""}`,
                    value: "on",
                    description: "Enforce ADR change check on feat/refactor",
                  },
                  {
                    title: `🔴 off${current.adrGuard === "off" ? "  (current)" : ""}`,
                    value: "off",
                    description: "Disable ADR guard check",
                  },
                  {
                    title: `⚪ default${current.adrGuard === "default" || !current.adrGuard ? "  (current)" : ""}`,
                    value: "default",
                    description: "Leave commented in config (default off)",
                  },
                  {
                    title: "🔙 Cancel",
                    value: "__cancel__",
                    description: "Keep current and return",
                  },
                ],
                onSelect: (sel) => {
                  navAdr = true
                  if (sel.value !== "__cancel__") {
                    current.adrGuard = sel.value as ProjectSwitches["adrGuard"]
                    toast(api, `adrGuard -> ${formatGuardBadge(current.adrGuard)}`, "success")
                  }
                  showSwitchesMenu(api, {
                    ...nextState,
                    currentSelection: "__switch_adr__",
                  })
                },
              }),
              () => {
                // Esc on adrGuard picker = back to switches menu
                if (!navAdr) setTimeout(() => showSwitchesMenu(api, { ...nextState, currentSelection: "__switch_adr__" }), 0)
              },
            )
            break
          }
          case "__switch_adr_dir__": {
            let navAdrDir = false
            api.ui.dialog.replace(
              () =>
                api.ui.DialogSelect<string>({
                title: "Select ADR Directory (adrGuardDir)",
                placeholder: `Current: ${current.adrGuardDir ?? "docs/adr"}`,
                skipFilter: true,
                current: current.adrGuardDir ?? "docs/adr",
                options: [
                  {
                    title: `📁 docs/adr${(current.adrGuardDir ?? "docs/adr") === "docs/adr" ? "  (current)" : ""}`,
                    value: "docs/adr",
                    description: "Standard docs/adr/ folder",
                  },
                  {
                    title: `📁 docs/decisions${current.adrGuardDir === "docs/decisions" ? "  (current)" : ""}`,
                    value: "docs/decisions",
                    description: "docs/decisions/ folder",
                  },
                  {
                    title: `📁 architecture/decisions${current.adrGuardDir === "architecture/decisions" ? "  (current)" : ""}`,
                    value: "architecture/decisions",
                    description: "architecture/decisions/ folder",
                  },
                  {
                    title: "✍️ Custom Path...",
                    value: "__custom__",
                    description: "Type custom directory path",
                  },
                  {
                    title: "🔙 Cancel",
                    value: "__cancel__",
                    description: "Keep current and return",
                  },
                ],
                onSelect: (dirOpt) => {
                  navAdrDir = true
                  if (dirOpt.value === "__cancel__") {
                    showSwitchesMenu(api, {
                      ...nextState,
                      currentSelection: "__switch_adr_dir__",
                    })
                  } else if (dirOpt.value === "__custom__") {
                    let navPrompt = false
                    api.ui.dialog.replace(
                      () =>
                        api.ui.DialogPrompt({
                          title: "Custom ADR Directory",
                          placeholder: "e.g. docs/adr",
                          value: current.adrGuardDir ?? "docs/adr",
                          onConfirm: (val) => {
                            navPrompt = true
                            current.adrGuardDir = val.trim() || "docs/adr"
                            toast(api, `adrGuardDir -> ${current.adrGuardDir}`, "success")
                            showSwitchesMenu(api, {
                              ...nextState,
                              currentSelection: "__switch_adr_dir__",
                            })
                          },
                          onCancel: () => {
                            navPrompt = true
                            setTimeout(() => showSwitchesMenu(api, {
                              ...nextState,
                              currentSelection: "__switch_adr_dir__",
                            }), 0)
                          },
                        }),
                      () => {
                        // Esc on custom path prompt = back to switches menu
                        if (!navPrompt) setTimeout(() => showSwitchesMenu(api, { ...nextState, currentSelection: "__switch_adr_dir__" }), 0)
                      },
                    )
                  } else {
                    current.adrGuardDir = dirOpt.value
                    toast(api, `adrGuardDir -> ${current.adrGuardDir}`, "success")
                    showSwitchesMenu(api, {
                      ...nextState,
                      currentSelection: "__switch_adr_dir__",
                    })
                  }
                },
              }),
              () => {
                // Esc on ADR directory picker = back to switches menu
                if (!navAdrDir) setTimeout(() => showSwitchesMenu(api, { ...nextState, currentSelection: "__switch_adr_dir__" }), 0)
              },
            )
            break
          }
          case "__switch_adr_mode__": {
            let navAdrMode = false
            api.ui.dialog.replace(
              () =>
                api.ui.DialogSelect<string>({
                title: "Select ADR Mode (adrMode)",
                placeholder: `Current: ${current.adrMode ?? "default"}`,
                skipFilter: true,
                current: current.adrMode ?? "auto",
                options: [
                  {
                    title: `🟢 auto${current.adrMode === "auto" ? "  (current)" : ""}`,
                    value: "auto",
                    description: "Smart adaptive (flat <=15, hierarchy >15)",
                  },
                  {
                    title: `📄 flat${current.adrMode === "flat" ? "  (current)" : ""}`,
                    value: "flat",
                    description: "Single directory (0001-xxx.md)",
                  },
                  {
                    title: `📦 hierarchy${current.adrMode === "hierarchical" ? "  (current)" : ""}`,
                    value: "hierarchical",
                    description: "Domain subdirectories (auth/0001-xxx.md)",
                  },
                  {
                    title: `⚪ default${current.adrMode === "default" || !current.adrMode ? "  (current)" : ""}`,
                    value: "default",
                    description: "Leave commented in config (default auto)",
                  },
                  {
                    title: "🔙 Cancel",
                    value: "__cancel__",
                    description: "Keep current and return",
                  },
                ],
                onSelect: (sel) => {
                  navAdrMode = true
                  if (sel.value !== "__cancel__") {
                    current.adrMode = sel.value as ProjectSwitches["adrMode"]
                    toast(api, `adrMode -> ${formatAdrModeBadge(current.adrMode)}`, "success")
                  }
                  showSwitchesMenu(api, {
                    ...nextState,
                    currentSelection: "__switch_adr_mode__",
                  })
                },
              }),
              () => {
                // Esc on adrMode picker = back to switches menu
                if (!navAdrMode) setTimeout(() => showSwitchesMenu(api, { ...nextState, currentSelection: "__switch_adr_mode__" }), 0)
              },
            )
            break
          }
          case "__switch_env__": {
            let navEnv = false
            api.ui.dialog.replace(
              () =>
                api.ui.DialogSelect<string>({
                title: "Select envGuard",
                placeholder: `Current: ${current.envGuard ?? "default"}`,
                skipFilter: true,
                current: current.envGuard ?? "on",
                options: [
                  {
                    title: `🟢 on${current.envGuard === "on" ? "  (current)" : ""}`,
                    value: "on",
                    description: "Block agent reading secret .env files",
                  },
                  {
                    title: `🔴 off${current.envGuard === "off" ? "  (current)" : ""}`,
                    value: "off",
                    description: "Allow unrestricted access to env files",
                  },
                  {
                    title: `⚪ default${current.envGuard === "default" || !current.envGuard ? "  (current)" : ""}`,
                    value: "default",
                    description: "Leave commented in config (default off)",
                  },
                  {
                    title: "🔙 Cancel",
                    value: "__cancel__",
                    description: "Keep current and return",
                  },
                ],
                onSelect: (sel) => {
                  navEnv = true
                  if (sel.value !== "__cancel__") {
                    current.envGuard = sel.value as ProjectSwitches["envGuard"]
                    toast(api, `envGuard -> ${formatGuardBadge(current.envGuard)}`, "success")
                  }
                  showSwitchesMenu(api, {
                    ...nextState,
                    currentSelection: "__switch_env__",
                  })
                },
              }),
              () => {
                // Esc on envGuard picker = back to switches menu
                if (!navEnv) setTimeout(() => showSwitchesMenu(api, { ...nextState, currentSelection: "__switch_env__" }), 0)
              },
            )
            break
          }
          case "__switch_e2e__": {
            let navE2e = false
            api.ui.dialog.replace(
              () =>
                api.ui.DialogSelect<string>({
                title: "Select e2eGuard",
                placeholder: `Current: ${current.e2eGuard ?? "default"}`,
                skipFilter: true,
                current: current.e2eGuard ?? "on",
                options: [
                  {
                    title: `🟢 on${current.e2eGuard === "on" ? "  (current)" : ""}`,
                    value: "on",
                    description: "Assess E2E impact & prompt user",
                  },
                  {
                    title: `🔴 off${current.e2eGuard === "off" ? "  (current)" : ""}`,
                    value: "off",
                    description: "Skip E2E assessment check",
                  },
                  {
                    title: `⚪ default${current.e2eGuard === "default" || !current.e2eGuard ? "  (current)" : ""}`,
                    value: "default",
                    description: "Leave commented in config (default off)",
                  },
                  {
                    title: "🔙 Cancel",
                    value: "__cancel__",
                    description: "Keep current and return",
                  },
                ],
                onSelect: (sel) => {
                  navE2e = true
                  if (sel.value !== "__cancel__") {
                    current.e2eGuard = sel.value as ProjectSwitches["e2eGuard"]
                    toast(api, `e2eGuard -> ${formatGuardBadge(current.e2eGuard)}`, "success")
                  }
                  showSwitchesMenu(api, {
                    ...nextState,
                    currentSelection: "__switch_e2e__",
                  })
                },
              }),
              () => {
                // Esc on e2eGuard picker = back to switches menu
                if (!navE2e) setTimeout(() => showSwitchesMenu(api, { ...nextState, currentSelection: "__switch_e2e__" }), 0)
              },
            )
            break
          }
        }
      },
    }),
    () => {
      // Esc on switches menu = back to main menu
      if (!navigated) setTimeout(() => showMainMenu(api, { ...state, currentSelection: "__action_switches__" }), 0)
    },
  )
}

// ─── Plugin entry ────────────────────────────────────────────────────

const tui: TuiPlugin = async (api) => {
  initI18n(api)
  api.keymap.registerLayer({
    commands: [
      {
        name: "project.wizard",
        title: tr("project.cmdTitle"),
        desc: tr("project.cmdDesc"),
        category: "Project",
        namespace: "palette",
        slashName: "project-wizard",
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
