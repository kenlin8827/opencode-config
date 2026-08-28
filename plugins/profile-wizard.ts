/// <reference types="bun" />
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui"

/**
 * Profile Wizard — TUI dialog-based profile switching.
 *
 * Dialog replacement of the former server-side profile-switcher plugin.
 * Registered via `tui.json` → `plugin` array (TUI plugins have no
 * directory auto-discovery — they must be listed there).
 *
 * Entry points:
 *   /profile                — slash command (opens the picker)
 *   command palette (ctrl+p) — "Switch model profile"
 *
 * Main menu has three entry points:
 *
 *   1. Edit: Agent→Tier   — reassign which tier an agent belongs to
 *      (writes tiers.json; agent list → tier picker → Apply/Cancel)
 *
 *   2. Manage: Profile→Models — edit a profile's tier→model mapping
 *      (profile list → tier list with model refs → pick provider →
 *      pick model → Apply/Cancel; plus Add/Delete profile)
 *
 *   3. Select: Profile     — pick a profile and apply immediately
 *      (profile list → apply)
 *
 * Every dialog level intercepts Esc (via dialog.replace onClose
 * callback + navigated flag) to go back one level instead of
 * closing the entire dialog stack.
 *
 * Profiles are JSON files in ~/.config/opencode/profiles/ with shape:
 *   { "description": ..., "tiers": { "<tier>": "<provider>/<model_id>" } }
 *
 * Note: this is a TUI-only module — a single module cannot export both
 * `server` and `tui`. It only runs inside the TUI; headless sessions
 * have no /profile equivalent.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { tr, initI18n, languageOption, toggleLocale, localeName, SWITCH_LANG, withBookends } from "./i18n"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "opencode.jsonc")
const TIERS_FILE = join(CONFIG_DIR, "tiers.json")
const STATE_FILE = join(CONFIG_DIR, ".active-profile")
const PROFILES_DIR = join(CONFIG_DIR, "profiles")
const PLUGIN_ID = "opencode-prime.profile"
const APPLY = "__apply__"
const CANCEL = "__cancel__"
const TYPE_CUSTOM = "__type_custom__"
const TIER_PREFIX = "tier:"
const BACK = "__back__"
const ADD_PROFILE = "__add_profile__"
const DELETE_PROFILE = "__delete_profile__"
const EDIT_TIERS = "__edit_tiers__"
const MANAGE_MODELS = "__manage_models__"
const SELECT_PROFILE = "__select_profile__"

const VALID_TIERS = ["flash", "standard", "pro", "max", "vision"] as const

// ─── Types ───────────────────────────────────────────────────────────

interface Profile {
  description?: string
  tiers: Record<string, string> // tier name → "provider/model_id"
}

interface Agent {
  tier?: string
  model?: string
  [key: string]: unknown
}

interface ModelDef {
  name?: string
  id?: string
  [key: string]: unknown
}

// Catalog entry served to the pickers — built from the SDK provider
// list when reachable, otherwise from opencode.jsonc definitions.
interface CatalogModel {
  name?: string
  status?: string
}

interface CatalogProvider {
  id?: string
  name?: string
  source?: string
  connected?: boolean
  models: Record<string, CatalogModel>
}

type Catalog = Record<string, CatalogProvider>

interface ProviderDef {
  name?: string
  models?: Record<string, ModelDef>
  [key: string]: unknown
}

interface OpenCodeConfig {
  model?: string
  agent?: Record<string, Agent>
  provider?: Record<string, ProviderDef>
  [key: string]: unknown
}

// ─── JSONC stripping (same implementation as provider-wizard.ts) ────

function stripJsonc(raw: string): string {
  let result = ""
  let i = 0
  const len = raw.length
  let state: "normal" | "string" | "lineComment" | "blockComment" = "normal"

  while (i < len) {
    const c = raw[i]
    const next = i + 1 < len ? raw[i + 1] : ""

    switch (state) {
      case "normal":
        if (c === '"') {
          result += c
          state = "string"
        } else if (c === "/" && next === "/") {
          state = "lineComment"
          i++
        } else if (c === "/" && next === "*") {
          state = "blockComment"
          i++
        } else {
          result += c
        }
        break
      case "string":
        result += c
        if (c === "\\") {
          i++
          if (i < len) result += raw[i]
        } else if (c === '"') {
          state = "normal"
        }
        break
      case "lineComment":
        if (c === "\n") {
          result += c
          state = "normal"
        }
        break
      case "blockComment":
        if (c === "*" && next === "/") {
          state = "normal"
          i++
        }
        break
    }
    i++
  }

  return result.replace(/,(\s*[}\]])/g, "$1")
}

function readConfig(path: string): OpenCodeConfig {
  if (!existsSync(path)) throw new Error(`config not found: ${path}`)
  return JSON.parse(stripJsonc(readFileSync(path, "utf-8"))) as OpenCodeConfig
}

function writeConfigAtomic(path: string, data: OpenCodeConfig): void {
  if (existsSync(path)) {
    writeFileSync(path + ".bak", readFileSync(path))
  }
  writeFileSync(path + ".tmp", JSON.stringify(data, null, 2), "utf-8")
  renameSync(path + ".tmp", path)
}

// ─── Profile loading + state ─────────────────────────────────────────

function loadProfiles(): Map<string, Profile> {
  const profiles = new Map<string, Profile>()
  if (!existsSync(PROFILES_DIR)) return profiles
  let files: string[]
  try {
    files = readdirSync(PROFILES_DIR)
  } catch {
    return profiles
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    try {
      const data = JSON.parse(
        readFileSync(join(PROFILES_DIR, file), "utf-8"),
      ) as Profile
      if (data.tiers && typeof data.tiers === "object") {
        profiles.set(file.replace(/\.json$/, ""), data)
      }
    } catch {
      // skip invalid profiles silently
    }
  }
  return profiles
}

function getActiveProfile(): string | null {
  if (!existsSync(STATE_FILE)) return null
  const name = readFileSync(STATE_FILE, "utf-8").trim()
  return name || null
}

function setActiveProfile(name: string): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(STATE_FILE, name, "utf-8")
}

function profilePath(name: string): string {
  return join(PROFILES_DIR, `${name}.json`)
}

function writeProfileAtomic(name: string, profile: Profile): void {
  if (!existsSync(PROFILES_DIR)) mkdirSync(PROFILES_DIR, { recursive: true })
  const path = profilePath(name)
  if (existsSync(path)) writeFileSync(path + ".bak", readFileSync(path))
  writeFileSync(path + ".tmp", JSON.stringify(profile, null, 2) + "\n", "utf-8")
  renameSync(path + ".tmp", path)
}

function deleteProfile(name: string): void {
  const path = profilePath(name)
  if (existsSync(path)) {
    writeFileSync(path + ".bak", readFileSync(path))
    unlinkSync(path)
  }
}

// Agent → tier mapping lives in tiers.json, NOT in the agent block of
// opencode.jsonc: opencode forwards every unknown agent field to the
// provider as a model option, and strict upstream gateways reject it
// ("Extra inputs are not permitted, field: 'tier'").
function loadTierMap(): Record<string, string> {
  if (!existsSync(TIERS_FILE)) return {}
  try {
    const data = JSON.parse(readFileSync(TIERS_FILE, "utf-8")) as Record<string, unknown>
    const map: Record<string, string> = {}
    for (const [agent, tier] of Object.entries(data)) {
      if (agent.startsWith("$")) continue
      if (typeof tier === "string") map[agent] = tier
    }
    return map
  } catch {
    return {}
  }
}

// ─── Profile application (same semantics as the former plugin) ──────
// Validates tier ref format, then rewrites every agent whose tier
// matches. Mixed providers are allowed. Root `model` tracks tier.standard.
// Also emits a merge patch (agent names → model) so the live path can
// go through the server's global config API instead of a raw rewrite.

interface ApplyResult {
  updated: number
  details: string[]
  patch: OpenCodeConfig
}

function applyProfile(
  config: OpenCodeConfig,
  profile: Profile,
  tierMap: Record<string, string>,
): ApplyResult {
  const details: string[] = []
  let updated = 0
  const patch: OpenCodeConfig = { agent: {} }

  if (!config.agent) {
    throw new Error("opencode.jsonc has no agent section")
  }
  if (Object.keys(tierMap).length === 0) {
    throw new Error(`tiers.json missing or empty: ${TIERS_FILE}`)
  }

  for (const [tier, ref] of Object.entries(profile.tiers)) {
    if (!ref.includes("/") || ref.startsWith("/") || ref.endsWith("/")) {
      throw new Error(
        `tier ${tier}: value '${ref}' must be '<provider>/<model_id>'`,
      )
    }
  }

  for (const [tier, ref] of Object.entries(profile.tiers)) {
    let count = 0
    for (const [name, agent] of Object.entries(config.agent)) {
      // tiers.json is authoritative; a legacy agent.tier field (pre-migration
      // configs) only fills in for agents the map doesn't list.
      const agentTier = tierMap[name] ?? agent.tier
      if (agentTier === tier) {
        agent.model = ref
        patch.agent![name] = { model: ref }
        count++
      }
    }
    if (count === 0) {
      throw new Error(`no agent currently uses tier ${tier}`)
    }
    if (tier === "standard" || (tier === "default" && !("standard" in profile.tiers))) {
      config.model = ref
      patch.model = ref
    }
    details.push(`tier.${tier} → ${ref} (${count} agent${count > 1 ? "s" : ""})`)
    updated += count
  }

  return { updated, details, patch }
}

// Live apply via the server's global config API (PATCH /global/config):
// the server patches opencode.jsonc (comments preserved), invalidates
// its config cache and rebuilds instances — no restart needed. Returns
// false when the endpoint is missing (older opencode builds) or fails,
// so the caller can fall back to a raw file rewrite.
async function applyLive(
  api: TuiPluginApi,
  patch: OpenCodeConfig,
): Promise<boolean> {
  try {
    const res = await api.client.global.config.update({ config: patch })
    return res.error === undefined
  } catch {
    return false
  }
}

// Reads the first agent's model per tier (all agents of a tier share one
// ref — rewritten in lockstep on apply).
function getCurrentTierMapping(
  config: OpenCodeConfig,
  tierMap: Record<string, string>,
): Record<string, string> {
  const map: Record<string, string> = {}
  if (!config.agent) return map
  for (const [name, agent] of Object.entries(config.agent)) {
    const tier = tierMap[name] ?? agent.tier
    if (tier && agent.model && !(tier in map)) {
      map[tier] = agent.model
    }
  }
  return map
}

// ─── tiers.json write (atomic: backup .bak + tmp + rename) ──────────

function writeTiersFileAtomic(map: Record<string, string>): void {
  let comment: string | undefined
  if (existsSync(TIERS_FILE)) {
    try {
      const data = JSON.parse(readFileSync(TIERS_FILE, "utf-8")) as Record<string, unknown>
      if (typeof data.$comment === "string") comment = data.$comment
    } catch {
      // ignore
    }
    writeFileSync(TIERS_FILE + ".bak", readFileSync(TIERS_FILE))
  }
  const result: Record<string, string> = {}
  if (comment) result["$comment"] = comment
  for (const [k, v] of Object.entries(map)) result[k] = v
  writeFileSync(TIERS_FILE + ".tmp", JSON.stringify(result, null, 2) + "\n", "utf-8")
  renameSync(TIERS_FILE + ".tmp", TIERS_FILE)
}

// ─── Toast helper ────────────────────────────────────────────────────

function toast(
  api: TuiPluginApi,
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
) {
  api.ui.toast({ title: tr("profile.cmdTitle"), message, variant })
}

function tierDescription(tier: string): string {
  switch (tier) {
    case "flash":     return tr("profile.tierFlash")
    case "standard":  return tr("profile.tierStandard")
    case "pro":       return tr("profile.tierPro")
    case "max":       return tr("profile.tierMax")
    case "vision":    return tr("profile.tierVision")
    default:          return ""
  }
}

// ════════════════════════════════════════════════════════════════════
// ┌─ Level 1: Main menu — three entry points ─────────────────────────
// ════════════════════════════════════════════════════════════════════

function startWizard(api: TuiPluginApi): void {
  const profiles = loadProfiles()
  const active = getActiveProfile()
  const sorted = Array.from(profiles.keys()).sort()

  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: tr("profile.mainTitle"),
      placeholder: tr("profile.mainPlaceholder"),
      options: [
        {
          title: tr("profile.editAgentTier"),
          value: EDIT_TIERS,
          description: tr("profile.editAgentTierDesc"),
        },
        {
          title: tr("profile.manageModels"),
          value: MANAGE_MODELS,
          description: tr("profile.manageModelsDesc"),
        },
        {
          title: active ? tr("profile.selectProfileActive", { active }) : tr("profile.selectProfile"),
          value: SELECT_PROFILE,
          description: tr("profile.selectProfileDesc"),
        },
        languageOption(api),
      ],
      onSelect: (option) => {
        if (option.value === SWITCH_LANG) {
          const next = toggleLocale(api)
          toast(api, tr("common.langSwitched", { lang: localeName(next) }), "info")
          startWizard(api)
          return
        }
        if (option.value === EDIT_TIERS) {
          editAgentTier(api, loadTierMap(), {})
          return
        }
        if (option.value === MANAGE_MODELS) {
          manageProfileModels(api)
          return
        }
        if (option.value === SELECT_PROFILE) {
          selectProfile(api)
          return
        }
      },
    }),
  )
}

// ════════════════════════════════════════════════════════════════════
// ┌─ Branch 1: Edit: Agent→Tier ───────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

// Level 2: Agent list
function editAgentTier(
  api: TuiPluginApi,
  tierMap: Record<string, string>,
  changed: Record<string, string>,
): void {
  let config: OpenCodeConfig
  try {
    config = readConfig(CONFIG_FILE)
  } catch (err) {
    toast(api, tr("profile.readConfigFailed", { err: (err as Error).message }), "error")
    startWizard(api)
    return
  }

  const agents = config.agent
  if (!agents || Object.keys(agents).length === 0) {
    toast(api, tr("profile.noAgents"), "warning")
    startWizard(api)
    return
  }

  const sorted = Object.keys(agents).sort()
  const hasChanges = Object.keys(changed).length > 0

  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<string>({
        title: hasChanges
          ? tr("profile.editTierTitlePending", { count: Object.keys(changed).length })
          : tr("profile.editTierTitle"),
        placeholder: tr("profile.editTierPlaceholder"),
        options: withBookends(
          sorted.map((name) => {
            const tier = changed[name] ?? tierMap[name] ?? agents[name].tier ?? "standard"
            const isChanged = changed[name] !== undefined
            const oldTier = tierMap[name] ?? agents[name].tier
            return {
              title: isChanged ? `${name}  (${oldTier} → ${tier})` : `${name}  (${tier})`,
              value: name,
              description: tr("profile.tierModelDesc", { tier, model: agents[name].model ?? tr("common.unset") }),
            }
          }),
          [
            ...(hasChanges
              ? [{
                  title: tr("common.applyChanges"),
                  value: APPLY,
                  description: tr("profile.applyChangesDesc", { count: Object.keys(changed).length, s: Object.keys(changed).length > 1 ? "s" : "" }),
                }]
              : []),
            {
              title: tr("common.back"),
              value: BACK,
              description: tr("profile.backToMain"),
            },
          ],
        ),
        onSelect: (option) => {
          navigated = true
          if (option.value === APPLY) {
            void applyAgentTierChanges(api, tierMap, changed)
            return
          }
          if (option.value === BACK) {
            startWizard(api)
            return
          }
          const currentTier = changed[option.value] ?? tierMap[option.value] ?? agents[option.value].tier ?? "standard"
          pickAgentTier(api, option.value, currentTier, tierMap, changed)
        },
      }),
    () => {
      if (!navigated) setTimeout(() => startWizard(api), 0)
    },
  )
}

// Level 3: Tier picker (per agent)
function pickAgentTier(
  api: TuiPluginApi,
  agentName: string,
  currentTier: string,
  tierMap: Record<string, string>,
  changed: Record<string, string>,
): void {
  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<string>({
        title: tr("profile.pickTierTitle", { agent: agentName, tier: currentTier }),
        placeholder: tr("profile.pickTierPlaceholder"),
        options: [
          ...VALID_TIERS.map((t) => ({
            title: t === currentTier ? `${t}  ${tr("common.currentMarker")}` : t,
            value: t,
            description: tierDescription(t),
          })),
          {
            title: tr("common.back"),
            value: BACK,
            description: tr("profile.backToAgentList"),
          },
        ],
        onSelect: (option) => {
          navigated = true
          if (option.value === BACK) {
            editAgentTier(api, tierMap, changed)
            return
          }
          const newTier = option.value
          if (newTier !== currentTier) {
            changed[agentName] = newTier
            toast(api, tr("profile.tierChanged", { agent: agentName, old: currentTier, new: newTier }), "info")
          }
          editAgentTier(api, tierMap, changed)
        },
      }),
    () => {
      if (!navigated) setTimeout(() => editAgentTier(api, tierMap, changed), 0)
    },
  )
}

async function applyAgentTierChanges(
  api: TuiPluginApi,
  originalMap: Record<string, string>,
  changed: Record<string, string>,
): Promise<void> {
  const changeCount = Object.keys(changed).length
  if (changeCount === 0) {
    startWizard(api)
    return
  }

  // 1. Build new tier map and write tiers.json
  const newMap: Record<string, string> = { ...originalMap }
  for (const [agent, tier] of Object.entries(changed)) newMap[agent] = tier

  try {
    writeTiersFileAtomic(newMap)
  } catch (err) {
    api.ui.dialog.clear()
    toast(api, tr("profile.writeTiersFailed", { err: (err as Error).message }), "error")
    return
  }

  // 2. Live-apply: rewrite changed agents' models to the new tier's ref
  let config: OpenCodeConfig
  try {
    config = readConfig(CONFIG_FILE)
  } catch (err) {
    api.ui.dialog.clear()
    toast(api, tr("profile.tiersUpdatedConfigFailed", { err: (err as Error).message }), "warning")
    return
  }

  const activeName = getActiveProfile()
  const profiles = loadProfiles()
  const activeProfile = activeName ? profiles.get(activeName) ?? null : null
  const tierModels = getCurrentTierMapping(config, newMap)

  const patch: OpenCodeConfig = { agent: {} }
  const details: string[] = []
  let appliedCount = 0

  for (const [agentName, newTier] of Object.entries(changed)) {
    if (!config.agent?.[agentName]) continue
    const ref = activeProfile?.tiers?.[newTier] ?? tierModels[newTier] ?? null
    if (ref) {
      config.agent[agentName].model = ref
      patch.agent![agentName] = { model: ref }
      details.push(`${agentName} → ${newTier} (${ref})`)
      appliedCount++
    } else {
      details.push(tr("profile.noModelRef", { agent: agentName, tier: newTier }))
    }
  }

  // 3. Try live apply, fall back to direct write
  let live = false
  if (appliedCount > 0) {
    live = await applyLive(api, patch)
    if (!live) {
      try {
        writeConfigAtomic(CONFIG_FILE, config)
      } catch (err) {
        api.ui.dialog.clear()
        toast(api, tr("profile.writeOpencodeFailed", { err: (err as Error).message }), "error")
        return
      }
    }
  }

  api.ui.dialog.clear()
  toast(api, tr("profile.tierChangesApplied", { count: changeCount, s: changeCount > 1 ? "s" : "", details: details.join("; "), live: live ? tr("profile.liveNoRestart") : tr("profile.restartToApply") }), "success")
}

// ════════════════════════════════════════════════════════════════════
// ┌─ Branch 2: Manage: Profile→Models ─────────────────────────────────
// ════════════════════════════════════════════════════════════════════

// Level 2: Profile list (for managing models)
function manageProfileModels(api: TuiPluginApi): void {
  const profiles = loadProfiles()
  const active = getActiveProfile()
  const sorted = Array.from(profiles.keys()).sort()

  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<string>({
        title: tr("profile.manageTitle"),
        placeholder: tr("profile.managePlaceholder"),
        options: withBookends(
          sorted.map((name) => ({
            title: name === active ? `${name}  ← active` : name,
            value: name,
            description: profiles.get(name)!.description?.slice(0, 100),
          })),
          [
            {
              title: tr("profile.addProfile"),
              value: ADD_PROFILE,
              description: tr("profile.addProfileDesc"),
            },
            ...(sorted.length > 0
              ? [{
                  title: tr("profile.deleteProfile"),
                  value: DELETE_PROFILE,
                  description: tr("profile.deleteProfileDesc"),
                }]
              : []),
            {
              title: tr("common.back"),
              value: BACK,
              description: tr("profile.backToMain"),
            },
          ],
        ),
        onSelect: (option) => {
          navigated = true
          if (option.value === ADD_PROFILE) {
            promptAddProfile(api)
            return
          }
          if (option.value === DELETE_PROFILE) {
            promptDeleteProfile(api)
            return
          }
          if (option.value === BACK) {
            startWizard(api)
            return
          }
          const profile = profiles.get(option.value)
          if (!profile) {
            toast(api, tr("profile.profileVanished", { name: option.value }), "error")
            manageProfileModels(api)
            return
          }
          reviewProfileTiers(api, option.value, profile, {})
        },
      }),
    () => {
      if (!navigated) setTimeout(() => startWizard(api), 0)
    },
  )
}

// Level 3: Tier review (per profile — edit tier→model, then Apply/Cancel)
function reviewProfileTiers(
  api: TuiPluginApi,
  name: string,
  profile: Profile,
  overrides: Record<string, string>,
): void {
  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<string>({
        title: tr("profile.reviewTiersTitle", { name }),
        placeholder: tr("profile.reviewTiersPlaceholder"),
        options: withBookends(
          Object.entries(profile.tiers).map(([tier, ref]) => ({
            title: tier,
            value: `${TIER_PREFIX}${tier}`,
            description:
              overrides[tier] !== undefined
                ? tr("profile.customized", { override: overrides[tier], ref })
                : ref,
          })),
          [
            {
              title: tr("common.applyChanges"),
              value: APPLY,
              description: tr("profile.applyChangesModelDesc"),
            },
            {
              title: tr("common.back"),
              value: BACK,
              description: tr("profile.backToProfileList"),
            },
            {
              title: tr("common.cancel"),
              value: CANCEL,
              description: tr("profile.cancelDiscard"),
            },
          ],
        ),
        onSelect: (option) => {
          navigated = true
          if (option.value === APPLY) {
            void applyProfileModelChanges(api, name, profile, overrides)
            return
          }
          if (option.value === BACK) {
            manageProfileModels(api)
            return
          }
          if (option.value === CANCEL) {
            manageProfileModels(api)
            return
          }
          const tier = option.value.slice(TIER_PREFIX.length)
          if (tier in profile.tiers) {
            void pickProvider(api, name, profile, overrides, tier)
          }
        },
      }),
    () => {
      if (!navigated) setTimeout(() => manageProfileModels(api), 0)
    },
  )
}

// Level 4: Provider picker
async function pickProvider(
  api: TuiPluginApi,
  name: string,
  profile: Profile,
  overrides: Record<string, string>,
  tier: string,
): Promise<void> {
  const catalog = await loadCatalog(api)
  const ids = Object.keys(catalog).sort()
  if (ids.length === 0) {
    promptTierRef(api, name, profile, overrides, tier)
    return
  }

  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<string>({
        title: tr("profile.pickProviderTitle", { name, tier }),
        placeholder: tr("profile.pickProviderPlaceholder"),
        options: withBookends(
          ids.map((id) => {
            const p = catalog[id]
            const tags = [
              tr("common.modelCount", { count: Object.keys(p.models).length }),
              p.source === "config" ? tr("common.config") : tr("common.builtin"),
            ]
            if (p.connected) tags.push(tr("common.connected"))
            return {
              title: id,
              value: id,
              description: tags.join(" · "),
            }
          }),
          [
            {
              title: tr("profile.typeCustomRef"),
              value: TYPE_CUSTOM,
              description: tr("profile.typeCustomRefDesc"),
            },
            {
              title: tr("common.back"),
              value: BACK,
              description: tr("profile.backToTierReview"),
            },
          ],
        ),
        onSelect: (option) => {
          navigated = true
          if (option.value === TYPE_CUSTOM) {
            promptTierRef(api, name, profile, overrides, tier)
            return
          }
          if (option.value === BACK) {
            reviewProfileTiers(api, name, profile, overrides)
            return
          }
          const provider = catalog[option.value]
          if (provider) {
            pickModel(api, name, profile, overrides, tier, option.value, provider.models)
          }
        },
      }),
    () => {
      if (!navigated) setTimeout(() => reviewProfileTiers(api, name, profile, overrides), 0)
    },
  )
}

// Level 5: Model picker
function pickModel(
  api: TuiPluginApi,
  name: string,
  profile: Profile,
  overrides: Record<string, string>,
  tier: string,
  providerId: string,
  models: Record<string, CatalogModel>,
): void {
  const entries = Object.entries(models)
  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<string>({
        title: tr("profile.pickModelTitle", { name, tier, provider: providerId }),
        placeholder: tr("profile.pickModelPlaceholder", { count: entries.length }),
        options: withBookends(
          entries.map(([key, m]) => ({
            title: key,
            value: key,
            description: m.name && m.name !== key ? m.name : undefined,
          })),
          [
            {
              title: tr("common.back"),
              value: BACK,
              description: tr("profile.backToProviderList"),
            },
          ],
        ),
        onSelect: (option) => {
          navigated = true
          if (option.value === BACK) {
            void pickProvider(api, name, profile, overrides, tier)
            return
          }
          overrides[tier] = `${providerId}/${option.value}`
          toast(api, tr("profile.modelChanged", { name, tier, provider: providerId, model: option.value }), "info")
          reviewProfileTiers(api, name, profile, overrides)
        },
      }),
    () => {
      if (!navigated) setTimeout(() => void pickProvider(api, name, profile, overrides, tier), 0)
    },
  )
}

// Manual entry fallback for providers missing from every catalog source.
function promptTierRef(
  api: TuiPluginApi,
  name: string,
  profile: Profile,
  overrides: Record<string, string>,
  tier: string,
): void {
  const current = overrides[tier] ?? profile.tiers[tier]
  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: tr("profile.promptTierRefTitle", { name, tier }),
      placeholder: tr("profile.promptTierRefPlaceholder"),
      value: current,
      onConfirm: (value) => {
        const v = value.trim()
        if (v && v !== current) {
          if (!v.includes("/") || v.startsWith("/") || v.endsWith("/")) {
            toast(
              api,
              tr("profile.invalidRef", { ref: v }),
              "error",
            )
          } else {
            overrides[tier] = v
            toast(api, tr("profile.modelChanged", { name, tier, provider: v.split("/")[0] ?? "", model: v.split("/")[1] ?? v }), "info")
          }
        }
        reviewProfileTiers(api, name, profile, overrides)
      },
      onCancel: () => setTimeout(() => reviewProfileTiers(api, name, profile, overrides), 0),
    }),
  )
}

// Apply profile model changes: write profile JSON, then apply to opencode.jsonc
async function applyProfileModelChanges(
  api: TuiPluginApi,
  name: string,
  profile: Profile,
  overrides: Record<string, string>,
): Promise<void> {
  const hasOverrides = Object.keys(overrides).length > 0
  if (!hasOverrides) {
    reviewProfileTiers(api, name, profile, overrides)
    return
  }

  // Build updated profile
  const updatedProfile: Profile = {
    ...profile,
    tiers: { ...profile.tiers, ...overrides },
  }

  // Write profile JSON atomically
  try {
    writeProfileAtomic(name, updatedProfile)
  } catch (err) {
    api.ui.dialog.clear()
    toast(api, tr("profile.writeProfileFailed", { name, err: (err as Error).message }), "error")
    return
  }

  // Apply the profile to opencode.jsonc (rewrite agent models per tier)
  try {
    const config = readConfig(CONFIG_FILE)
    const { updated, details, patch } = applyProfile(config, updatedProfile, loadTierMap())
    const live = await applyLive(api, patch)
    if (!live) {
      writeConfigAtomic(CONFIG_FILE, config)
    }
    setActiveProfile(name)
    api.ui.dialog.clear()
    toast(
      api,
      tr("profile.profileUpdatedApplied", { name, updated, details: details.join("; "), live: live ? tr("profile.liveNoRestart") : tr("profile.restartToApply2") }),
      "success",
    )
  } catch (err) {
    api.ui.dialog.clear()
    toast(api, tr("profile.profileSavedApplyFailed", { err: (err as Error).message }), "warning")
  }
}

// ─── Add / Delete profile ────────────────────────────────────────────

function promptAddProfile(api: TuiPluginApi): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: tr("profile.addProfileTitle"),
      placeholder: tr("profile.addProfilePlaceholder"),
      onConfirm: (value) => {
        const name = value.trim()
        if (!name) {
          manageProfileModels(api)
          return
        }
        if (existsSync(profilePath(name))) {
          toast(api, tr("profile.profileExists", { name }), "error")
          promptAddProfile(api)
          return
        }
        const blankProfile: Profile = {
          description: tr("profile.customProfile"),
          tiers: {
            flash: "",
            standard: "",
            pro: "",
            max: "",
            vision: "",
          },
        }
        try {
          writeProfileAtomic(name, blankProfile)
          toast(api, tr("profile.profileCreated", { name }), "success")
          reviewProfileTiers(api, name, blankProfile, {})
        } catch (err) {
          toast(api, tr("profile.createProfileFailed", { err: (err as Error).message }), "error")
          manageProfileModels(api)
        }
      },
      onCancel: () => setTimeout(() => manageProfileModels(api), 0),
    }),
  )
}

function promptDeleteProfile(api: TuiPluginApi): void {
  const profiles = loadProfiles()
  const sorted = Array.from(profiles.keys()).sort()
  if (sorted.length === 0) {
    toast(api, tr("profile.noProfilesToDelete"), "warning")
    manageProfileModels(api)
    return
  }

  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<string>({
        title: tr("profile.deleteProfileTitle"),
        placeholder: tr("profile.deleteProfilePlaceholder"),
        options: withBookends(
          sorted.map((name) => ({
            title: name,
            value: name,
            description: profilePath(name),
          })),
          [
            {
              title: tr("common.back"),
              value: BACK,
              description: tr("profile.backToProfileList2"),
            },
          ],
        ),
        onSelect: (option) => {
          navigated = true
          if (option.value === BACK) {
            manageProfileModels(api)
            return
          }
          confirmDeleteProfile(api, option.value)
        },
      }),
    () => {
      if (!navigated) setTimeout(() => manageProfileModels(api), 0)
    },
  )
}

function confirmDeleteProfile(api: TuiPluginApi, name: string): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogConfirm({
      title: tr("profile.deleteProfileTitle"),
      message: tr("profile.confirmDeleteMsg", { name, path: profilePath(name) }),
      onConfirm: () => {
        try {
          deleteProfile(name)
          toast(api, tr("profile.profileDeleted", { name }), "success")
        } catch (err) {
          toast(api, tr("profile.deleteFailed", { err: (err as Error).message }), "error")
        }
        manageProfileModels(api)
      },
      onCancel: () => setTimeout(() => promptDeleteProfile(api), 0),
    }),
  )
}

// ════════════════════════════════════════════════════════════════════
// ┌─ Branch 3: Select: Profile — pick and apply immediately ────────────
// ════════════════════════════════════════════════════════════════════

function selectProfile(api: TuiPluginApi): void {
  const profiles = loadProfiles()
  if (profiles.size === 0) {
    toast(api, tr("profile.noProfiles", { dir: PROFILES_DIR }), "warning")
    startWizard(api)
    return
  }

  const active = getActiveProfile()
  const sorted = Array.from(profiles.keys()).sort()

  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogSelect<string>({
        title: tr("profile.selectTitle"),
        placeholder: tr("profile.selectPlaceholder"),
        options: withBookends(
          sorted.map((name) => ({
            title: name === active ? `${name}  ← active` : name,
            value: name,
            description: profiles.get(name)!.description?.slice(0, 100),
          })),
          [
            {
              title: tr("common.back"),
              value: BACK,
              description: tr("profile.backToMain"),
            },
          ],
        ),
        onSelect: (option) => {
          navigated = true
          if (option.value === BACK) {
            startWizard(api)
            return
          }
          const profile = profiles.get(option.value)
          if (!profile) {
            toast(api, tr("profile.profileVanished", { name: option.value }), "error")
            selectProfile(api)
            return
          }
          void applySelection(api, option.value, profile)
        },
      }),
    () => {
      if (!navigated) setTimeout(() => startWizard(api), 0)
    },
  )
}

async function applySelection(
  api: TuiPluginApi,
  name: string,
  profile: Profile,
): Promise<void> {
  try {
    const config = readConfig(CONFIG_FILE)
    const { updated, details, patch } = applyProfile(config, profile, loadTierMap())
    const live = await applyLive(api, patch)
    if (!live) {
      writeConfigAtomic(CONFIG_FILE, config)
    }
    setActiveProfile(name)
    api.ui.dialog.clear()
    toast(
      api,
      tr("profile.switchedTo", { name, updated, details: details.join("; "), live: live ? tr("profile.appliedLive") : tr("profile.restartToApply2") }),
      "success",
    )
  } catch (err) {
    api.ui.dialog.clear()
    toast(api, tr("profile.applyFailed", { name, err: (err as Error).message }), "error")
  }
}

// ════════════════════════════════════════════════════════════════════
// ┌─ Catalog (provider/model list for pickers) ─────────────────────────
// ════════════════════════════════════════════════════════════════════

// Reads provider models from opencode.jsonc — reflects custom models
// added via /provider without a restart (the live server catalog still
// holds the pre-edit snapshot).
function configCatalog(): Catalog {
  const catalog: Catalog = {}
  try {
    const config = readConfig(CONFIG_FILE)
    for (const [id, def] of Object.entries(config.provider ?? {})) {
      if (def?.models && Object.keys(def.models).length > 0) {
        catalog[id] = { name: def.name, source: "config", models: def.models }
      }
    }
  } catch {
    // empty catalog — the custom-ref fallback still works
  }
  return catalog
}

async function loadCatalog(api: TuiPluginApi): Promise<Catalog> {
  // Preferred: the opencode server catalog (built-in + configured providers).
  const catalog: Catalog = {}
  try {
    const res = await api.client.provider.list()
    const all = (res as { data?: { all?: CatalogProvider[] } }).data?.all
    if (res.error === undefined && Array.isArray(all) && all.length > 0) {
      for (const p of all) {
        if (!p?.id || !p.models || Object.keys(p.models).length === 0) continue
        catalog[p.id] = p
      }
    }
  } catch {
    // fall through to the config-file catalog
  }

  // Merge the opencode.jsonc definitions on top: models added via
  // /provider after launch are missing from the server catalog until
  // restart, so they must not be shadowed by it.
  for (const [id, cfgProvider] of Object.entries(configCatalog())) {
    const existing = catalog[id]
    if (!existing) {
      catalog[id] = cfgProvider
      continue
    }
    catalog[id] = {
      ...existing,
      models: { ...existing.models, ...cfgProvider.models },
    }
  }
  return catalog
}

// ════════════════════════════════════════════════════════════════════
// ┌─ Plugin entry ──────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

const tui: TuiPlugin = async (api) => {
  initI18n(api)
  api.keymap.registerLayer({
    commands: [
      {
        name: "profile.switch",
        title: tr("profile.cmdTitle"),
        desc: tr("profile.cmdDesc"),
        category: "Profile",
        namespace: "palette",
        slashName: "profile",
        run() {
          startWizard(api)
        },
      },
    ],
  })

  // Announce the active profile when a top-level session opens
  api.event.on("session.created", (event) => {
    const props = (event as { properties?: { info?: { parentID?: string } } })
      .properties
    if (props?.info?.parentID) return
    const active = getActiveProfile()
    if (!active) return
    toast(api, tr("profile.activeProfileToast", { name: active }))
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
}

export default plugin