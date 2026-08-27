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

export type Locale = "en" | "zh-CN"

/**
 * Convenience alias for dialog option objects used by all wizards.
 */
export type DialogOption<V = string> = TuiDialogSelectOption<V>

type StringEntry = Record<Locale, string>

// ─── Locale state ────────────────────────────────────────────────────

let currentLocale: Locale = "en"

export function getLocale(): Locale {
  return currentLocale
}

function detectLocale(): Locale {
  const envLang = process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || ""
  if (/zh|cn|hans/i.test(envLang)) return "zh-CN"
  try {
    const sysLocale = Intl.DateTimeFormat().resolvedOptions().locale
    if (/zh|cn/i.test(sysLocale)) return "zh-CN"
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (/Shanghai|Chongqing|Urumqi|Harbin|Beijing|PRC|Asia\/Taipei|Asia\/Hong_Kong/i.test(tz)) return "zh-CN"
  } catch { /* ignore */ }
  return "en"
}

const KV_KEY = "opencode.locale"

let initialized = false

export function initI18n(api: TuiPluginApi): void {
  // Guard against repeated calls from multiple plugins —
  // only the first call performs detection & KV write.
  if (initialized) return
  initialized = true
  const stored = api.kv.get<Locale>(KV_KEY)
  if (stored === "en" || stored === "zh-CN") {
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

export function toggleLocale(api: TuiPluginApi): Locale {
  const next = currentLocale === "en" ? "zh-CN" : "en"
  setLocale(api, next)
  return next
}

export function localeName(locale: Locale): string {
  return locale === "zh-CN" ? "中文" : "English"
}

// ─── Translation table ──────────────────────────────────────────────
// Keys are namespaced: "common.xxx", "profile.xxx", "provider.xxx",
// "project.xxx", "queue.xxx".  Placeholders use {name} syntax.

const STRINGS = {
  // ════════════════════════════════════════════════════════════════
  // ── Common (shared across all wizards) ───────────────────────────
  // ════════════════════════════════════════════════════════════════
  "common.back": { en: "( Back )", "zh-CN": "( 返回 )" },
  "common.cancel": { en: "( Cancel )", "zh-CN": "( 取消 )" },
  "common.applyChanges": { en: "( Apply changes )", "zh-CN": "( 应用变更 )" },
  "common.escBack": { en: "Esc: back", "zh-CN": "Esc: 返回" },
  "common.escClose": { en: "Esc: close", "zh-CN": "Esc: 关闭" },
  "common.activeMarker": { en: "← active", "zh-CN": "← 当前" },
  "common.currentMarker": { en: "← current", "zh-CN": "← 当前" },
  "common.unset": { en: "(unset)", "zh-CN": "(未设置)" },
  "common.config": { en: "config", "zh-CN": "配置" },
  "common.builtin": { en: "built-in", "zh-CN": "内置" },
  "common.connected": { en: "connected", "zh-CN": "已连接" },
  "common.modelCount": { en: "{count} model(s)", "zh-CN": "{count} 个模型" },
  "common.langTitle": { en: "Switch language", "zh-CN": "切换语言" },
  "common.langDesc": { en: "Toggle between English and 中文", "zh-CN": "在 English 和 中文 之间切换" },
  "common.langSwitched": { en: "Language switched to {lang}", "zh-CN": "语言已切换为 {lang}" },

  // ════════════════════════════════════════════════════════════════
  // ── Profile wizard ──────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════
  "profile.cmdTitle": { en: "Switch model profile", "zh-CN": "切换模型预设" },
  "profile.cmdDesc": { en: "Edit agent tiers, manage profile models, or select a profile", "zh-CN": "编辑 agent 层级，管理预设模型，或选择预设" },

  // Main menu
  "profile.mainTitle": { en: "Profile wizard", "zh-CN": "预设向导" },
  "profile.mainPlaceholder": { en: "Pick an action (Esc: close)", "zh-CN": "选择一个操作 (Esc: 关闭)" },
  "profile.editAgentTier": { en: "Edit: Agent→Tier", "zh-CN": "编辑: Agent→Tier" },
  "profile.editAgentTierDesc": { en: "Reassign which tier (flash/standard/pro/max/vision) each agent uses", "zh-CN": "重新分配每个 agent 所属层级 (flash/standard/pro/max/vision)" },
  "profile.manageModels": { en: "Manage: Profile→Models", "zh-CN": "管理: 预设→模型" },
  "profile.manageModelsDesc": { en: "Edit a profile's tier→model mapping, or add/delete profiles", "zh-CN": "编辑预设的 tier→model 映射，或添加/删除预设" },
  "profile.selectProfile": { en: "Select: Profile", "zh-CN": "选择: 预设" },
  "profile.selectProfileActive": { en: "Select: Profile (active: {active})", "zh-CN": "选择: 预设 (当前: {active})" },
  "profile.selectProfileDesc": { en: "Pick a profile and apply immediately", "zh-CN": "选一个预设并立即应用" },
  "profile.backToMain": { en: "Return to main menu", "zh-CN": "返回主菜单" },

  // Edit: Agent→Tier
  "profile.editTierTitle": { en: "Edit agent→tier", "zh-CN": "编辑 agent→tier" },
  "profile.editTierTitlePending": { en: "Edit agent→tier ({count} pending)", "zh-CN": "编辑 agent→tier ({count} 个待应用)" },
  "profile.editTierPlaceholder": { en: "Pick an agent to reassign its tier (Esc: back)", "zh-CN": "选择 agent 重新分配层级 (Esc: 返回)" },
  "profile.applyChangesDesc": { en: "Write {count} change{s} to tiers.json and apply live", "zh-CN": "将 {count} 个变更写入 tiers.json 并热生效" },
  "profile.tierModelDesc": { en: "Tier: {tier} — model: {model}", "zh-CN": "层级: {tier} — 模型: {model}" },
  "profile.pickTierTitle": { en: "Set tier for '{agent}' (current: {tier})", "zh-CN": "设置 '{agent}' 的层级 (当前: {tier})" },
  "profile.pickTierPlaceholder": { en: "Pick a tier (Esc: back)", "zh-CN": "选择层级 (Esc: 返回)" },
  "profile.backToAgentList": { en: "Return to agent list", "zh-CN": "返回 agent 列表" },
  "profile.tierChanged": { en: "{agent}: {old} → {new} (pending)", "zh-CN": "{agent}: {old} → {new} (待应用)" },
  "profile.writeTiersFailed": { en: "Failed to write tiers.json: {err}", "zh-CN": "写入 tiers.json 失败: {err}" },
  "profile.readConfigFailed": { en: "Cannot read opencode.jsonc: {err}", "zh-CN": "无法读取 opencode.jsonc: {err}" },
  "profile.noAgents": { en: "No agents found in opencode.jsonc.", "zh-CN": "opencode.jsonc 中未找到 agent。" },
  "profile.tiersUpdatedConfigFailed": { en: "tiers.json updated, but cannot read opencode.jsonc: {err}. Restart or run /profile to apply.", "zh-CN": "tiers.json 已更新，但无法读取 opencode.jsonc: {err}。重启或运行 /profile 来应用。" },
  "profile.noModelRef": { en: "{agent} → {tier} (no model ref — set via /profile)", "zh-CN": "{agent} → {tier} (无模型引用 — 通过 /profile 设置)" },
  "profile.writeOpencodeFailed": { en: "tiers.json updated, but failed to write opencode.jsonc: {err}. Restart or run /profile.", "zh-CN": "tiers.json 已更新，但写入 opencode.jsonc 失败: {err}。重启或运行 /profile。" },
  "profile.tierChangesApplied": { en: "{count} tier change{s} applied — {details}. {live}", "zh-CN": "{count} 个层级变更已应用 — {details}。{live}" },
  "profile.liveNoRestart": { en: "Live, no restart needed.", "zh-CN": "已热生效，无需重启。" },
  "profile.restartToApply": { en: "Restart to apply.", "zh-CN": "重启后生效。" },

  // Manage: Profile→Models
  "profile.manageTitle": { en: "Manage: Profile→Models", "zh-CN": "管理: 预设→模型" },
  "profile.managePlaceholder": { en: "Pick a profile to edit its tier→model mapping (Esc: back)", "zh-CN": "选择预设编辑其 tier→model 映射 (Esc: 返回)" },
  "profile.addProfile": { en: "( Add profile )", "zh-CN": "( 添加预设 )" },
  "profile.addProfileDesc": { en: "Create a new blank profile JSON in ~/.config/opencode/profiles/", "zh-CN": "在 ~/.config/opencode/profiles/ 创建空白预设 JSON" },
  "profile.deleteProfile": { en: "( Delete profile )", "zh-CN": "( 删除预设 )" },
  "profile.deleteProfileDesc": { en: "Remove an existing profile JSON file", "zh-CN": "删除已有的预设 JSON 文件" },
  "profile.reviewTiersTitle": { en: "{name} — review tiers", "zh-CN": "{name} — 审阅层级" },
  "profile.reviewTiersPlaceholder": { en: "Pick a tier to change its model (provider → model), or apply (Esc: back)", "zh-CN": "选择层级修改其模型 (provider → model)，或应用 (Esc: 返回)" },
  "profile.applyChangesModelDesc": { en: "Write the mapping below to the profile JSON and apply", "zh-CN": "将以下映射写入预设 JSON 并应用" },
  "profile.backToProfileList": { en: "Return to profile list (keep overrides)", "zh-CN": "返回预设列表（保留覆写）" },
  "profile.cancelDiscard": { en: "Discard overrides and return to profile list", "zh-CN": "丢弃覆写，返回预设列表" },
  "profile.pickProviderTitle": { en: "{name} — tier.{tier} → provider", "zh-CN": "{name} — tier.{tier} → 服务商" },
  "profile.pickProviderPlaceholder": { en: "Pick a provider (Esc: back)", "zh-CN": "选择服务商 (Esc: 返回)" },
  "profile.typeCustomRef": { en: "( Type a custom ref )", "zh-CN": "( 手动输入引用 )" },
  "profile.typeCustomRefDesc": { en: "For providers not listed above", "zh-CN": "用于未列出的服务商" },
  "profile.backToTierReview": { en: "Return to tier review", "zh-CN": "返回层级审阅" },
  "profile.pickModelTitle": { en: "{name} — tier.{tier} → model on {provider}", "zh-CN": "{name} — tier.{tier} → {provider} 上的模型" },
  "profile.pickModelPlaceholder": { en: "Pick a model — {count} available (Esc: back)", "zh-CN": "选择模型 — {count} 个可用 (Esc: 返回)" },
  "profile.backToProviderList": { en: "Return to provider list", "zh-CN": "返回服务商列表" },
  "profile.modelChanged": { en: "{name}: tier.{tier} → {provider}/{model} (pending)", "zh-CN": "{name}: tier.{tier} → {provider}/{model} (待应用)" },
  "profile.promptTierRefTitle": { en: "{name} — tier.{tier}", "zh-CN": "{name} — tier.{tier}" },
  "profile.promptTierRefPlaceholder": { en: "<provider>/<model_id> (empty keeps current)", "zh-CN": "<provider>/<model_id> (留空保留当前值)" },
  "profile.invalidRef": { en: "Invalid ref '{ref}' — expected '<provider>/<model_id>'.", "zh-CN": "无效引用 '{ref}' — 格式应为 '<provider>/<model_id>'。" },
  "profile.customized": { en: "{override} ← customized (preset: {ref})", "zh-CN": "{override} ← 已覆写 (原预设: {ref})" },
  "profile.profileVanished": { en: "Profile '{name}' vanished.", "zh-CN": "预设 '{name}' 不见了。" },
  "profile.writeProfileFailed": { en: "Failed to write profile '{name}': {err}", "zh-CN": "写入预设 '{name}' 失败: {err}" },
  "profile.profileUpdatedApplied": { en: "Profile '{name}' updated and applied — {updated} agent(s) updated ({details}). {live}", "zh-CN": "预设 '{name}' 已更新并应用 — {updated} 个 agent 已更新 ({details})。{live}" },
  "profile.profileSavedApplyFailed": { en: "Profile JSON saved, but failed to apply: {err}", "zh-CN": "预设 JSON 已保存，但应用失败: {err}" },

  // Add / Delete profile
  "profile.addProfileTitle": { en: "Add new profile", "zh-CN": "添加新预设" },
  "profile.addProfilePlaceholder": { en: "Profile name (e.g. my-custom)", "zh-CN": "预设名称 (如 my-custom)" },
  "profile.profileExists": { en: "Profile '{name}' already exists.", "zh-CN": "预设 '{name}' 已存在。" },
  "profile.customProfile": { en: "Custom profile", "zh-CN": "自定义预设" },
  "profile.profileCreated": { en: "Profile '{name}' created — edit its tiers via Manage.", "zh-CN": "预设 '{name}' 已创建 — 通过管理编辑其层级。" },
  "profile.createProfileFailed": { en: "Failed to create profile: {err}", "zh-CN": "创建预设失败: {err}" },
  "profile.noProfilesToDelete": { en: "No profiles to delete.", "zh-CN": "没有可删除的预设。" },
  "profile.deleteProfileTitle": { en: "Delete profile", "zh-CN": "删除预设" },
  "profile.deleteProfilePlaceholder": { en: "Pick a profile to delete (Esc: back)", "zh-CN": "选择要删除的预设 (Esc: 返回)" },
  "profile.backToProfileList2": { en: "Return to profile list", "zh-CN": "返回预设列表" },
  "profile.confirmDeleteMsg": { en: "Delete profile '{name}'?\n\nFile: {path}\n\nA .bak backup will be kept. This cannot be undone.", "zh-CN": "删除预设 '{name}'?\n\n文件: {path}\n\n将保留 .bak 备份。此操作不可撤销。" },
  "profile.profileDeleted": { en: "Profile '{name}' deleted (.bak kept).", "zh-CN": "预设 '{name}' 已删除（保留 .bak 备份）。" },
  "profile.deleteFailed": { en: "Failed to delete: {err}", "zh-CN": "删除失败: {err}" },

  // Select: Profile
  "profile.selectTitle": { en: "Select: Profile", "zh-CN": "选择: 预设" },
  "profile.selectPlaceholder": { en: "Pick a profile to apply immediately (Esc: back)", "zh-CN": "选择预设立即应用 (Esc: 返回)" },
  "profile.noProfiles": { en: "No profiles found in {dir}.", "zh-CN": "在 {dir} 中未找到预设。" },
  "profile.switchedTo": { en: "Switched to '{name}' — {updated} agent(s) updated ({details}). {live}", "zh-CN": "已切换到 '{name}' — {updated} 个 agent 已更新 ({details})。{live}" },
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
  "profile.activeProfileToast": { en: "Active profile: {name}", "zh-CN": "当前预设: {name}" },

  // ════════════════════════════════════════════════════════════════
  // ── Provider wizard ────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════
  "provider.cmdTitle": { en: "Configure provider", "zh-CN": "配置服务商" },
  "provider.cmdDesc": { en: "Set up credentials and manage models for custom providers", "zh-CN": "配置自定义服务商凭证和管理模型" },
  "provider.toastTitle": { en: "Provider wizard", "zh-CN": "服务商向导" },
  "provider.setupTitle": { en: "Provider setup — select provider", "zh-CN": "服务商配置 — 选择服务商" },
  "provider.setupPlaceholder": { en: "Pick a provider to configure credentials for", "zh-CN": "选择要配置凭证的服务商" },
  "provider.manageModels": { en: "( Manage provider models )", "zh-CN": "( 管理服务商模型 )" },
  "provider.manageModelsDesc": { en: "Add or remove models on an active provider", "zh-CN": "添加或删除已激活服务商的模型" },
  "provider.manageTitle": { en: "Manage models — select provider", "zh-CN": "管理模型 — 选择服务商" },
  "provider.managePlaceholder": { en: "Pick a provider to add/remove models (Esc closes)", "zh-CN": "选择服务商添加/删除模型 (Esc 关闭)" },
  "provider.backToMain": { en: "Return to provider list", "zh-CN": "返回服务商列表" },
  "provider.modelsTitle": { en: "{id} — models", "zh-CN": "{id} — 模型" },
  "provider.modelsPlaceholder": { en: "Pick a model to remove, or add a new one (Esc closes)", "zh-CN": "选择要删除的模型，或添加新模型 (Esc 关闭)" },
  "provider.addModel": { en: "( Add model… )", "zh-CN": "( 添加模型… )" },
  "provider.addModelDesc": { en: "Enter key, upstream id and display name", "zh-CN": "输入 key、上游 id 和显示名" },
  "provider.removeModelTitle": { en: "{id} — remove model", "zh-CN": "{id} — 删除模型" },
  "provider.modelKeyTitle": { en: "{id} — new model key", "zh-CN": "{id} — 新模型 key" },
  "provider.modelKeyPlaceholder": { en: "Key used in refs '<provider>/<key>', e.g. gpt-5.6-low or vendor/gpt-5.6", "zh-CN": "引用中使用的 key '<provider>/<key>'，如 gpt-5.6-low 或 vendor/gpt-5.6" },
  "provider.modelIdTitle": { en: "{id}/{key} — upstream model id", "zh-CN": "{id}/{key} — 上游模型 id" },
  "provider.modelIdPlaceholder": { en: "Id sent to the API (empty keeps the key)", "zh-CN": "发送给 API 的 id (留空则使用 key)" },
  "provider.modelNameTitle": { en: "{id}/{key} — display name", "zh-CN": "{id}/{key} — 显示名" },
  "provider.modelNamePlaceholder": { en: "Shown in pickers (empty keeps the key)", "zh-CN": "在选择器中显示 (留空则使用 key)" },
  "provider.baseURLTitle": { en: "{id} — baseURL", "zh-CN": "{id} — baseURL" },
  "provider.apiKeyTitle": { en: "{id} — apiKey", "zh-CN": "{id} — apiKey" },
  "provider.baseURLPlaceholder": { en: "https://api.example.com/v1 or {env:VAR} ({hint}; empty keeps)", "zh-CN": "https://api.example.com/v1 或 {env:VAR} ({hint}；留空保留)" },
  "provider.apiKeyPlaceholder": { en: "sk-... or {env:VAR} ({hint}; empty keeps)", "zh-CN": "sk-... 或 {env:VAR} ({hint}；留空保留)" },
  "provider.wizardTitle": { en: "Provider setup wizard", "zh-CN": "服务商配置向导" },
  "provider.cancelledAdded": { en: "Cancelled — '{id}' was activated but no credentials changed.", "zh-CN": "已取消 — '{id}' 已激活但凭证未更改。" },
  "provider.cancelled": { en: "Cancelled — no credentials changed.", "zh-CN": "已取消 — 凭证未更改。" },
  "provider.writeFailed": { en: "Failed to write config: {err}", "zh-CN": "写入配置失败: {err}" },
  "provider.configSaved": { en: "Config saved — baseURL & apiKey set for '{id}'. Restart to take effect.", "zh-CN": "配置已保存 — '{id}' 的 baseURL 和 apiKey 已设置。重启后生效。" },
  "provider.configSavedAdded": { en: "'{id}' activated + credentials saved — restart to take effect.", "zh-CN": "'{id}' 已激活 + 凭证已保存 — 重启后生效。" },
  "provider.modelAdded": { en: "Model '{key}' added to '{id}'.", "zh-CN": "模型 '{key}' 已添加到 '{id}'。" },
  "provider.modelRemoved": { en: "Model '{key}' removed from '{id}'.", "zh-CN": "模型 '{key}' 已从 '{id}' 删除。" },
  "provider.addModelFailed": { en: "Failed to add model: {err}", "zh-CN": "添加模型失败: {err}" },
  "provider.removeModelFailed": { en: "Failed to remove model: {err}", "zh-CN": "删除模型失败: {err}" },
  "provider.activeInConfig": { en: "active in opencode.jsonc", "zh-CN": "在 opencode.jsonc 中已激活" },
  "provider.availableFromDef": { en: "available ({source}) — will be activated", "zh-CN": "可用 ({source}) — 将被激活" },
  "provider.noDefinition": { en: "No definition for '{id}'.", "zh-CN": "找不到 '{id}' 的定义。" },
  "provider.noActiveModels": { en: "No active provider has a models section.", "zh-CN": "没有已激活的服务商包含 models 配置。" },
  "provider.noModelsSection": { en: "Provider '{id}' has no models section.", "zh-CN": "服务商 '{id}' 没有 models 配置。" },
  "provider.invalidKey": { en: "Invalid key — no spaces; '/' allowed inside, not at edges or doubled.", "zh-CN": "无效 key — 不能含空格；'/' 可在中间使用，但不能在首尾或连续出现。" },
  "provider.modelExists": { en: "Model '{key}' already exists on '{id}'.", "zh-CN": "模型 '{key}' 已存在于 '{id}'。" },
  "provider.removeModelConfirm": { en: "Remove model '{key}' from '{id}'? Profiles referencing '{id}/{key}' will break.", "zh-CN": "从 '{id}' 删除模型 '{key}'？引用 '{id}/{key}' 的预设将会失效。" },
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
  "project.syncMissing": { en: "⚠️ Config file (.opencode/opencode.jsonc) does not exist.\nPlease run Init first.", "zh-CN": "⚠️ 配置文件 (.opencode/opencode.jsonc) 不存在。\n请先运行初始化。" },
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

// ─── Language switch menu item (used by each wizard's main menu) ─────

export const SWITCH_LANG = "__switch_lang__"

/**
 * Returns a menu option for language switching, to be inserted into
 * any wizard's main DialogSelect options array.
 *
 * Usage:
 *   import { languageOption, SWITCH_LANG } from "./i18n"
 *   // in options array:
 *   languageOption(api)
 *   // in onSelect:
 *   if (option.value === SWITCH_LANG) {
 *     toggleLocale(api)
 *     // re-open this menu
 *   }
 */
export function languageOption(api: TuiPluginApi): DialogOption<string> {
  const other = currentLocale === "en" ? "zh-CN" : "en"
  return {
    title: `🌐 ${localeName(currentLocale)} → ${localeName(other)}`,
    value: SWITCH_LANG,
    description: tr("common.langDesc"),
  }
}

// ─── withBookends: smart option list builder ─────────────────────────
//
// When the dynamic items list exceeds `threshold` (default 10),
// the fixed action items (Back, Apply, etc.) are duplicated at BOTH
// the top and bottom of the list — so the user never has to scroll
// more than half the list to reach them.
//
// When ≤ threshold, fixed items appear only at the bottom (the
// conventional position).

/**
 * Build a DialogSelect options array with smart bookend placement.
 *
 * @param items    Dynamic list items (agents, profiles, models, etc.)
 * @param fixed    Fixed action items (Back, Apply, Cancel…) — placed at end, and also at start when list is long
 * @param threshold Item count above which fixed items are duplicated at the top (default 10)
 * @returns Final options array
 */
export function withBookends<V extends string>(
  items: DialogOption<V>[],
  fixed: DialogOption<V>[],
  threshold = 10,
): DialogOption<V>[] {
  if (items.length > threshold) {
    return [...fixed, ...items, ...fixed]
  }
  return [...items, ...fixed]
}
