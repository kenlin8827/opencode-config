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
 * Flow (each step is a host dialog):
 *   1. DialogSelect — pick a profile (active one is marked) or
 *                     "( Show current tier mapping )"
 *   2. tier review  — DialogSelect listing the picked profile's tiers;
 *                     pick a tier, then pick a provider and a model —
 *                     providers/models come from the opencode server
 *                     (built-ins + configured) merged with the
 *                     opencode.jsonc definitions (so custom models
 *                     added via /provider are pickable immediately);
 *                     manual '<provider>/<model_id>' entry as last
 *                     resort, or apply / cancel
 *   3. apply        — rewrite agent models per tier (with any
 *                     per-tier overrides), update .active-profile,
 *                     toast the result. Live apply is attempted first
 *                     via the server's global config API (invalidate +
 *                     instance rebuild, no restart needed); if the
 *                     endpoint is unavailable (older opencode builds)
 *                     the change is written to opencode.jsonc directly
 *                     and only takes effect on the next launch
 *   1b. current mapping — DialogAlert with active profile, root model
 *                     and per-tier refs
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
} from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "opencode.jsonc")
const STATE_FILE = join(CONFIG_DIR, ".active-profile")
const PROFILES_DIR = join(CONFIG_DIR, "profiles")
const PLUGIN_ID = "opencode-config.profile"
const SHOW_CURRENT = "__show_current__"
const APPLY = "__apply__"
const CANCEL = "__cancel__"
const TYPE_CUSTOM = "__type_custom__"
const TIER_PREFIX = "tier:"

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

// ─── Profile application (same semantics as the former plugin) ──────
// Validates tier ref format, then rewrites every agent whose tier
// matches. Mixed providers are allowed. Root `model` tracks tier.default.
// Also emits a merge patch (agent names → model) so the live path can
// go through the server's global config API instead of a raw rewrite.

interface ApplyResult {
  updated: number
  details: string[]
  patch: OpenCodeConfig
}

function applyProfile(config: OpenCodeConfig, profile: Profile): ApplyResult {
  const details: string[] = []
  let updated = 0
  const patch: OpenCodeConfig = { agent: {} }

  if (!config.agent) {
    throw new Error("opencode.jsonc has no agent section")
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
      if (agent.tier === tier) {
        agent.model = ref
        patch.agent![name] = { model: ref }
        count++
      }
    }
    if (count === 0) {
      throw new Error(`no agent currently uses tier ${tier}`)
    }
    if (tier === "default") {
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
function getCurrentTierMapping(config: OpenCodeConfig): Record<string, string> {
  const map: Record<string, string> = {}
  if (!config.agent) return map
  for (const agent of Object.values(config.agent)) {
    if (agent.tier && agent.model && !(agent.tier in map)) {
      map[agent.tier] = agent.model
    }
  }
  return map
}

// ─── Toast helper ────────────────────────────────────────────────────

function toast(
  api: TuiPluginApi,
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
) {
  api.ui.toast({ title: "Profile", message, variant })
}

// ─── Wizard steps ────────────────────────────────────────────────────

function showCurrentMapping(api: TuiPluginApi): void {
  const active = getActiveProfile()
  const lines: string[] = [
    active
      ? `Active profile: ${active}`
      : "No profile explicitly set (using current config)",
  ]
  try {
    const config = readConfig(CONFIG_FILE)
    lines.push(`model → ${config.model ?? "(unset)"}  (tracks tier.default)`)
    const tiers = getCurrentTierMapping(config)
    for (const [tier, ref] of Object.entries(tiers).sort()) {
      lines.push(`tier.${tier} → ${ref}`)
    }
  } catch (err) {
    lines.push(`(cannot read config: ${(err as Error).message})`)
  }

  api.ui.dialog.replace(() =>
    api.ui.DialogAlert({
      title: "Current tier mapping",
      message: lines.join("\n"),
      onConfirm: () => api.ui.dialog.clear(),
    }),
  )
}

async function applySelection(
  api: TuiPluginApi,
  name: string,
  profile: Profile,
): Promise<void> {
  try {
    const config = readConfig(CONFIG_FILE)
    const { updated, details, patch } = applyProfile(config, profile)
    const live = await applyLive(api, patch)
    if (!live) {
      // Server rejected/misses the global config API — raw rewrite,
      // effective only after a restart.
      writeConfigAtomic(CONFIG_FILE, config)
    }
    setActiveProfile(name)
    api.ui.dialog.clear()
    toast(
      api,
      `Switched to '${name}' — ${updated} agent(s) updated (${details.join("; ")}). ` +
        (live ? "Applied live, no restart needed." : "Restart opencode to apply."),
      "success",
    )
  } catch (err) {
    api.ui.dialog.clear()
    toast(api, `Failed to apply '${name}': ${(err as Error).message}`, "error")
  }
}

// ─── Tier review: per-tier model override before applying ───────────────

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
      title: `${name} — tier.${tier}`,
      placeholder: "<provider>/<model_id> (empty keeps current)",
      value: current,
      onConfirm: (value) => {
        const v = value.trim()
        if (v && v !== current) {
          if (!v.includes("/") || v.startsWith("/") || v.endsWith("/")) {
            toast(
              api,
              `Invalid ref '${v}' — expected '<provider>/<model_id>'.`,
              "error",
            )
          } else {
            overrides[tier] = v
          }
        }
        reviewTiers(api, name, profile, overrides)
      },
      onCancel: () => reviewTiers(api, name, profile, overrides),
    }),
  )
}

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
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: `${name} — tier.${tier} → model on ${providerId}`,
      placeholder: `Pick a model — ${entries.length} available (Esc closes)`,
      options: entries.map(([key, m]) => ({
        title: key,
        value: key,
        description: m.name && m.name !== key ? m.name : undefined,
      })),
      onSelect: (option) => {
        overrides[tier] = `${providerId}/${option.value}`
        reviewTiers(api, name, profile, overrides)
      },
    }),
  )
}

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

  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: `${name} — tier.${tier} → provider`,
      placeholder: "Pick a provider (Esc closes)",
      options: [
        ...ids.map((id) => {
          const p = catalog[id]
          const tags = [
            `${Object.keys(p.models).length} model(s)`,
            p.source === "config" ? "config" : "built-in",
          ]
          if (p.connected) tags.push("connected")
          return {
            title: id,
            value: id,
            description: tags.join(" · "),
          }
        }),
        {
          title: "( Type a custom ref )",
          value: TYPE_CUSTOM,
          description: "For providers not listed above",
        },
      ],
      onSelect: (option) => {
        if (option.value === TYPE_CUSTOM) {
          promptTierRef(api, name, profile, overrides, tier)
          return
        }
        const provider = catalog[option.value]
        if (provider) {
          pickModel(api, name, profile, overrides, tier, option.value, provider.models)
        }
      },
    }),
  )
}

function reviewTiers(
  api: TuiPluginApi,
  name: string,
  profile: Profile,
  overrides: Record<string, string>,
): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: `${name} — review tiers`,
      placeholder: "Pick a tier to change its model (provider → model), or apply",
      options: [
        {
          title: "( Apply profile )",
          value: APPLY,
          description: "Write the mapping below to opencode.jsonc",
        },
        ...Object.entries(profile.tiers).map(([tier, ref]) => ({
          title: tier,
          value: `${TIER_PREFIX}${tier}`,
          description:
            overrides[tier] !== undefined
              ? `${overrides[tier]}  ← customized (preset: ${ref})`
              : ref,
        })),
        {
          title: "( Cancel )",
          value: CANCEL,
          description: "Discard overrides and close",
        },
      ],
      onSelect: (option) => {
        if (option.value === APPLY) {
          void applySelection(api, name, {
            ...profile,
            tiers: { ...profile.tiers, ...overrides },
          })
          return
        }
        if (option.value === CANCEL) {
          api.ui.dialog.clear()
          return
        }
        const tier = option.value.slice(TIER_PREFIX.length)
        if (tier in profile.tiers) {
          pickProvider(api, name, profile, overrides, tier)
        }
      },
    }),
  )
}

function startWizard(api: TuiPluginApi): void {
  const profiles = loadProfiles()
  if (profiles.size === 0) {
    toast(
      api,
      `No profiles found in ${PROFILES_DIR}.`,
      "warning",
    )
    return
  }

  const active = getActiveProfile()
  const sorted = Array.from(profiles.keys()).sort()

  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: "Switch model profile",
      placeholder: "Pick a profile to apply (Esc cancels)",
      options: [
        {
          title: "( Show current tier mapping )",
          value: SHOW_CURRENT,
          description: "Inspect active profile and per-tier model refs",
        },
        ...sorted.map((name) => ({
          title: name === active ? `${name}  ← active` : name,
          value: name,
          description: profiles.get(name)!.description?.slice(0, 100),
        })),
      ],
      onSelect: (option) => {
        if (option.value === SHOW_CURRENT) {
          showCurrentMapping(api)
          return
        }
        const profile = profiles.get(option.value)
        if (!profile) {
          api.ui.dialog.clear()
          toast(api, `Profile '${option.value}' vanished.`, "error")
          return
        }
        reviewTiers(api, option.value, profile, {})
      },
    }),
  )
}

// ─── Plugin entry ────────────────────────────────────────────────────

const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: [
      {
        name: "profile.switch",
        title: "Switch model profile",
        desc: "Pick a provider profile and rewrite agent models per tier",
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
  // (equivalent of the former server plugin's session.created hook).
  api.event.on("session.created", (event) => {
    const props = (event as { properties?: { info?: { parentID?: string } } })
      .properties
    if (props?.info?.parentID) return
    const active = getActiveProfile()
    if (!active) return
    toast(api, `Active profile: ${active}`)
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
}

export default plugin
