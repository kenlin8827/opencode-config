/**
 * Shared i18n module for all TUI wizard plugins.
 *
 * Centralizes locale detection, storage, and all translation strings
 * for profile-wizard, provider-wizard, project-wizard, and queue-manager.
 *
 * Usage in plugins:
 *   import { initI18n, tr, registerLangCommand } from "./i18n"
 *   // in plugin entry: initI18n(api); registerLangCommand(api)
 *   // in dialog code:  tr("profile.mainTitle")
 */

import type { TuiPluginApi, TuiDialogSelectOption } from "@opencode-ai/plugin/tui"

// ─── Types ───────────────────────────────────────────────────────────

export type Locale = string

interface LocaleMeta {
  code: Locale
  /** Native display name shown in the language menu. */
  name: string
  /** Matched against LANG/LC_ALL/Intl locale/timezone for auto-detection. */
  match?: RegExp
}

/**
 * Locale registry (menu order). "en" is the mandatory fallback locale.
 * To add a language: register it here and fill its entries in STRINGS;
 * detection, persistence, switching and menus pick it up automatically.
 */
const LOCALES: readonly LocaleMeta[] = [
  { code: "en", name: "English" },
  { code: "zh-CN", name: "中文", match: /zh|cn|hans|shanghai|chongqing|urumqi|harbin|beijing|prc|taipei|hong_kong/i },
]

const FALLBACK_LOCALE: Locale = "en"

/**
 * Convenience alias for dialog option objects used by all wizards.
 */
export type DialogOption<V = string> = TuiDialogSelectOption<V>

type StringEntry = Partial<Record<Locale, string>> & { en: string }

// ─── Locale state ────────────────────────────────────────────────────

let currentLocale: Locale = "en"

export function getLocale(): Locale {
  return currentLocale
}

function isRegistered(code: unknown): code is Locale {
  return typeof code === "string" && LOCALES.some((l) => l.code === code)
}

function detectLocale(): Locale {
  const probes = [
    process.env.LANG || "",
    process.env.LC_ALL || "",
    process.env.LANGUAGE || "",
  ]
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions()
    probes.push(opts.locale, opts.timeZone)
  } catch { /* ignore */ }
  const haystack = probes.join(" ")
  for (const l of LOCALES) {
    if (l.code !== FALLBACK_LOCALE && l.match?.test(haystack)) return l.code
  }
  return FALLBACK_LOCALE
}

const KV_KEY = "opencode.locale"

let initialized = false

export function initI18n(api: TuiPluginApi): void {
  // Guard against repeated calls from multiple plugins —
  // only the first call performs detection & KV write.
  if (initialized) return
  initialized = true
  const stored = api.kv.get<Locale>(KV_KEY)
  if (isRegistered(stored)) {
    currentLocale = stored
  } else {
    currentLocale = detectLocale()
    api.kv.set(KV_KEY, currentLocale)
  }
}

export function setLocale(api: TuiPluginApi, locale: Locale): void {
  currentLocale = locale
  api.kv.set(KV_KEY, locale)
}

/** Locale the menu switch would move to (cycles through the registry). */
export function nextLocale(): Locale {
  const idx = LOCALES.findIndex((l) => l.code === currentLocale)
  return LOCALES[(idx + 1) % LOCALES.length].code
}

export function toggleLocale(api: TuiPluginApi): Locale {
  const next = nextLocale()
  setLocale(api, next)
  return next
}

export function localeName(locale: Locale): string {
  return LOCALES.find((l) => l.code === locale)?.name ?? locale
}

// ─── Translation table ──────────────────────────────────────────────
// Keys are namespaced: "common.xxx", "profile.xxx", "provider.xxx",
// "project.xxx", "queue.xxx".  Placeholders use {name} syntax.

const STRINGS = {
  // ════════════════════════════════════════════════════════════════
  // ── Common (shared across all wizards) ───────────────────────────
  // ════════════════════════════════════════════════════════════════
  "common.cancel": { en: "❌ Cancel", "zh-CN": "❌ 取消" },
  "common.applyChanges": { en: "✅ Apply", "zh-CN": "✅ 应用" },
  "common.activeMarker": { en: "← active", "zh-CN": "← 当前" },
  "common.currentMarker": { en: "← current", "zh-CN": "← 当前" },
  "common.addedMarker": { en: "added", "zh-CN": "已添加" },
  "common.unset": { en: "(unset)", "zh-CN": "(未设置)" },
  "common.config": { en: "config", "zh-CN": "配置" },
  "common.builtin": { en: "built-in", "zh-CN": "内置" },
  "common.connected": { en: "connected", "zh-CN": "已连接" },
  "common.modelCount": { en: "{count} model(s)", "zh-CN": "{count} 个模型" },
  "common.langTitle": { en: "Switch language", "zh-CN": "切换语言" },
  "common.langDesc": { en: "Switch interface language", "zh-CN": "切换界面语言" },
  "common.langPickPlaceholder": { en: "Select language (Esc cancels)", "zh-CN": "选择语言 (Esc 取消)" },
  "common.langSwitched": { en: "Language switched to {lang}", "zh-CN": "语言已切换为 {lang}" },
  "common.interfaceHeader": { en: "Interface", "zh-CN": "界面" },

  // ════════════════════════════════════════════════════════════════
  // ── Profile wizard ──────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════
  "profile.cmdTitle": { en: "Switch model profile", "zh-CN": "切换配置方案" },
  "profile.cmdDesc": { en: "Select a profile, edit agent tiers or live tier models, or manage profile models — /profile reset clears all model refs", "zh-CN": "选择配置方案，编辑 Agent 的模型层级或当前层级的模型，或管理配置方案的模型 — /profile reset 清空所有模型引用" },

  // Main menu
  "profile.mainTitle": { en: "Profile wizard", "zh-CN": "配置方案向导" },
  "profile.agentsHeader": { en: "Agents", "zh-CN": "Agents" },
  "profile.tiersHeader": { en: "Tiers", "zh-CN": "模型层级" },
  "profile.providersHeader": { en: "Providers", "zh-CN": "服务商" },
  "profile.profilesHeader": { en: "Profiles", "zh-CN": "配置方案" },
  "profile.actionsHeader": { en: "Actions", "zh-CN": "操作" },
  "profile.mainPlaceholder": { en: "Pick an action (Esc: close)", "zh-CN": "选择一个操作 (Esc: 关闭)" },
  "profile.editAgentTier": { en: "Edit: Agent→Tier", "zh-CN": "编辑: Agent→模型层级" },
  "profile.editAgentTierDesc": { en: "Reassign which tier (flash/standard/pro/max/vision) each agent uses", "zh-CN": "重新分配每个 Agent 所属的模型层级 (flash/standard/pro/max/vision)" },
  "profile.editTierModels": { en: "Edit: Tier→Model", "zh-CN": "编辑: 模型层级→模型" },
  "profile.editTierModelsDesc": { en: "Change the live tier→model mapping directly, without going through a profile", "zh-CN": "直接修改当前生效的 模型层级→模型 映射，无需经过配置方案" },
  "profile.manageModels": { en: "Manage: Profile→Models", "zh-CN": "管理: 配置方案→模型" },
  "profile.manageModelsDesc": { en: "Edit a profile's tier→model mapping, or add/delete profiles", "zh-CN": "编辑配置方案的 模型层级→模型 映射，或添加/删除配置方案" },
  "profile.selectProfile": { en: "Select: Profile", "zh-CN": "选择: 配置方案" },
  "profile.selectProfileActive": { en: "Select: Profile (active: {active})", "zh-CN": "选择: 配置方案 (当前: {active})" },
  "profile.selectProfileDesc": { en: "Pick a profile, review its mapping, then apply", "zh-CN": "选一个配置方案，确认映射后再应用" },
  "profile.resetModels": { en: "🧹 Reset: Model refs", "zh-CN": "🧹 重置: 模型引用" },
  "profile.resetModelsDesc": { en: "Remove every model ref from opencode.jsonc — opencode falls back to its model picker (asks for confirmation)", "zh-CN": "移除 opencode.jsonc 中所有模型引用 — opencode 回落到原生模型选择器（执行前需确认）" },
  "profile.resetTitle": { en: "Reset model refs", "zh-CN": "重置模型引用" },
  "profile.resetMsg": { en: "Remove ALL model refs from opencode.jsonc?\n\n{refs}\n\nProfile files and tiers.json are kept; a .bak backup of the config is kept. opencode falls back to its native model picker.", "zh-CN": "移除 opencode.jsonc 中的全部模型引用？\n\n{refs}\n\n配置方案文件与 tiers.json 保留；配置会保留 .bak 备份。opencode 将回落到原生模型选择器。" },
  "profile.resetNothing": { en: "Nothing to reset — no model refs in the config.", "zh-CN": "无需重置 — 配置中没有模型引用。" },
  "profile.resetDone": { en: "Removed {count} model ref(s). Restart opencode to apply.", "zh-CN": "已移除 {count} 个模型引用。重启 opencode 后生效。" },
  "profile.resetFailed": { en: "Reset failed: {err}", "zh-CN": "重置失败: {err}" },
  "profile.unknownSub": { en: "Unknown subcommand '{sub}'. Usage: /profile [reset]", "zh-CN": "未知子命令 '{sub}'。用法: /profile [reset]" },

  // Edit: Agent→Tier
  "profile.editTierTitle": { en: "Edit agent→tier", "zh-CN": "编辑 Agent→模型层级" },
  "profile.editTierTitlePending": { en: "Edit agent→tier ({count} pending)", "zh-CN": "编辑 Agent→模型层级 ({count} 个待应用)" },
  "profile.editTierPlaceholder": { en: "Pick an agent to reassign its tier (Esc: back)", "zh-CN": "选择 Agent 重新分配模型层级 (Esc: 返回)" },
  "profile.applyChangesDesc": { en: "Write {count} change{s} to tiers.json and apply live", "zh-CN": "将 {count} 个变更写入 tiers.json 并热生效" },
  "profile.tierModelDesc": { en: "Tier: {tier} — model: {model}", "zh-CN": "模型层级: {tier} — 模型: {model}" },
  "profile.pickTierTitle": { en: "Set tier for '{agent}' (current: {tier})", "zh-CN": "设置 '{agent}' 的模型层级 (当前: {tier})" },
  "profile.pickTierPlaceholder": { en: "Pick a tier (Esc: back)", "zh-CN": "选择模型层级 (Esc: 返回)" },
  "profile.tierChanged": { en: "{agent}: {old} → {new} (pending)", "zh-CN": "{agent}: {old} → {new} (待应用)" },
  "profile.writeTiersFailed": { en: "Failed to write tiers.json: {err}", "zh-CN": "写入 tiers.json 失败: {err}" },
  "profile.readConfigFailed": { en: "Cannot read the opencode config: {err}", "zh-CN": "无法读取 opencode 配置: {err}" },
  "profile.noAgents": { en: "No agents found in the config.", "zh-CN": "配置中未找到 Agent。" },
  "profile.tiersUpdatedConfigFailed": { en: "tiers.json updated, but cannot read the opencode config: {err}. Restart or run /profile to apply.", "zh-CN": "tiers.json 已更新，但无法读取 opencode 配置: {err}。重启或运行 /profile 来应用。" },
  "profile.noModelRef": { en: "{agent} → {tier} (no model ref — set via /profile)", "zh-CN": "{agent} → {tier} (无模型引用 — 通过 /profile 设置)" },
  "profile.writeOpencodeFailed": { en: "tiers.json updated, but failed to write the opencode config: {err}. Restart or run /profile.", "zh-CN": "tiers.json 已更新，但写入 opencode 配置失败: {err}。重启或运行 /profile。" },
  "profile.tierChangesApplied": { en: "{count} tier change{s} applied — {details}. {live}", "zh-CN": "{count} 个模型层级变更已应用 — {details}。{live}" },
  "profile.liveNoRestart": { en: "Live, no restart needed.", "zh-CN": "已热生效，无需重启。" },
  "profile.restartToApply": { en: "Restart to apply.", "zh-CN": "重启后生效。" },

  // Edit: Tier→Model (live config, no profile)
  "profile.editTierModelsTitle": { en: "Edit tier→model (live)", "zh-CN": "编辑 模型层级→模型（当前生效）" },
  "profile.editTierModelsTitlePending": { en: "Edit tier→model (live) ({count} pending)", "zh-CN": "编辑 模型层级→模型（当前生效）({count} 个待应用)" },
  "profile.editTierModelsPlaceholder": { en: "Pick a tier to change its model (Esc: back)", "zh-CN": "选择模型层级修改其模型 (Esc: 返回)" },
  "profile.applyTierModelsDesc": { en: "Apply {count} model change{s} to the live config", "zh-CN": "将 {count} 个模型变更热应用到当前配置" },
  "profile.noTierModels": { en: "No tier mapping found — agents have no models in the config.", "zh-CN": "未找到模型层级映射 — 配置中 Agent 没有模型。" },
  "profile.pickTierModelProviderTitle": { en: "tier.{tier} → provider", "zh-CN": "模型层级 {tier} → 服务商" },
  "profile.pickTierModelModelTitle": { en: "tier.{tier} → model on {provider}", "zh-CN": "模型层级 {tier} → {provider} 上的模型" },
  "profile.promptTierModelRefTitle": { en: "tier.{tier} — custom ref", "zh-CN": "模型层级 {tier} — 手动输入引用" },
  "profile.liveTierModelChanged": { en: "tier.{tier} → {provider}/{model} (pending)", "zh-CN": "模型层级 {tier} → {provider}/{model} (待应用)" },
  "profile.tierModelsApplied": { en: "{count} model change{s} applied — {details}. {live}", "zh-CN": "{count} 个模型变更已应用 — {details}。{live}" },

  // Manage: Profile→Models
  "profile.manageTitle": { en: "Manage: Profile→Models", "zh-CN": "管理: 配置方案→模型" },
  "profile.managePlaceholder": { en: "Pick a profile to edit its tier→model mapping (Esc: back)", "zh-CN": "选择配置方案编辑其 模型层级→模型 映射 (Esc: 返回)" },
  "profile.addProfile": { en: "Add: Profile", "zh-CN": "添加: 配置方案" },
  "profile.addProfileDesc": { en: "Create a new blank profile JSON in ~/.config/opencode/profiles/", "zh-CN": "在 ~/.config/opencode/profiles/ 创建空白配置方案 JSON" },
  "profile.deleteProfile": { en: "🗑️ Delete", "zh-CN": "🗑️ 删除" },
  "profile.deleteProfileDesc": { en: "Delete this profile's JSON file (asks for confirmation)", "zh-CN": "删除此配置方案的 JSON 文件（删除前需确认）" },
  "profile.reviewTiersTitle": { en: "{name} — review tiers", "zh-CN": "{name} — 审阅模型层级" },
  "profile.reviewTiersPlaceholder": { en: "Pick a tier to change its model (provider → model), or apply (Esc: back)", "zh-CN": "选择模型层级修改其模型 (服务商 → 模型)，或应用 (Esc: 返回)" },
  "profile.applyChangesModelDesc": { en: "Write the mapping below to the profile JSON and apply", "zh-CN": "将以下映射写入配置方案 JSON 并应用" },
  "profile.cancelDiscard": { en: "Discard overrides and return to profile list", "zh-CN": "丢弃覆写，返回配置方案列表" },
  "profile.pickProviderTitle": { en: "{name} — tier.{tier} → provider", "zh-CN": "{name} — 模型层级 {tier} → 服务商" },
  "profile.pickProviderPlaceholder": { en: "Pick a provider (Esc: back)", "zh-CN": "选择服务商 (Esc: 返回)" },
  "profile.typeCustomRef": { en: "( Type a custom ref )", "zh-CN": "( 手动输入引用 )" },
  "profile.typeCustomRefDesc": { en: "For providers not listed above", "zh-CN": "用于未列出的服务商" },
  "profile.pickModelTitle": { en: "{name} — tier.{tier} → model on {provider}", "zh-CN": "{name} — 模型层级 {tier} → {provider} 上的模型" },
  "profile.pickModelPlaceholder": { en: "Pick a model — {count} available (Esc: back)", "zh-CN": "选择模型 — {count} 个可用 (Esc: 返回)" },
  "profile.modelChanged": { en: "{name}: tier.{tier} → {provider}/{model} (pending)", "zh-CN": "{name}: 模型层级 {tier} → {provider}/{model} (待应用)" },
  "profile.promptTierRefTitle": { en: "{name} — tier.{tier}", "zh-CN": "{name} — 模型层级 {tier}" },
  "profile.promptTierRefPlaceholder": { en: "<provider>/<model_id> (empty keeps current)", "zh-CN": "<provider>/<model_id> (留空保留当前值)" },
  "profile.invalidRef": { en: "Invalid ref '{ref}' — expected '<provider>/<model_id>'.", "zh-CN": "无效引用 '{ref}' — 格式应为 '<provider>/<model_id>'。" },
  "profile.customized": { en: "{override} ← customized (preset: {ref})", "zh-CN": "{override} ← 已覆写 (原配置方案: {ref})" },
  "profile.profileVanished": { en: "Profile '{name}' vanished.", "zh-CN": "配置方案 '{name}' 不见了。" },
  "profile.writeProfileFailed": { en: "Failed to write profile '{name}': {err}", "zh-CN": "写入配置方案 '{name}' 失败: {err}" },
  "profile.profileUpdatedApplied": { en: "Profile '{name}' updated and applied — {updated} agent(s) updated ({details}). {live}", "zh-CN": "配置方案 '{name}' 已更新并应用 — {updated} 个 Agent 已更新 ({details})。{live}" },
  "profile.profileSavedApplyFailed": { en: "Profile JSON saved, but failed to apply: {err}", "zh-CN": "配置方案 JSON 已保存，但应用失败: {err}" },

  // Add / Delete profile
  "profile.addProfileTitle": { en: "Add new profile", "zh-CN": "添加新配置方案" },
  "profile.addProfilePlaceholder": { en: "Profile name (e.g. my-custom)", "zh-CN": "配置方案名称 (如 my-custom)" },
  "profile.profileExists": { en: "Profile '{name}' already exists.", "zh-CN": "配置方案 '{name}' 已存在。" },
  "profile.customProfile": { en: "Custom profile", "zh-CN": "自定义配置方案" },
  "profile.profileCreated": { en: "Profile '{name}' created — edit its tiers via Manage.", "zh-CN": "配置方案 '{name}' 已创建 — 通过管理编辑其模型层级。" },
  "profile.createProfileFailed": { en: "Failed to create profile: {err}", "zh-CN": "创建配置方案失败: {err}" },
  "profile.deleteProfileTitle": { en: "Delete profile", "zh-CN": "删除配置方案" },
  "profile.confirmDeleteMsg": { en: "Delete profile '{name}'?\n\nFile: {path}\n\nA .bak backup will be kept. This cannot be undone.", "zh-CN": "删除配置方案 '{name}'?\n\n文件: {path}\n\n将保留 .bak 备份。此操作不可撤销。" },
  "profile.profileDeleted": { en: "Profile '{name}' deleted (.bak kept).", "zh-CN": "配置方案 '{name}' 已删除（保留 .bak 备份）。" },
  "profile.deleteFailed": { en: "Failed to delete: {err}", "zh-CN": "删除失败: {err}" },

  // Select: Profile
  "profile.selectTitle": { en: "Select: Profile", "zh-CN": "选择: 配置方案" },
  "profile.selectPlaceholder": { en: "Pick a profile to review and apply (Esc: back)", "zh-CN": "选择配置方案审阅并应用 (Esc: 返回)" },
  "profile.confirmApplyTitle": { en: "Apply profile '{name}'?", "zh-CN": "应用配置方案 '{name}'？" },
  "profile.confirmApplyMsg": { en: "The following tier→model mapping will be applied:\n\n{mapping}\n\nAgent models in the config will be overwritten.", "zh-CN": "即将应用以下 模型层级→模型 映射：\n\n{mapping}\n\n配置中的 Agent 模型将被覆写。" },
  "profile.noProfiles": { en: "No profiles found in {dir}.", "zh-CN": "在 {dir} 中未找到配置方案。" },
  "profile.switchedTo": { en: "Switched to '{name}' — {updated} agent(s) updated ({details}). {live}", "zh-CN": "已切换到 '{name}' — {updated} 个 Agent 已更新 ({details})。{live}" },
  "profile.appliedLive": { en: "Applied live, no restart needed.", "zh-CN": "已热生效，无需重启。" },
  "profile.restartToApply2": { en: "Restart opencode to apply.", "zh-CN": "重启 opencode 后生效。" },
  "profile.applyFailed": { en: "Failed to apply '{name}': {err}", "zh-CN": "应用 '{name}' 失败: {err}" },

  // Tier descriptions
  "profile.tierFlash": { en: "Fast / lightweight — exploration, high-throughput", "zh-CN": "快速 / 轻量 — 代码粗筛，高吞吐" },
  "profile.tierStandard": { en: "General workhorse — orchestrator (root model)", "zh-CN": "通用主力 — 编排中枢（根模型）" },
  "profile.tierPro": { en: "Professional — strongest coding models", "zh-CN": "专业级 — 最强编码模型" },
  "profile.tierMax": { en: "Flagship reasoning — deep analysis, review, design", "zh-CN": "旗舰推理 — 深度分析，审查，设计" },
  "profile.tierVision": { en: "Multimodal — image/screenshot analysis", "zh-CN": "多模态 — 图像/截图分析" },

  // Misc
  "profile.activeProfileToast": { en: "Active profile: {name}", "zh-CN": "当前配置方案: {name}" },

  // ════════════════════════════════════════════════════════════════
  // ── Provider wizard ────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════
  "provider.cmdTitle": { en: "Configure provider", "zh-CN": "配置服务商" },
  "provider.cmdDesc": { en: "Add custom providers, configure credentials, fetch and manage models", "zh-CN": "添加自定义服务商，配置凭证，拉取和管理模型" },
  "provider.toastTitle": { en: "Provider wizard", "zh-CN": "服务商向导" },
  "provider.setupTitle": { en: "Provider wizard", "zh-CN": "服务商向导" },
  "provider.setupPlaceholder": { en: "Pick a provider to configure (Esc: close)", "zh-CN": "选择服务商进行配置 (Esc: 关闭)" },
  "provider.addProvider": { en: "➕ Add custom provider", "zh-CN": "➕ 添加自定义服务商" },
  "provider.addProviderDesc": { en: "Create a blank provider config from scratch", "zh-CN": "从零创建空白服务商配置" },
  "provider.addPresetProvider": { en: "📦 Add preset provider…", "zh-CN": "📦 添加预设服务商…" },
  "provider.addPresetProviderDesc": { en: "Import a preset provider from the bundled providers/ definitions", "zh-CN": "从内置的 providers/ 定义文件导入预设服务商" },
  "provider.pickPresetTitle": { en: "Add preset provider", "zh-CN": "添加预设服务商" },
  "provider.pickPresetPlaceholder": { en: "Pick a preset — new ones are imported, added ones open their details (Esc: back)", "zh-CN": "选择预设服务商 — 新的将导入，已添加的直接进详情 (Esc: 返回)" },
  "provider.noPresetsLeft": { en: "No preset definitions found in the providers/ directory.", "zh-CN": "providers/ 目录中未找到预设定义。" },
  "provider.invalidProviderId": { en: "Invalid id — lowercase letters, digits, '-' and '_' only.", "zh-CN": "无效 id — 仅限小写字母、数字、'-' 和 '_'。" },
  "provider.providerExists": { en: "Provider '{id}' already exists.", "zh-CN": "服务商 '{id}' 已存在。" },
  "provider.providerRenamed": { en: "Renamed '{from}' → '{to}'.", "zh-CN": "已重命名 '{from}' → '{to}'。" },
  "provider.detailTitle": { en: "{id} — provider details", "zh-CN": "{id} — 服务商详情" },
  "provider.detailPlaceholder": { en: "Pick settings, a model, or an action (Esc: back)", "zh-CN": "选择设置、模型或操作 (Esc: 返回)" },
  "provider.noCustomProviders": { en: "No custom providers yet.", "zh-CN": "还没有自定义服务商。" },
  "provider.modelsHeader": { en: "Models", "zh-CN": "模型" },
  "provider.settingsHeader": { en: "Settings", "zh-CN": "设置" },
  "provider.actionsHeader": { en: "Actions", "zh-CN": "操作" },
  "provider.configuredHeader": { en: "Providers", "zh-CN": "服务商" },
  "provider.basicSettings": { en: "⚙ Basic settings…", "zh-CN": "⚙ 基础设置…" },
  "provider.addProviderFormTitle": { en: "Add custom provider — basic settings", "zh-CN": "添加自定义服务商 — 基础设置" },
  "provider.idTitle": { en: "New provider — id", "zh-CN": "新服务商 — id" },
  "provider.idPlaceholder": { en: "Used in refs '<id>/<model>'; lowercase letters, digits, '-' and '_'", "zh-CN": "用于引用 '<id>/<model>'；小写字母、数字、'-' 和 '_'" },
  "provider.idRequired": { en: "id is required.", "zh-CN": "id 为必填。" },
  "provider.providerFormTitleEdit": { en: "{id} — basic settings", "zh-CN": "{id} — 基础设置" },
  "provider.providerFormPlaceholder": { en: "Edit fields, then save (* = required; Esc: back)", "zh-CN": "编辑字段后保存 (* = 必填；Esc: 返回)" },
  "provider.saveProvider": { en: "💾 Save provider", "zh-CN": "💾 保存服务商" },
  "provider.nameLabel": { en: "name", "zh-CN": "名称" },
  "provider.editNameDesc": { en: "Display name shown in pickers", "zh-CN": "选择器中显示的名称" },
  "provider.nameTitle": { en: "{id} — name", "zh-CN": "{id} — 名称" },
  "provider.namePlaceholder": { en: "Shown in pickers ({hint}). Empty clears to the id.", "zh-CN": "在选择器中显示 ({hint})。留空则清除，回退为 id。" },
  "provider.npmLabel": { en: "npm", "zh-CN": "npm 包" },
  "provider.baseURLLabel": { en: "baseURL", "zh-CN": "服务地址" },
  "provider.apiKeyLabel": { en: "apiKey", "zh-CN": "API 密钥" },
  "provider.pickNpmTitle": { en: "{id} — npm package", "zh-CN": "{id} — npm 包" },
  "provider.pickNpmPlaceholder": { en: "Pick the SDK package — it decides the API protocol (Esc: back)", "zh-CN": "选择 SDK 包 — 决定 API 协议 (Esc: 返回)" },
  "provider.editBaseURLDesc": { en: "API endpoint base URL", "zh-CN": "API 端点地址" },
  "provider.editApiKeyDesc": { en: "API key credential", "zh-CN": "API 密钥凭证" },
  "provider.baseURLTitle": { en: "{id} — baseURL", "zh-CN": "{id} — 服务地址" },
  "provider.apiKeyTitle": { en: "{id} — apiKey", "zh-CN": "{id} — API 密钥" },
  "provider.baseURLPlaceholder": { en: "https://api.example.com/v1 or {env:VAR} ({hint}; empty clears)", "zh-CN": "https://api.example.com/v1 或 {env:VAR} ({hint}；留空清除)" },
  "provider.baseURLRequired": { en: "baseURL is required for openai-compatible providers.", "zh-CN": "openai 兼容服务商必须填写服务地址。" },
  "provider.apiKeyPlaceholder": { en: "sk-... or {env:VAR} ({hint}; empty keeps)", "zh-CN": "sk-... 或 {env:VAR} ({hint}；留空保留)" },
  "provider.fetchModels": { en: "📥 Fetch models…", "zh-CN": "📥 拉取模型…" },
  "provider.fetchModelsDesc": { en: "Fetch the remote model list and import matches as custom models", "zh-CN": "拉取远端模型列表，匹配项导入为自定义" },
  "provider.fetchPatternTitle": { en: "{id} — fetch pattern", "zh-CN": "{id} — 拉取 pattern" },
  "provider.fetchPatternPlaceholder": { en: "Glob filter for model ids, e.g. gpt-* (empty = *)", "zh-CN": "按模型 id 过滤的 glob，如 gpt-* (留空 = *)" },
  "provider.fetchNeedsBaseURL": { en: "Set baseURL before fetching.", "zh-CN": "拉取前请先设置服务地址。" },
  "provider.fetchNeedsKey": { en: "Set apiKey before fetching.", "zh-CN": "拉取前请先设置 API 密钥。" },
  "provider.keyMigrated": { en: "API key moved to the shared credential store used by /connect.", "zh-CN": "API 密钥已移至与 /connect 共享的凭证存储。" },
  "provider.keyInCredStore": { en: "set (in credential store)", "zh-CN": "已设置（凭证存储）" },
  "provider.keyInConfig": { en: "set (in config)", "zh-CN": "已设置（配置文件）" },
  "provider.fetchEnvMissing": { en: "Environment variable '{name}' is not set.", "zh-CN": "环境变量 '{name}' 未设置。" },
  "provider.fetchFailed": { en: "Fetch failed: {err}", "zh-CN": "拉取失败: {err}" },
  "provider.fetchNoMatch": { en: "Fetch OK — no models match '{pattern}' ({total} total).", "zh-CN": "拉取成功 — 没有匹配 '{pattern}' 的模型 (共 {total} 个)。" },
  "provider.fetchImported": { en: "Imported {added} model(s) into '{id}' (pattern '{pattern}'); {skipped} existing kept.", "zh-CN": "已导入 {added} 个模型到 '{id}' (pattern '{pattern}')；{skipped} 个已有模型保留。" },
  "provider.fetchNoNew": { en: "All {skipped} matched model(s) already exist on '{id}' — nothing added.", "zh-CN": "匹配的 {skipped} 个模型均已存在于 '{id}' — 未新增。" },
  "provider.addModel": { en: "➕ Add model…", "zh-CN": "➕ 添加模型…" },
  "provider.addModelDesc": { en: "Form sheet: identity, capabilities, limits", "zh-CN": "表单录入: 身份、能力、限制" },
  "provider.removeModelTitle": { en: "{id} — remove model", "zh-CN": "{id} — 删除模型" },
  "provider.modelFormTitleAdd": { en: "{id} — add model", "zh-CN": "{id} — 添加模型" },
  "provider.modelFormTitleEdit": { en: "{id}/{key} — edit model", "zh-CN": "{id}/{key} — 编辑模型" },
  "provider.modelFormPlaceholder": { en: "Pick a field to edit, or save (* = required; Esc: back)", "zh-CN": "选择要编辑的字段，或保存 (* = 必填；Esc: 返回)" },
  "provider.modelFieldTitle": { en: "{id} — model {field}", "zh-CN": "{id} — 模型 {field}" },
  "provider.formFieldsHeader": { en: "Fields", "zh-CN": "字段" },
  "provider.formCapsHeader": { en: "Capabilities", "zh-CN": "能力" },
  "provider.formLimitsHeader": { en: "Limits", "zh-CN": "限制" },
  "provider.formActionsHeader": { en: "Actions", "zh-CN": "操作" },
  "provider.capAttachmentDesc": { en: "Accepts image / file attachments", "zh-CN": "接受图片 / 文件附件" },
  "provider.capTemperatureDesc": { en: "Supports the temperature parameter", "zh-CN": "支持 temperature 参数" },
  "provider.capReasoningDesc": { en: "Reasoning model", "zh-CN": "推理模型" },
  "provider.capToolCallDesc": { en: "Tool calling (keep on for coding)", "zh-CN": "工具调用 (编码模型保持开)" },
  "provider.modalitiesPlaceholder": { en: "Enter/click to toggle, Esc to return", "zh-CN": "回车/点击切换，Esc 返回" },
  "provider.limitContextPlaceholder": { en: "Context window in tokens (empty = unset)", "zh-CN": "上下文窗口 (tokens，留空 = 未设置)" },
  "provider.limitOutputPlaceholder": { en: "Max output tokens (empty = unset)", "zh-CN": "最大输出 tokens (留空 = 未设置)" },
  "provider.invalidNumber": { en: "Not a valid non-negative integer.", "zh-CN": "不是有效的非负整数。" },
  "provider.saveModel": { en: "💾 Save model", "zh-CN": "💾 保存模型" },
  "provider.deleteProvider": { en: "🗑 Delete provider…", "zh-CN": "🗑 删除服务商…" },
  "provider.deleteProviderTitle": { en: "{id} — delete provider", "zh-CN": "{id} — 删除服务商" },
  "provider.deleteProviderConfirm": { en: "Remove '{id}', all its models and the stored credential? This cannot be undone.", "zh-CN": "移除 '{id}'、其全部模型及已存密钥？不可撤销。" },
  "provider.clearModels": { en: "🗑 Clear models…", "zh-CN": "🗑 清空模型…" },
  "provider.clearModelsDesc": { en: "Remove models by glob pattern (default: all)", "zh-CN": "按 glob 模式移除模型（默认：全部）" },
  "provider.clearModelsTitle": { en: "{id} — clear models", "zh-CN": "{id} — 清空模型" },
  "provider.clearModelsPatternTitle": { en: "{id} — clear models by pattern", "zh-CN": "{id} — 按模式清空模型" },
  "provider.clearModelsPatternPlaceholder": { en: "Glob pattern for model keys, e.g. gpt-* (empty = *)", "zh-CN": "模型 key 的 glob 模式，如 gpt-*（留空 = *）" },
  "provider.clearModelsConfirm": { en: "Remove {count} model(s) matching '{pattern}' from '{id}'? Profiles referencing them will break.", "zh-CN": "从 '{id}' 移除匹配 '{pattern}' 的 {count} 个模型？引用它们的配置方案将会失效。" },
  "provider.noModelsToClear": { en: "No models to clear on '{id}'.", "zh-CN": "'{id}' 上没有可清空的模型。" },
  "provider.clearModelsNoMatch": { en: "No models on '{id}' match '{pattern}'.", "zh-CN": "'{id}' 上没有匹配 '{pattern}' 的模型。" },
  "provider.modelsCleared": { en: "Cleared {count} model(s) matching '{pattern}' from '{id}'.", "zh-CN": "已从 '{id}' 清空匹配 '{pattern}' 的 {count} 个模型。" },
  "provider.providerDeleted": { en: "Provider '{id}' deleted.", "zh-CN": "服务商 '{id}' 已删除。" },
  "provider.deleteModel": { en: "🗑 Delete model…", "zh-CN": "🗑 删除模型…" },
  "provider.modelKeyPlaceholder": { en: "Key used in refs '<provider>/<key>', e.g. gpt-5.6-low or vendor/gpt-5.6", "zh-CN": "引用中使用的 key '<provider>/<key>'，如 gpt-5.6-low 或 vendor/gpt-5.6" },
  "provider.modelIdPlaceholder": { en: "Id sent to the API (empty keeps the key)", "zh-CN": "发送给 API 的 id (留空则使用 key)" },
  "provider.modelNamePlaceholder": { en: "Shown in pickers (empty keeps the key)", "zh-CN": "在选择器中显示 (留空则使用 key)" },
  "provider.fieldStatusDesc": { en: "deprecated = hidden from pickers (soft disable); alpha = experimental only", "zh-CN": "deprecated = 从选择器隐藏 (软禁用)；alpha = 仅实验模式显示" },
  "provider.wizardTitle": { en: "Provider setup wizard", "zh-CN": "服务商配置向导" },
  "provider.writeFailed": { en: "Failed to write config: {err}", "zh-CN": "写入配置失败: {err}" },
  "provider.configSaved": { en: "'{id}' saved — restart to take effect.", "zh-CN": "'{id}' 已保存 — 重启后生效。" },
  "provider.modelAdded": { en: "Model '{key}' added to '{id}'.", "zh-CN": "模型 '{key}' 已添加到 '{id}'。" },
  "provider.modelRemoved": { en: "Model '{key}' removed from '{id}'.", "zh-CN": "模型 '{key}' 已从 '{id}' 删除。" },
  "provider.addModelFailed": { en: "Failed to add model: {err}", "zh-CN": "添加模型失败: {err}" },
  "provider.invalidKey": { en: "Invalid key — no spaces; '/' allowed inside, not at edges or doubled.", "zh-CN": "无效 key — 不能含空格；'/' 可在中间使用，但不能在首尾或连续出现。" },
  "provider.modelExists": { en: "Model '{key}' already exists on '{id}'.", "zh-CN": "模型 '{key}' 已存在于 '{id}'。" },
  "provider.providerVanished": { en: "Provider '{id}' no longer exists.", "zh-CN": "服务商 '{id}' 已不存在。" },
  "provider.removeModelConfirm": { en: "Remove model '{key}' from '{id}'? Profiles referencing '{id}/{key}' will break.", "zh-CN": "从 '{id}' 删除模型 '{key}'？引用 '{id}/{key}' 的配置方案将会失效。" },
  "provider.noProvidersAvailable": { en: "No providers configured and no definitions in {dir}.", "zh-CN": "未配置服务商且 {dir} 中无定义文件。" },
  "provider.cannotReadConfig": { en: "Cannot read {path}: {err}", "zh-CN": "无法读取 {path}: {err}" },

  // ════════════════════════════════════════════════════════════════
  // ── Project wizard ─────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════
  "project.cmdTitle": { en: "Project setup wizard", "zh-CN": "项目设置向导" },
  "project.cmdDesc": { en: "Configure project switches, sync templates, refresh indexes", "zh-CN": "配置项目开关，同步模板，刷新索引" },
  "project.toastTitle": { en: "Project wizard", "zh-CN": "项目向导" },
  "project.mainPlaceholder": { en: "Select action (Esc to exit)", "zh-CN": "选择操作 (Esc 退出)" },
  "project.configureSwitches": { en: "⚙️ Configure Project Switches", "zh-CN": "⚙️ 配置项目开关" },
  "project.syncTemplates": { en: "🔄 Sync Template Switches", "zh-CN": "🔄 同步模板开关" },
  "project.syncTemplatesDesc": { en: "Append missing switch lines to config", "zh-CN": "将缺失的开关行追加到配置" },
  "project.refreshIndex": { en: "⚡ Refresh Code Index", "zh-CN": "⚡ 刷新代码索引" },
  "project.refreshIndexDesc": { en: "Catch up codegraph & gitnexus indexes", "zh-CN": "更新 codegraph 和 gitnexus 索引" },
  "project.exitWizard": { en: "❌ Exit Wizard", "zh-CN": "❌ 退出向导" },
  "project.exitWizardDesc": { en: "Close setup dialog (or Esc)", "zh-CN": "关闭设置对话框 (或 Esc)" },
  "project.configureSwitchesTitle": { en: "Configure Switches — {config}", "zh-CN": "配置开关 — {config}" },
  "project.configureSwitchesPlaceholder": { en: "Select switch to edit (Esc cancels)", "zh-CN": "选择要编辑的开关 (Esc 取消)" },
  "project.setupHeader": { en: "Setup", "zh-CN": "设置" },
  "project.maintainHeader": { en: "Maintenance", "zh-CN": "维护" },
  "project.advisorHeader": { en: "Advisor", "zh-CN": "顾问" },
  "project.guardsHeader": { en: "Quality Guards", "zh-CN": "质量护栏" },
  "project.actionsHeader": { en: "Actions", "zh-CN": "操作" },
  "project.saveApply": { en: "💾 Save & Apply Changes", "zh-CN": "💾 保存并应用变更" },
  "project.saveApplyDesc": { en: "Write switches to config file", "zh-CN": "将开关写入配置文件" },
  "project.backToMain": { en: "🔙 Back to Main Menu", "zh-CN": "🔙 返回主菜单" },
  "project.backToMainDesc": { en: "Return to Level 1 action menu", "zh-CN": "返回第一层操作菜单" },
  "project.initResult": { en: "Project Initialization Result", "zh-CN": "项目初始化结果" },
  "project.updateResult": { en: "Project Update Result", "zh-CN": "项目更新结果" },
  "project.initFailed": { en: "Init / Update Failed", "zh-CN": "初始化 / 更新失败" },
  "project.saveResult": { en: "Project Save Result", "zh-CN": "项目保存结果" },
  "project.saveFailed": { en: "Save Failed", "zh-CN": "保存失败" },
  "project.syncResult": { en: "Template Switches Sync Result", "zh-CN": "模板开关同步结果" },
  "project.syncError": { en: "Sync Error", "zh-CN": "同步错误" },
  "project.indexResult": { en: "Code Index Refresh Results", "zh-CN": "代码索引刷新结果" },
  "project.indexError": { en: "Index Error", "zh-CN": "索引错误" },
  "project.newProject": { en: "Project Setup — New Project", "zh-CN": "项目设置 — 新项目" },
  "project.setupExisting": { en: "Project Setup — {config}", "zh-CN": "项目设置 — {config}" },
  "project.applyUpdate": { en: "🚀 Apply & Update Configuration", "zh-CN": "🚀 应用并更新配置" },
  "project.applyInit": { en: "🚀 Apply & Initialize Scaffolding", "zh-CN": "🚀 应用并初始化脚手架" },
  "project.applyUpdateDesc": { en: "Save switches & update baseline files", "zh-CN": "保存开关并更新基线文件" },
  "project.applyInitDesc": { en: "Create config, AGENTS.md & git-commits.md", "zh-CN": "创建配置、AGENTS.md 和 git-commits.md" },
  "project.configUpdated": { en: "Project configuration updated!", "zh-CN": "项目配置已更新！" },
  "project.configSavedToast": { en: "Project configuration saved!", "zh-CN": "项目配置已保存！" },
  "project.initSuccess": { en: "Project initialized successfully!", "zh-CN": "项目初始化成功！" },
  "project.operationFailed": { en: "Operation failed: {err}", "zh-CN": "操作失败: {err}" },
  "project.saveFailedMsg": { en: "Save failed: {err}", "zh-CN": "保存失败: {err}" },
  "project.indexFailed": { en: "Index refresh failed: {err}", "zh-CN": "索引刷新失败: {err}" },
  "project.syncMissing": { en: "⚠️ Project config does not exist.\nPlease run Init first.", "zh-CN": "⚠️ 项目配置文件不存在。\n请先运行初始化。" },
  "project.syncUpToDate": { en: "ℹ️ Configuration is already up to date.\nAll latest template switch keys are already present.", "zh-CN": "ℹ️ 配置已是最新。\n所有最新模板开关键已存在。" },
  "project.syncAdded": { en: "✅ Successfully appended {count} new switch line(s) to config:\n\n{lines}\n\nExisting configuration content was preserved.", "zh-CN": "✅ 已追加 {count} 个新开关行到配置:\n\n{lines}\n\n已保留现有配置内容。" },
  "project.syncMalformed": { en: "❌ Configuration file is malformed (missing proper closing brace).\nPlease fix the file manually.", "zh-CN": "❌ 配置文件格式错误（缺少正确的闭合括号）。\n请手动修复文件。" },
  "project.syncFailed": { en: "Sync operation failed: {err}", "zh-CN": "同步操作失败: {err}" },
  "project.noBackends": { en: "ℹ️ No backends needed index refresh.", "zh-CN": "ℹ️ 无后端需要索引刷新。" },

  // ════════════════════════════════════════════════════════════════
  // ── Queue manager ──────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════
  "queue.cmdTitle": { en: "Manage queued messages", "zh-CN": "管理排队消息" },
  "queue.cmdDesc": { en: "View, edit, or cancel queued messages in the current session", "zh-CN": "查看、编辑或取消当前会话的排队消息" },
  "queue.toastTitle": { en: "Queue manager", "zh-CN": "队列管理" },
  "queue.editTitle": { en: "Edit queued message", "zh-CN": "编辑排队消息" },
  "queue.editPlaceholder": { en: "New text for this queued message (replaces all text parts)", "zh-CN": "此排队消息的新文本（替换所有文本部分）" },
  "queue.cancelTitle": { en: "Cancel queued message", "zh-CN": "取消排队消息" },
  "queue.fullTextTitle": { en: "Queued message — full text", "zh-CN": "排队消息 — 完整文本" },
  "queue.entryTitle": { en: "Queued message ({age})", "zh-CN": "排队消息 ({age})" },
  "queue.editAction": { en: "( Edit text… )", "zh-CN": "( 编辑文本… )" },
  "queue.editActionDesc": { en: "Rewrite this message before it is processed", "zh-CN": "在消息处理前重写内容" },
  "queue.cancelAction": { en: "( Cancel message )", "zh-CN": "( 取消消息 )" },
  "queue.viewAction": { en: "( View full text )", "zh-CN": "( 查看全文 )" },
  "queue.viewActionDesc": { en: "Show the complete message text", "zh-CN": "显示完整消息文本" },
  "queue.backToQueue": { en: "( ← Back to queue )", "zh-CN": "( ← 返回队列 )" },
  "queue.listTitle": { en: "Message queue — {count} queued{busy}", "zh-CN": "消息队列 — {count} 条排队{busy}" },
  "queue.queuedHeader": { en: "Queued", "zh-CN": "排队中" },
  "queue.actionsHeader": { en: "Actions", "zh-CN": "操作" },
  "queue.sessionBusy": { en: " (session busy)", "zh-CN": " (会话忙碌)" },
  "queue.sessionIdle": { en: " (session idle)", "zh-CN": " (会话空闲)" },
  "queue.listPlaceholder": { en: "Pick a queued message to edit or cancel (Esc closes)", "zh-CN": "选择排队消息进行编辑或取消 (Esc 关闭)" },
  "queue.cancelAll": { en: "( Cancel ALL queued messages )", "zh-CN": "( 取消全部排队消息 )" },
  "queue.cancelAllTitle": { en: "Cancel ALL queued messages", "zh-CN": "取消全部排队消息" },
  "queue.editSaved": { en: "Edit saved — takes effect when this message's turn arrives.", "zh-CN": "编辑已保存 — 轮到该消息时生效。" },
  "queue.editFailed": { en: "Edit failed: {err}", "zh-CN": "编辑失败: {err}" },
  "queue.cancelled": { en: "Queued message cancelled.", "zh-CN": "排队消息已取消。" },
  "queue.cancelFailed": { en: "Cancel failed: {err}", "zh-CN": "取消失败: {err}" },
  "queue.allCancelled": { en: "All {count} queued message{s} cancelled.", "zh-CN": "已取消全部 {count} 条排队消息。" },
  "queue.loadMessagesFailed": { en: "Failed to load messages (HTTP {status}).", "zh-CN": "加载消息失败 (HTTP {status})。" },
  "queue.loadMessagesError": { en: "Failed to load messages: {err}", "zh-CN": "加载消息失败: {err}" },
  "queue.deleteFailedHttp": { en: "Delete failed (HTTP {status}).", "zh-CN": "删除失败 (HTTP {status})。" },
  "queue.deleteFailed": { en: "Delete failed: {err}", "zh-CN": "删除失败: {err}" },
  "queue.busyStripFailed": { en: "Busy-strip failed: {err}", "zh-CN": "忙碌剥离失败: {err}" },
  "queue.noTextParts": { en: "This message has no editable text parts.", "zh-CN": "此消息没有可编辑的文本部分。" },
  "queue.emptyText": { en: "Empty text — use Cancel instead.", "zh-CN": "文本为空 — 请改用取消。" },
  "queue.unchanged": { en: "Unchanged.", "zh-CN": "未更改。" },
  "queue.noQueuedMessages": { en: "No queued messages in this session.", "zh-CN": "此会话中没有排队消息。" },
  "queue.cancelResult": { en: "Cancelled {ok}/{total} queued messages.", "zh-CN": "已取消 {ok}/{total} 条排队消息。" },
  "queue.openSessionFirst": { en: "Open a session first — the queue is per-session.", "zh-CN": "请先打开一个会话 — 队列是按会话隔离的。" },
  "queue.noCurrentSession": { en: "No current session.", "zh-CN": "没有当前会话。" },
  "queue.attachmentOnly": { en: "[attachment only — no text]", "zh-CN": "[仅附件 — 无文本]" },
  "queue.busyStripWarning": { en: "Session busy — attachment-only messages can't be stripped safely. Wait for idle, then cancel again.", "zh-CN": "会话忙碌 — 仅附件消息无法安全剥离。请等待空闲后再取消。" },
  "queue.busyStripResult": { en: "Session busy — message content stripped (tombstone kept). It will not send instructions.", "zh-CN": "会话忙碌 — 消息内容已剥离（保留墓碑标记）。不会发送指令。" },
  "queue.confirmCancelBusy": { en: "Cancel this queued message?\n\n\"{preview}\"\n\nThe session is BUSY: the message cannot be deleted right now — its content will be stripped (tombstone kept) instead.", "zh-CN": "取消此排队消息？\n\n\"{preview}\"\n\n会话忙碌：消息无法立即删除 — 其内容将被剥离（保留墓碑标记）。" },
  "queue.confirmCancelIdle": { en: "Cancel this queued message?\n\n\"{preview}\"\n\nThe session is idle: the message will be deleted permanently.", "zh-CN": "取消此排队消息？\n\n\"{preview}\"\n\n会话空闲：消息将被永久删除。" },
  "queue.confirmCancelAllBusy": { en: "Strip all {count} queued messages? The session is BUSY — contents are replaced with tombstones (messages stay visible but send no instructions).", "zh-CN": "剥离全部 {count} 条排队消息？会话忙碌 — 内容将被替换为墓碑标记（消息保持可见但不发送指令）。" },
  "queue.confirmCancelAllIdle": { en: "Delete all {count} queued messages permanently?", "zh-CN": "永久删除全部 {count} 条排队消息？" },
  "queue.noTextAttachmentsOnly": { en: "(no text — attachments only)", "zh-CN": "(无文本 — 仅附件)" },
  "queue.stripAllCount": { en: "Strip/delete all {count} queued messages", "zh-CN": "剥离/删除全部 {count} 条排队消息" },
  "queue.textPartCount": { en: "{count} text part(s)", "zh-CN": "{count} 个文本部分" },
  "queue.attachmentCount": { en: "{count} attachment(s)", "zh-CN": "{count} 个附件" },
} as const

type StringKey = keyof typeof STRINGS

// ─── tr() function ───────────────────────────────────────────────────

export function tr(key: StringKey, params?: Record<string, string | number>): string {
  const entry = STRINGS[key] as StringEntry | undefined
  if (!entry) return key
  let text: string = entry[currentLocale] ?? entry.en
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      // Escape special regex characters in the key to prevent injection
      const escapedKey = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      text = text.replace(new RegExp(`\{${escapedKey}\}`, "g"), String(v))
    }
  }
  return text
}

// ─── Language switch (shared by all wizard main menus) ─────────────

export const SWITCH_LANG = "__switch_lang__"

/**
 * Central language-switch action. With two registered locales it
 * toggles directly (one-click); with more it opens a locale picker.
 * `reopen` re-renders the caller's menu so it refreshes in the new
 * language. Adding a locale requires NO wizard-side changes.
 *
 * Usage:
 *   import { languageOption, switchLanguage, SWITCH_LANG } from "./i18n"
 *   // in options array:  languageOption(api)
 *   // in onSelect:
 *   if (option.value === SWITCH_LANG) {
 *     switchLanguage(api, () => showMainMenu(api))
 *     return
 *   }
 */
export function switchLanguage(api: TuiPluginApi, reopen: () => void): void {
  const apply = (code: Locale) => {
    setLocale(api, code)
    try {
      api.ui.toast({ title: tr("common.langTitle"), message: tr("common.langSwitched", { lang: localeName(code) }), variant: "info" })
    } catch { /* ui.toast unsupported */ }
    reopen()
  }
  if (LOCALES.length <= 2) {
    apply(nextLocale())
    return
  }
  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<Locale>({
        title: tr("common.langTitle"),
        placeholder: tr("common.langPickPlaceholder"),
        options: LOCALES.map((l) => ({ title: l.name, value: l.code })),
        current: currentLocale,
        onSelect: (option) => {
          navigated = true
          apply(option.value)
        },
      }),
    () => {
      // Esc closes the picker — return to the caller's menu; the host
      // clears the dialog first, so delay one beat before re-opening.
      if (!navigated) setTimeout(reopen, 0)
    },
  )
}

/**
 * Menu option for language switching, inserted into any wizard's main
 * DialogSelect options array. Handle it via `switchLanguage` above.
 */
export function languageOption(_api: TuiPluginApi): DialogOption<string> {
  // two locales → show the direct toggle target; more → the picker decides
  const title = LOCALES.length <= 2
    ? `🌐 ${localeName(currentLocale)} → ${localeName(nextLocale())}`
    : `🌐 ${localeName(currentLocale)}`
  return {
    title,
    value: SWITCH_LANG,
    description: tr("common.langDesc"),
  }
}

