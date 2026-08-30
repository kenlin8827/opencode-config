/// <reference types="bun" />
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
  TuiDialogSelectProps,
} from "@opencode-ai/plugin/tui"

/**
 * Form pages hide the DialogSelect filter input (`renderFilter: false`):
 * no stray-key typing, single-Esc close. The host bridge forwards it from
 * opencode 1.19+; older hosts ignore the extra prop safely.
 */
type FormSelectProps = TuiDialogSelectProps<string> & { renderFilter?: boolean }

/**
 * Provider Wizard — TUI dialog-based provider configuration.
 *
 * The single provider management entry point: `/provider` opens a native
 * dialog wizard. Registered via `tui.template.jsonc` → `plugin` array (TUI plugins
 * have no directory auto-discovery — they must be listed there).
 *
 * Entry points:
 *   /provider               — slash command (opens the wizard)
 *   command palette (ctrl+p) — "Provider setup wizard"
 *
 * Flow — two dialog levels:
 *   Level 1: DialogSelect — "➕ Add custom provider" (blank) and "📦 Add preset
 *            provider" (imports a providers/ definition file into the
 *            config) pinned on top without category headers, then the
 *            providers stored in the opencode.jsonc `provider` node;
 *            `current` keeps the cursor on the first provider so picking
 *            stays one key away. Presets enter the list only via 📦.
 *   Level 2 (provider detail): DialogSelect —
 *     ⚙ Basic settings — shared settings form (name / npm / baseURL /
 *     apiKey); add mode prepends an editable id row and creates the
 *     provider on 💾. npm picks
 *     @ai-sdk/openai-compatible / @ai-sdk/anthropic — the SDK package
 *     decides the API protocol (opencode has no `type`). Draft-based:
 *     fields mutate in memory, 💾 saves once; empty apiKey keeps the
 *     stored key, a literal secret is never pre-filled. Literal keys go
 *     to opencode's auth.json — the store the official /connect command
 *     uses — while {env:VAR} refs stay in options.apiKey.
 *     fetch:      prompts a glob pattern (default *) and imports matching
 *                 models from the live `{baseURL}/models` (openai) or
 *                 `{baseURL}/v1/models` (anthropic) response; additive —
 *                 existing keys are skipped, never overwritten or deleted
 *     ── Models ──         one list mirroring the config node (natural
 *                          order); click opens the model form, 🗑 removes
 *                          the config entry
 *     ➕ Add model…        form sheet: identity / capabilities / limits
 *     📥 Fetch models…     import remote models by glob pattern
 *     🗑 Clear models…    remove models matching a glob pattern (* = all)
 *     🗑 Delete provider…  confirm, then drop the whole config entry
 *   Writes go through atomic opencode.jsonc saves (forms on 💾); the
 *   saved provider is compacted — fields equal to host parse defaults
 *   are omitted so the file stays short and hand-editable.
 *
 * Changes require an opencode restart to take effect.
 *
 * Note: this is a TUI-only module — a single module cannot export both
 * `server` and `tui`. It only runs inside the TUI; headless sessions
 * have no /provider equivalent.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  mkdirSync,
} from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { tr, initI18n, languageOption, switchLanguage, SWITCH_LANG, type DialogOption } from "./i18n"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "opencode.jsonc")
const PROVIDERS_DIR = join(CONFIG_DIR, "providers")
// Literal API keys live here — the same file the official /connect command
// writes (opencode's Global.Path.data/auth.json), so both share one store.
const AUTH_FILE = join(homedir(), ".local", "share", "opencode", "auth.json")
const PLUGIN_ID = "opencode-prime.provider"
const ADD_PROVIDER = "__add_provider__"
const ADD_PRESET = "__add_preset__"
const EDIT_SETTINGS = "__edit_settings__"
const EDIT_ID = "__edit_id__"
const DELETE_PROVIDER = "__delete_provider__"
const SAVE_PROVIDER = "__save_provider__"
const EDIT_NAME = "__edit_name__"
const EDIT_NPM = "__edit_npm__"
const EDIT_BASE_URL = "__edit_base_url__"
const EDIT_API_KEY = "__edit_api_key__"
const FETCH_MODELS = "__fetch_models__"
const ADD_MODEL = "__add_model__"
const CLEAR_MODELS = "__clear_models__"
const MODEL_PREFIX = "model:"
const FIELD_KEY = "__field_key__"
const FIELD_ID = "__field_id__"
const FIELD_NAME = "__field_name__"
const FIELD_STATUS = "__field_status__"
const FIELD_ATTACHMENT = "__field_attachment__"
const FIELD_TEMPERATURE = "__field_temperature__"
const FIELD_REASONING = "__field_reasoning__"
const FIELD_TOOLCALL = "__field_toolcall__"
const FIELD_MODAL_IN = "__field_modal_in__"
const FIELD_MODAL_OUT = "__field_modal_out__"
const FIELD_CONTEXT = "__field_context__"
const FIELD_OUTPUT = "__field_output__"
const SAVE_MODEL = "__save_model__"
const DELETE_MODEL = "__delete_model__"

// ─── Types ───────────────────────────────────────────────────────────

interface ModelDef {
  name?: string
  id?: string
  status?: string
  attachment?: boolean
  temperature?: boolean
  reasoning?: boolean
  tool_call?: boolean
  modalities?: { input?: string[]; output?: string[] }
  limit?: { context?: number; output?: number }
  [key: string]: unknown
}

interface ProviderDef {
  npm?: string
  name?: string
  options?: Record<string, unknown>
  models?: Record<string, ModelDef>
  /** legacy: keys imported by old fetch versions; no longer written */
  presetModels?: Record<string, true>
  [key: string]: unknown
}

interface OpenCodeConfig {
  model?: string
  provider?: Record<string, ProviderDef>
  [key: string]: unknown
}

const NPM_OPENAI = "@ai-sdk/openai-compatible"
const NPM_ANTHROPIC = "@ai-sdk/anthropic"

// ─── JSONC stripping (same implementation as provider-config.ts) ────

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

// ─── Definition loading (same shape as provider-config.ts) ──────────

function loadDefinitions(): Map<string, { source: string; def: ProviderDef }> {
  const defs = new Map<string, { source: string; def: ProviderDef }>()
  if (!existsSync(PROVIDERS_DIR)) return defs
  let files: string[]
  try {
    files = readdirSync(PROVIDERS_DIR)
  } catch {
    return defs
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    try {
      const parsed = JSON.parse(
        readFileSync(join(PROVIDERS_DIR, file), "utf-8"),
      ) as Record<string, ProviderDef>
      for (const [id, def] of Object.entries(parsed)) {
        if (!def || typeof def !== "object" || !def.models) continue
        defs.set(id, { source: file, def })
      }
    } catch {
      // skip invalid definitions silently
    }
  }
  return defs
}

// ─── Small helpers ───────────────────────────────────────────────────

function isEnvToken(value: unknown): boolean {
  return String(value).startsWith("{env:")
}

function resolveEnv(value: string): string {
  return value.replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => process.env[name] ?? "")
}

/** Literal secrets are never echoed; env tokens are safe to display. */
function displayKey(value: unknown): string {
  if (value === undefined) return tr("common.unset")
  return isEnvToken(value) ? String(value) : "••••••••"
}

// ─── Auth store (shared with official /connect) ─────────────────────

interface AuthEntry {
  type?: string
  key?: string
}

function readAuth(): Record<string, AuthEntry> {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf-8")) as Record<string, AuthEntry>
  } catch {
    return {}
  }
}

/** api-type credential for a provider, as written by /connect or 💾. */
function authKey(id: string): string | undefined {
  const entry = readAuth()[id]
  return entry?.type === "api" && entry.key ? entry.key : undefined
}

function writeAuth(data: Record<string, AuthEntry>): void {
  mkdirSync(dirname(AUTH_FILE), { recursive: true })
  writeFileSync(AUTH_FILE + ".tmp", JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 })
  renameSync(AUTH_FILE + ".tmp", AUTH_FILE)
}

/** Natural order: 'router-2' sorts before 'router-10'. */
const naturalCmp = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })

function globToRegex(glob: string): RegExp {
  let re = ""
  for (const ch of glob) {
    if (ch === "*") re += ".*"
    else if (ch === "?") re += "."
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${re}$`)
}

function toast(
  api: TuiPluginApi,
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
) {
  api.ui.toast({ title: tr("provider.toastTitle"), message, variant })
}

/** Atomic save + toast. Returns false (and toasts) on write failure. */
function saveConfig(api: TuiPluginApi, config: OpenCodeConfig, id: string): boolean {
  try {
    compactProvider(config.provider?.[id])
    writeConfigAtomic(CONFIG_FILE, config)
    toast(api, tr("provider.configSaved", { id }), "success")
    return true
  } catch (err) {
    toast(api, tr("provider.writeFailed", { err: (err as Error).message }), "error")
    return false
  }
}

/**
 * Drops fields equal to opencode's parse defaults so the written provider
 * node stays short and hand-editable: npm openai-compatible (host default),
 * id/name = key, status active, tool_call true, other capability switches
 * false, text-only modalities, zero limits. Unknown fields pass through
 * untouched; only the provider being saved is compacted so hand-written
 * overrides on catalog providers elsewhere in the file are never rewritten.
 */
function compactProvider(provider: ProviderDef | undefined): void {
  if (!provider) return
  if (!provider.name) delete provider.name
  if (provider.npm === NPM_OPENAI) delete provider.npm
  delete provider.presetModels // legacy fetch bookkeeping
  if (provider.options && Object.keys(provider.options).length === 0) delete provider.options
  for (const [key, m] of Object.entries(provider.models ?? {})) {
    if (!m.id || m.id === key) delete m.id
    if (!m.name || m.name === key) delete m.name
    if (!m.status || m.status === "active") delete m.status
    if (m.attachment === false) delete m.attachment
    if (m.temperature === false) delete m.temperature
    if (m.reasoning === false) delete m.reasoning
    if (m.tool_call === true) delete m.tool_call
    const mods = m.modalities
    if (mods) {
      const textOnly = (v?: string[]) => !v || (v.length === 1 && v[0] === "text")
      if (textOnly(mods.input)) delete mods.input
      if (textOnly(mods.output)) delete mods.output
      if (Object.keys(mods).length === 0) delete m.modalities
    }
    const limit = m.limit
    if (limit) {
      const ctx = typeof limit.context === "number" ? limit.context : 0
      const out = typeof limit.output === "number" ? limit.output : 0
      const extra = Object.keys(limit).filter((k) => k !== "context" && k !== "output")
      if (!ctx && !out && extra.length === 0) delete m.limit
      else {
        // the host schema requires both when limit is present
        limit.context = ctx
        limit.output = out
      }
    }
  }
}

function readConfigOrToast(api: TuiPluginApi): OpenCodeConfig | null {
  try {
    return readConfig(CONFIG_FILE)
  } catch (err) {
    api.ui.dialog.clear()
    toast(api, tr("provider.cannotReadConfig", { path: CONFIG_FILE, err: (err as Error).message }), "error")
    return null
  }
}

// ─── Remote model fetch ──────────────────────────────────────────────

function parseModelList(body: unknown): Array<{ id: string; name: string }> {
  const raw = Array.isArray(body) ? body : (body as { data?: unknown } | null)?.data
  if (!Array.isArray(raw)) return []
  const out: Array<{ id: string; name: string }> = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const id = (item as { id?: unknown }).id
    if (typeof id !== "string" || !id) continue
    const name = (item as { name?: unknown }).name
    out.push({ id, name: typeof name === "string" && name ? name : id })
  }
  return out
}

async function fetchRemoteModels(
  npm: string,
  baseURL: string,
  apiKey: string,
): Promise<Array<{ id: string; name: string }>> {
  const base = baseURL.replace(/\/+$/, "")
  const headers: Record<string, string> = {}
  let url: string
  if (npm === NPM_ANTHROPIC) {
    url = `${base}/v1/models`
    headers["x-api-key"] = apiKey
    headers["anthropic-version"] = "2023-06-01"
  } else {
    url = `${base}/models`
    headers.Authorization = `Bearer ${apiKey}`
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`)
  return parseModelList((await res.json()) as unknown)
}

// ─── Level 1: provider list ──────────────────────────────────────────

function startWizard(api: TuiPluginApi): void {
  const config = readConfigOrToast(api)
  if (!config) return

  // the list mirrors the opencode.jsonc provider node — definition-file
  // presets are reachable only through the 📦 import picker
  const ids = Object.keys(config.provider ?? {}).sort(naturalCmp)

  const providersCat = tr("provider.configuredHeader")
  const interfaceCat = tr("common.interfaceHeader")

  const selectProps: FormSelectProps = {
    title: tr("provider.setupTitle"),
    placeholder: tr("provider.setupPlaceholder"),
    // ➕ has no category — the host renders it headerless on top
    options: [
      {
        title: tr("provider.addProvider"),
        value: ADD_PROVIDER,
        description: tr("provider.addProviderDesc"),
      },
      {
        title: tr("provider.addPresetProvider"),
        value: ADD_PRESET,
        description: tr("provider.addPresetProviderDesc"),
      },
      ...ids.map((id) => {
        const provider = config.provider?.[id]
        const baseURL = provider?.options?.baseURL
        return {
          title: id,
          value: id,
          description: `${baseURL ? String(baseURL) : tr("common.unset")} · ${tr("common.modelCount", { count: Object.keys(provider?.models ?? {}).length })}`,
          category: providersCat,
        }
      }),
      { ...languageOption(api), category: interfaceCat },
    ],
    // keep the main path (pick a provider) under the cursor
    current: ids[0],
    onSelect: (option) => {
      if (option.value === SWITCH_LANG) {
        switchLanguage(api, () => startWizard(api))
        return
      }
      if (option.value === ADD_PROVIDER) {
        providerForm(api, "", { id: "", name: "", npm: NPM_OPENAI, baseURL: "", apiKey: "", keySet: false }, true)
        return
      }
      if (option.value === ADD_PRESET) {
        pickPresetProvider(api)
        return
      }
      detailMenu(api, option.value)
    },
  }
  // level 1 is the wizard root — Esc just closes it
  api.ui.dialog.replace(() => api.ui.DialogSelect<string>(selectProps))
}

// ─── Level 1.5: preset providers (providers/ definition files) ────

/** Picker listing every preset; already-added ones jump to their details. */
function pickPresetProvider(api: TuiPluginApi): void {
  const config = readConfigOrToast(api)
  if (!config) return
  // actionable first: presets not yet in the config sort above added
  // ones; natural id order within each group
  const presets = [...loadDefinitions().entries()].sort(([a], [b]) => {
    const done = (config.provider?.[a] ? 1 : 0) - (config.provider?.[b] ? 1 : 0)
    return done || naturalCmp(a, b)
  })
  if (presets.length === 0) {
    toast(api, tr("provider.noPresetsLeft"), "warning")
    setTimeout(() => startWizard(api), 0)
    return
  }
  let navigated = false
  const selectProps: FormSelectProps = {
    title: tr("provider.pickPresetTitle"),
    placeholder: tr("provider.pickPresetPlaceholder"),
    options: presets.map(([id, { source, def }]) => ({
      title: id,
      value: id,
      description: `${source} · ${tr("common.modelCount", { count: Object.keys(def.models ?? {}).length })}${config.provider?.[id] ? ` · ${tr("common.addedMarker")}` : ""}`,
    })),
    renderFilter: false,
    onSelect: (option) => {
      navigated = true
      if (config.provider?.[option.value]) {
        // already imported — go straight to its details
        detailMenu(api, option.value)
      } else {
        importPreset(api, option.value)
      }
    },
  }
  api.ui.dialog.replace(() => api.ui.DialogSelect<string>(selectProps), () => {
    if (!navigated) setTimeout(() => startWizard(api), 0)
  })
}

/** Copies a definition-file provider into the config (additive). */
function importPreset(api: TuiPluginApi, id: string): void {
  const config = readConfigOrToast(api)
  if (!config) return
  const def = loadDefinitions().get(id)?.def
  if (!def) {
    toast(api, tr("provider.providerVanished", { id }), "error")
    setTimeout(() => startWizard(api), 0)
    return
  }
  config.provider = config.provider ?? {}
  config.provider[id] = def
  if (saveConfig(api, config, id)) {
    setTimeout(() => detailMenu(api, id), 0)
  }
}

// ─── Level 2: provider detail menu ───────────────────────────────────────

function detailMenu(api: TuiPluginApi, id: string): void {
  const config = readConfigOrToast(api)
  if (!config) return
  const provider = config.provider?.[id]
  if (!provider) {
    toast(api, tr("provider.providerVanished", { id }), "error")
    startWizard(api)
    return
  }
  const options = provider.options ?? {}
  const storedAuthKey = authKey(id)
  // state the store explicitly so users never wonder where the key lives;
  // wording stays domain language — no implementation file names
  const keyDescription =
    options.apiKey !== undefined
      ? isEnvToken(options.apiKey)
        ? String(options.apiKey)
        : `••••••· ${tr("provider.keyInConfig")}`
      : storedAuthKey !== undefined
        ? `••••••· ${tr("provider.keyInCredStore")}`
        : tr("common.unset")
  const entries = Object.entries(provider.models ?? {}).sort(([a], [b]) => naturalCmp(a, b))

  const modelDesc = (m: ModelDef, key: string): string =>
    m.name ? `${m.name} — upstream id: ${m.id ?? key}` : `upstream id: ${m.id ?? key}`

  // The host DialogSelect renders `category` as bold accent section
  // headers that are NOT focusable options — real grouping, no fake rows.
  const settingsCat = tr("provider.settingsHeader")
  const items: DialogOption<string>[] = [
    {
      title: tr("provider.basicSettings"),
      value: EDIT_SETTINGS,
      description: `${tr("provider.npmLabel")}: ${provider.npm ?? NPM_OPENAI} · ${tr("provider.baseURLLabel")}: ${options.baseURL !== undefined ? String(options.baseURL) : tr("common.unset")} · ${tr("provider.apiKeyLabel")}: ${keyDescription}`,
      category: settingsCat,
    },
  ]

  const modelsCat = tr("provider.modelsHeader")
  for (const [key, m] of entries) {
    items.push({ title: key, value: MODEL_PREFIX + key, description: modelDesc(m, key), category: modelsCat })
  }

  const actionsCat = tr("provider.actionsHeader")
  items.push(
    { title: tr("provider.addModel"), value: ADD_MODEL, description: tr("provider.addModelDesc"), category: actionsCat },
    { title: tr("provider.fetchModels"), value: FETCH_MODELS, description: tr("provider.fetchModelsDesc"), category: actionsCat },
    { title: tr("provider.clearModels"), value: CLEAR_MODELS, description: tr("provider.clearModelsDesc"), category: actionsCat },
    { title: tr("provider.deleteProvider"), value: DELETE_PROVIDER, category: actionsCat },
  )

  let navigated = false
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: tr("provider.detailTitle", { id }),
      placeholder: tr("provider.detailPlaceholder"),
      options: items,
      onSelect: (option) => {
        navigated = true
        switch (option.value) {
          case EDIT_SETTINGS: {
            const key = provider.options?.apiKey
            const keyIsEnv = key !== undefined && isEnvToken(key)
            const legacyLiteral = key !== undefined && !keyIsEnv
            providerForm(api, id, {
              id,
              name: typeof provider.name === "string" ? provider.name : "",
              npm: provider.npm ?? NPM_OPENAI,
              baseURL: provider.options?.baseURL !== undefined ? String(provider.options.baseURL) : "",
              // never pre-fill a literal secret; env tokens are safe to show
              apiKey: keyIsEnv ? String(key) : "",
              keySet: legacyLiteral || storedAuthKey !== undefined,
              keySource: legacyLiteral ? "config" : storedAuthKey !== undefined ? "auth" : undefined,
            })
            return
          }
          case DELETE_PROVIDER:
            confirmDeleteProvider(api, id)
            return
          case FETCH_MODELS:
            promptFetchPattern(api, id)
            return
          case CLEAR_MODELS:
            promptClearPattern(api, id)
            return
          case ADD_MODEL:
            modelForm(api, id, {
              key: "",
              id: "",
              name: "",
              status: "",
              attachment: false,
              temperature: false,
              reasoning: false,
              toolCall: true,
              modalitiesIn: ["text"],
              modalitiesOut: ["text"],
              contextLimit: "",
              outputLimit: "",
            })
            return
          default:
            break
        }
        if (option.value.startsWith(MODEL_PREFIX)) {
          const key = option.value.slice(MODEL_PREFIX.length)
          const m = provider.models?.[key]
          modelForm(
            api,
            id,
            {
              key,
              id: String(m?.id ?? ""),
              name: String(m?.name ?? ""),
              status: typeof m?.status === "string" ? m.status : "",
              attachment: Boolean(m?.attachment),
              temperature: Boolean(m?.temperature),
              reasoning: Boolean(m?.reasoning),
              toolCall: m?.tool_call === undefined ? true : Boolean(m.tool_call),
              modalitiesIn: Array.isArray(m?.modalities?.input) ? [...m.modalities.input] : ["text"],
              modalitiesOut: Array.isArray(m?.modalities?.output) ? [...m.modalities.output] : ["text"],
              contextLimit: typeof m?.limit?.context === "number" ? String(m.limit.context) : "",
              outputLimit: typeof m?.limit?.output === "number" ? String(m.limit.output) : "",
            },
            key,
          )
        }
      },
    }),
    () => {
      if (!navigated) setTimeout(() => startWizard(api), 0)
    },
  )
}

// ─── Level 2 actions: settings form ─────────────────────────────────

/**
 * Shared settings form — one function serves both modes:
 *   · add (isNew): ➕ opens it directly; the id row is editable and the
 *     provider is only created on 💾
 *   · edit: the detail menu ⚙ row opens it pre-filled from config
 * Draft semantics on save: empty name/baseURL clears the field; empty
 * apiKey keeps the existing key (never wipe a secret by accident).
 */
interface ProviderDraft {
  id: string
  name: string
  npm: string
  baseURL: string
  apiKey: string
  // a literal secret is already stored but never pre-filled into the form
  keySet: boolean
  // where keySet lives: opencode's auth.json, or legacy config options.apiKey
  keySource?: "auth" | "config"
}

function providerForm(api: TuiPluginApi, id: string, draft: ProviderDraft, isNew = false): void {
  const fieldsCat = tr("provider.formFieldsHeader")
  const actionsCat = tr("provider.formActionsHeader")
  const shown = (v: string) => (v ? v : tr("common.unset"))
  // sub-page titles need some id even before the user typed one
  const displayId = isNew ? draft.id || "…" : id
  const items: DialogOption<string>[] = []
  items.push(
    // id is always editable: editing means renaming the config key +
    // migrating auth; a blank entry falls back to the original id (no rename)
    { title: `id: ${shown(isNew ? draft.id : draft.id || id)}${isNew && !draft.id ? " *" : ""}`, value: EDIT_ID, description: tr("provider.idPlaceholder"), category: fieldsCat },
    { title: `${tr("provider.nameLabel")}: ${shown(draft.name)}`, value: EDIT_NAME, description: tr("provider.editNameDesc"), category: fieldsCat },
    { title: `${tr("provider.npmLabel")}: ${draft.npm}`, value: EDIT_NPM, description: tr("provider.pickNpmPlaceholder"), category: fieldsCat },
    { title: `${tr("provider.baseURLLabel")}: ${shown(draft.baseURL)}${!draft.baseURL && draft.npm !== NPM_ANTHROPIC ? " *" : ""}`, value: EDIT_BASE_URL, description: tr("provider.editBaseURLDesc"), category: fieldsCat },
    { title: `${tr("provider.apiKeyLabel")}: ${draft.apiKey ? displayKey(draft.apiKey) : draft.keySet ? `••••••· ${tr(draft.keySource === "config" ? "provider.keyInConfig" : "provider.keyInCredStore")}` : tr("common.unset")}`, value: EDIT_API_KEY, description: tr("provider.editApiKeyDesc"), category: fieldsCat },
    { title: tr("provider.saveProvider"), value: SAVE_PROVIDER, category: actionsCat },
  )

  // Esc returns: onClose is wired to `back` below

  const back = () => {
    if (isNew) startWizard(api)
    else detailMenu(api, id)
  }

  let navigated = false
  const selectProps: FormSelectProps = {
    title: isNew ? tr("provider.addProviderFormTitle") : tr("provider.providerFormTitleEdit", { id }),
    placeholder: tr("provider.providerFormPlaceholder"),
    options: items,
    renderFilter: false,
    onSelect: (option) => {
      navigated = true
      switch (option.value) {
        case EDIT_ID:
          promptProviderField(api, displayId, draft, "id", isNew, back)
          return
        case EDIT_NAME:
          promptProviderField(api, displayId, draft, "name", isNew, back)
          return
        case EDIT_NPM:
          pickNpmDraft(api, displayId, draft, isNew, back)
          return
        case EDIT_BASE_URL:
          promptProviderField(api, displayId, draft, "baseURL", isNew, back)
          return
        case EDIT_API_KEY:
          promptProviderField(api, displayId, draft, "apiKey", isNew, back)
          return
        case SAVE_PROVIDER:
          saveProviderForm(api, id, draft, isNew)
          return
        default:
          break
      }
    },
  }
  api.ui.dialog.replace(() => api.ui.DialogSelect<string>(selectProps), () => {
    if (!navigated) setTimeout(back, 0)
  })
}

function promptProviderField(
  api: TuiPluginApi,
  id: string,
  draft: ProviderDraft,
  field: "id" | "name" | "baseURL" | "apiKey",
  isNew = false,
  onBack?: () => void,
): void {
  const titleKey =
    field === "id"
      ? "provider.idTitle"
      : field === "name"
        ? "provider.nameTitle"
        : field === "baseURL"
          ? "provider.baseURLTitle"
          : "provider.apiKeyTitle"
  const placeholderKey =
    field === "id"
      ? "provider.idPlaceholder"
      : field === "name"
        ? "provider.namePlaceholder"
        : field === "baseURL"
          ? "provider.baseURLPlaceholder"
          : "provider.apiKeyPlaceholder"
  const hint =
    field === "apiKey"
      ? draft.apiKey
        ? `current: ${draft.apiKey}`
        : draft.keySet
          ? `current: ${tr(draft.keySource === "config" ? "provider.keyInConfig" : "provider.keyInCredStore")}`
          : tr("common.unset")
      : draft[field]
        ? `current: ${draft[field]}`
        : tr("common.unset")

  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogPrompt({
        title: tr(titleKey, { id }),
        placeholder: tr(placeholderKey, { hint }),
        value: draft[field],
        onConfirm: (value) => {
          navigated = true
          draft[field] = value.trim()
          setTimeout(() => providerForm(api, id, draft, isNew), 0)
        },
        onCancel: () => {
          navigated = true
          setTimeout(onBack ?? (() => providerForm(api, id, draft, isNew)), 0)
        },
      }),
    () => {
      if (!navigated) setTimeout(onBack ?? (() => providerForm(api, id, draft, isNew)), 0)
    },
  )
}

function pickNpmDraft(api: TuiPluginApi, id: string, draft: ProviderDraft, isNew = false, onBack?: () => void): void {
  const known = [NPM_OPENAI, NPM_ANTHROPIC]
  // keep a custom package selectable so the user can switch back
  const values = known.includes(draft.npm) ? known : [draft.npm, ...known]
  let navigated = false
  const selectProps: FormSelectProps = {
    title: tr("provider.pickNpmTitle", { id }),
    placeholder: tr("provider.pickNpmPlaceholder"),
    options: values.map((npm) => ({
      title: npm,
      value: npm,
      description: npm === draft.npm ? tr("common.currentMarker") : "",
    })),
    renderFilter: false,
    onSelect: (option) => {
      navigated = true
      draft.npm = option.value
      setTimeout(() => providerForm(api, id, draft, isNew), 0)
    },
  }
  api.ui.dialog.replace(() => api.ui.DialogSelect<string>(selectProps), () => {
    if (!navigated) setTimeout(onBack ?? (() => providerForm(api, id, draft, isNew)), 0)
  })
}

function saveProviderForm(api: TuiPluginApi, id: string, draft: ProviderDraft, isNew = false): void {
  const newId = draft.id.trim()
  // rename path: edit mode + user typed a different, non-empty id
  const renamed = !isNew && newId.length > 0 && newId !== id
  const target = isNew || renamed ? newId : id
  const redraw = () => setTimeout(() => providerForm(api, id, draft, isNew), 0)
  if (isNew && !target) {
    toast(api, tr("provider.idRequired"), "error")
    redraw()
    return
  }
  if ((isNew || renamed) && !/^[a-z0-9][a-z0-9_-]*$/.test(target)) {
    toast(api, tr("provider.invalidProviderId"), "error")
    redraw()
    return
  }
  // openai-compatible packages have no default endpoint — baseURL is
  // mandatory; @ai-sdk/anthropic falls back to api.anthropic.com.
  if (!draft.baseURL && draft.npm !== NPM_ANTHROPIC) {
    toast(api, tr("provider.baseURLRequired"), "error")
    redraw()
    return
  }
  const config = readConfigOrToast(api)
  if (!config) return
  if (isNew) {
    if (config.provider?.[target]) {
      toast(api, tr("provider.providerExists", { id: target }), "error")
      redraw()
      return
    }
    config.provider ??= {}
    config.provider[target] = { models: {} }
  } else if (renamed) {
    if (config.provider?.[target]) {
      toast(api, tr("provider.providerExists", { id: target }), "error")
      redraw()
      return
    }
    // carry the full record (npm/options/models/name) to the new key
    config.provider![target] = config.provider![id]
    delete config.provider![id]
    // move the stored credential too — left behind, it would leak the
    // old id and bind to no provider (the /connect-mirrored lookup uses
    // the provider key, so a stale entry is dead weight at best)
    const authNow = readAuth()
    if (authNow[id]) {
      authNow[target] = authNow[id]
      delete authNow[id]
      try {
        writeAuth(authNow)
      } catch (err) {
        toast(api, tr("provider.writeFailed", { err: (err as Error).message }), "error")
        redraw()
        return
      }
    }
  }
  const provider = config.provider![target]
  if (draft.name) provider.name = draft.name
  else if (!isNew) delete provider.name
  provider.npm = draft.npm
  delete provider.type // legacy field from older wizard versions
  provider.options ??= {}
  if (draft.baseURL) provider.options.baseURL = draft.baseURL
  else if (!isNew) delete provider.options.baseURL
  // Secrets go to opencode's auth store — the very file /connect writes;
  // the config keeps only {env:VAR} refs. Empty input keeps the stored
  // key — never wipe a secret by accident.
  const auth = readAuth()
  let authDirty = false
  let migrated = false
  if (draft.apiKey) {
    if (isEnvToken(draft.apiKey)) {
      provider.options.apiKey = draft.apiKey
      // env ref wins at runtime; drop any stale secret for this provider
      if (auth[target]) {
        delete auth[target]
        authDirty = true
      }
    } else {
      auth[target] = { type: "api", key: draft.apiKey }
      authDirty = true
      // options.apiKey would override auth.json at runtime — drop it so
      // the credential lives in exactly one place
      delete provider.options.apiKey
    }
  } else if (!isNew && provider.options.apiKey !== undefined && !isEnvToken(provider.options.apiKey)) {
    // migrate a legacy literal from the config into the auth store
    auth[target] = { type: "api", key: String(provider.options.apiKey) }
    authDirty = true
    migrated = true
    delete provider.options.apiKey
  }
  if (authDirty) {
    try {
      writeAuth(auth)
    } catch (err) {
      toast(api, tr("provider.writeFailed", { err: (err as Error).message }), "error")
      redraw()
      return
    }
  }
  if (saveConfig(api, config, target)) {
    // tell the user the secret changed its home, so the vanishing config
    // entry never looks like data loss
    if (migrated) toast(api, tr("provider.keyMigrated"), "info")
    if (renamed) toast(api, tr("provider.providerRenamed", { from: id, to: target }), "info")
    detailMenu(api, target)
  }
}

// ─── Level 2 actions: fetch models ───────────────────────────────────

function promptFetchPattern(api: TuiPluginApi, id: string): void {
  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogPrompt({
        title: tr("provider.fetchPatternTitle", { id }),
        placeholder: tr("provider.fetchPatternPlaceholder"),
        value: "*",
        onConfirm: (value) => {
          navigated = true
          void doFetch(api, id, value.trim() || "*")
        },
        onCancel: () => {
          navigated = true
          setTimeout(() => detailMenu(api, id), 0)
        },
      }),
    () => {
      if (!navigated) setTimeout(() => detailMenu(api, id), 0)
    },
  )
}

async function doFetch(api: TuiPluginApi, id: string, pattern: string): Promise<void> {
  const config = readConfigOrToast(api)
  if (!config) return
  const provider = config.provider?.[id]
  if (!provider) {
    startWizard(api)
    return
  }

  const rawBaseURL = provider.options?.baseURL
  const rawKey = provider.options?.apiKey
  const storedAuthKey = authKey(id)
  if (rawBaseURL === undefined) {
    toast(api, tr("provider.fetchNeedsBaseURL"), "warning")
    detailMenu(api, id)
    return
  }
  if (rawKey === undefined && storedAuthKey === undefined) {
    toast(api, tr("provider.fetchNeedsKey"), "warning")
    detailMenu(api, id)
    return
  }
  const baseURL = resolveEnv(String(rawBaseURL))
  // options.apiKey (possibly a {env:VAR} ref) wins at runtime; auth.json
  // — shared with /connect — is the fallback
  const apiKey = typeof rawKey === "string" && rawKey ? resolveEnv(rawKey) : storedAuthKey!
  const envRefs: Array<[string, string]> = [[String(rawBaseURL), baseURL]]
  if (typeof rawKey === "string" && rawKey) envRefs.push([rawKey, apiKey])
  for (const [name, value] of envRefs) {
    const match = name.match(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/)
    if (match && !value) {
      toast(api, tr("provider.fetchEnvMissing", { name: match[1] }), "error")
      detailMenu(api, id)
      return
    }
  }

  let remote: Array<{ id: string; name: string }>
  try {
    remote = await fetchRemoteModels(provider.npm ?? NPM_OPENAI, baseURL, apiKey)
  } catch (err) {
    toast(api, tr("provider.fetchFailed", { err: (err as Error).message }), "error")
    detailMenu(api, id)
    return
  }

  const re = globToRegex(pattern)
  const matched = remote.filter((m) => re.test(m.id))
  if (matched.length === 0) {
    toast(api, tr("provider.fetchNoMatch", { pattern, total: remote.length }), "warning")
    detailMenu(api, id)
    return
  }

  provider.models ??= {}
  // Additive import: existing keys (user-added, presets, earlier fetches)
  // are never overwritten or deleted — duplicates are skipped.
  let added = 0
  let skipped = 0
  for (const m of matched) {
    if (provider.models[m.id]) {
      skipped++
      continue
    }
    provider.models[m.id] = { name: m.name, id: m.id }
    added++
  }
  // legacy fetch bookkeeping — no longer written
  delete provider.presetModels

  if (added === 0) {
    toast(api, tr("provider.fetchNoNew", { skipped, id }), "info")
  } else {
    try {
      compactProvider(provider)
      writeConfigAtomic(CONFIG_FILE, config)
      toast(api, tr("provider.fetchImported", { added, skipped, id, pattern }), "success")
    } catch (err) {
      toast(api, tr("provider.writeFailed", { err: (err as Error).message }), "error")
    }
  }
  detailMenu(api, id)
}

// ─── Level 2 actions: add/remove models ──────────────────────────────

function promptClearPattern(api: TuiPluginApi, id: string): void {
  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogPrompt({
        title: tr("provider.clearModelsPatternTitle", { id }),
        placeholder: tr("provider.clearModelsPatternPlaceholder"),
        value: "*",
        onConfirm: (value) => {
          navigated = true
          void doClearModels(api, id, value.trim() || "*")
        },
        onCancel: () => {
          navigated = true
          setTimeout(() => detailMenu(api, id), 0)
        },
      }),
    () => {
      if (!navigated) setTimeout(() => detailMenu(api, id), 0)
    },
  )
}

function doClearModels(api: TuiPluginApi, id: string, pattern: string): void {
  const config = readConfigOrToast(api)
  if (!config) return
  const models = config.provider?.[id]?.models ?? {}
  const allKeys = Object.keys(models)
  if (allKeys.length === 0) {
    toast(api, tr("provider.noModelsToClear", { id }), "info")
    setTimeout(() => detailMenu(api, id), 0)
    return
  }

  const re = globToRegex(pattern)
  const matched = allKeys.filter((key) => re.test(key))
  if (matched.length === 0) {
    toast(api, tr("provider.clearModelsNoMatch", { id, pattern }), "warning")
    setTimeout(() => detailMenu(api, id), 0)
    return
  }

  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogConfirm({
        title: tr("provider.clearModelsTitle", { id }),
        message: tr("provider.clearModelsConfirm", { id, count: matched.length, pattern }),
        onConfirm: () => {
          navigated = true
          for (const key of matched) {
            delete config.provider![id].models![key]
          }
          if (saveConfig(api, config, id)) {
            toast(api, tr("provider.modelsCleared", { id, count: matched.length, pattern }), "success")
          }
          setTimeout(() => detailMenu(api, id), 0)
        },
        onCancel: () => {
          navigated = true
          setTimeout(() => detailMenu(api, id), 0)
        },
      }),
    () => {
      if (!navigated) setTimeout(() => detailMenu(api, id), 0)
    },
  )
}

function confirmDeleteProvider(api: TuiPluginApi, id: string): void {
  const config = readConfigOrToast(api)
  if (!config) return
  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogConfirm({
        title: tr("provider.deleteProviderTitle", { id }),
        message: tr("provider.deleteProviderConfirm", { id }),
        onConfirm: () => {
          navigated = true
          delete config.provider![id]
          // also drop the /connect-shared credential, best-effort — the
          // config is gone anyway, a leftover secret is harmless
          const auth = readAuth()
          if (auth[id]) {
            delete auth[id]
            try {
              writeAuth(auth)
            } catch {
              // ignore credential cleanup failure
            }
          }
          // saveConfig's "saved" toast would mislead here — write directly
          try {
            writeConfigAtomic(CONFIG_FILE, config)
            toast(api, tr("provider.providerDeleted", { id }), "success")
          } catch (err) {
            toast(api, tr("provider.writeFailed", { err: (err as Error).message }), "error")
          }
          // defer: the host runs dialog.clear() after this callback returns
          setTimeout(() => startWizard(api), 0)
        },
        onCancel: () => {
          navigated = true
          setTimeout(() => detailMenu(api, id), 0)
        },
      }),
    () => {
      if (!navigated) setTimeout(() => detailMenu(api, id), 0)
    },
  )
}

function confirmRemoveModel(api: TuiPluginApi, id: string, key: string): void {
  const config = readConfigOrToast(api)
  if (!config) return
  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogConfirm({
        title: tr("provider.removeModelTitle", { id }),
        message: tr("provider.removeModelConfirm", { id, key }),
        onConfirm: () => {
          navigated = true
          delete config.provider![id].models![key]
          if (saveConfig(api, config, id)) {
            toast(api, tr("provider.modelRemoved", { id, key }), "success")
          }
          // defer: the host runs dialog.clear() after this callback returns
          setTimeout(() => detailMenu(api, id), 0)
        },
        onCancel: () => {
          navigated = true
          setTimeout(() => detailMenu(api, id), 0)
        },
      }),
    () => {
      if (!navigated) setTimeout(() => detailMenu(api, id), 0)
    },
  )
}

// ─── Level 2 actions: model form (add / edit) ──────────────────────
//
// Select-as-form: one DialogSelect "sheet" grouped into identity /
// capabilities / limits; picking a text field opens a DialogPrompt and
// returns to the sheet, capability rows toggle on click. No native
// multi-field form exists in the host.

interface ModelDraft {
  key: string
  id: string
  name: string
  status: string
  attachment: boolean
  temperature: boolean
  reasoning: boolean
  toolCall: boolean
  modalitiesIn: string[]
  modalitiesOut: string[]
  contextLimit: string
  outputLimit: string
}

const MODALITIES = ["text", "audio", "image", "video", "pdf"]

function modelForm(api: TuiPluginApi, id: string, draft: ModelDraft, origKey?: string): void {
  const editing = origKey !== undefined
  const fieldsCat = tr("provider.formFieldsHeader")
  const capsCat = tr("provider.formCapsHeader")
  const limitsCat = tr("provider.formLimitsHeader")
  const actionsCat = tr("provider.formActionsHeader")
  const shown = (v: string) => (v ? v : tr("common.unset"))
  const onOff = (v: boolean) => (v ? "on" : "off")

  const items: DialogOption<string>[] = [
    { title: `key: ${shown(draft.key)}${!draft.key ? " *" : ""}`, value: FIELD_KEY, description: tr("provider.modelKeyPlaceholder"), category: fieldsCat },
    { title: `id: ${shown(draft.id)}`, value: FIELD_ID, description: tr("provider.modelIdPlaceholder"), category: fieldsCat },
    { title: `name: ${shown(draft.name)}`, value: FIELD_NAME, description: tr("provider.modelNamePlaceholder"), category: fieldsCat },
    { title: `status: ${draft.status || "active"}`, value: FIELD_STATUS, description: tr("provider.fieldStatusDesc"), category: fieldsCat },
    { title: `attachment: ${onOff(draft.attachment)}`, value: FIELD_ATTACHMENT, description: tr("provider.capAttachmentDesc"), category: capsCat },
    { title: `temperature: ${onOff(draft.temperature)}`, value: FIELD_TEMPERATURE, description: tr("provider.capTemperatureDesc"), category: capsCat },
    { title: `reasoning: ${onOff(draft.reasoning)}`, value: FIELD_REASONING, description: tr("provider.capReasoningDesc"), category: capsCat },
    { title: `tool_call: ${onOff(draft.toolCall)}`, value: FIELD_TOOLCALL, description: tr("provider.capToolCallDesc"), category: capsCat },
    { title: `modalities.input: ${draft.modalitiesIn.join(", ") || tr("common.unset")}`, value: FIELD_MODAL_IN, category: capsCat },
    { title: `modalities.output: ${draft.modalitiesOut.join(", ") || tr("common.unset")}`, value: FIELD_MODAL_OUT, category: capsCat },
    { title: `limit.context: ${shown(draft.contextLimit)}`, value: FIELD_CONTEXT, description: tr("provider.limitContextPlaceholder"), category: limitsCat },
    { title: `limit.output: ${shown(draft.outputLimit)}`, value: FIELD_OUTPUT, description: tr("provider.limitOutputPlaceholder"), category: limitsCat },
    { title: tr("provider.saveModel"), value: SAVE_MODEL, category: actionsCat },
  ]
  if (editing) items.push({ title: tr("provider.deleteModel"), value: DELETE_MODEL, category: actionsCat })

  const toggle = (field: "attachment" | "temperature" | "reasoning" | "toolCall") => {
    draft[field] = !draft[field]
    setTimeout(() => modelForm(api, id, draft, origKey), 0)
  }

  let navigated = false
  const selectProps: FormSelectProps = {
    title: editing
      ? tr("provider.modelFormTitleEdit", { id, key: origKey! })
      : tr("provider.modelFormTitleAdd", { id }),
    placeholder: tr("provider.modelFormPlaceholder"),
    options: items,
    renderFilter: false,
    onSelect: (option) => {
      navigated = true
      switch (option.value) {
        case FIELD_KEY:
          fieldEdit(api, id, draft, origKey, "key", tr("provider.modelKeyPlaceholder"), () => detailMenu(api, id))
          return
        case FIELD_ID:
          fieldEdit(api, id, draft, origKey, "id", tr("provider.modelIdPlaceholder"), () => detailMenu(api, id))
          return
        case FIELD_NAME:
          fieldEdit(api, id, draft, origKey, "name", tr("provider.modelNamePlaceholder"), () => detailMenu(api, id))
          return
        case FIELD_STATUS: {
          // deprecated hides the model from suggestions — soft disable
          const order = ["", "deprecated", "alpha"]
          draft.status = order[(order.indexOf(draft.status) + 1) % order.length]
          setTimeout(() => modelForm(api, id, draft, origKey), 0)
          return
        }
        case FIELD_ATTACHMENT:
          toggle("attachment")
          return
        case FIELD_TEMPERATURE:
          toggle("temperature")
          return
        case FIELD_REASONING:
          toggle("reasoning")
          return
        case FIELD_TOOLCALL:
          toggle("toolCall")
          return
        case FIELD_MODAL_IN:
          modalitiesEdit(api, id, draft, origKey, "modalitiesIn", undefined, () => detailMenu(api, id))
          return
        case FIELD_MODAL_OUT:
          modalitiesEdit(api, id, draft, origKey, "modalitiesOut", undefined, () => detailMenu(api, id))
          return
        case FIELD_CONTEXT:
          fieldEdit(api, id, draft, origKey, "contextLimit", tr("provider.limitContextPlaceholder"), () => detailMenu(api, id))
          return
        case FIELD_OUTPUT:
          fieldEdit(api, id, draft, origKey, "outputLimit", tr("provider.limitOutputPlaceholder"), () => detailMenu(api, id))
          return
        case SAVE_MODEL:
          saveModelForm(api, id, draft, origKey)
          return
        case DELETE_MODEL:
          confirmRemoveModel(api, id, origKey!)
          return
        default:
          break
      }
    },
  }
  api.ui.dialog.replace(() => api.ui.DialogSelect<string>(selectProps), () => {
    if (!navigated) setTimeout(() => detailMenu(api, id), 0)
  })
}

function fieldEdit(
  api: TuiPluginApi,
  id: string,
  draft: ModelDraft,
  origKey: string | undefined,
  field: "key" | "id" | "name" | "contextLimit" | "outputLimit",
  placeholder: string,
  onBack?: () => void,
): void {
  let navigated = false
  api.ui.dialog.replace(
    () =>
      api.ui.DialogPrompt({
        title: tr("provider.modelFieldTitle", { id, field }),
        placeholder,
        value: draft[field],
        onConfirm: (value) => {
          navigated = true
          draft[field] = value.trim()
          modelForm(api, id, draft, origKey)
        },
        onCancel: () => {
          navigated = true
          setTimeout(onBack ?? (() => modelForm(api, id, draft, origKey)), 0)
        },
      }),
    () => {
      if (!navigated) setTimeout(onBack ?? (() => modelForm(api, id, draft, origKey)), 0)
    },
  )
}

function modalitiesEdit(
  api: TuiPluginApi,
  id: string,
  draft: ModelDraft,
  origKey: string | undefined,
  field: "modalitiesIn" | "modalitiesOut",
  focus?: string,
  onBack?: () => void,
): void {
  const dir = field === "modalitiesIn" ? "input" : "output"
  let navigated = false
  const selectProps: FormSelectProps = {
    title: tr("provider.modelFieldTitle", { id, field: `modalities.${dir}` }),
    placeholder: tr("provider.modalitiesPlaceholder"),
    options: MODALITIES.map((m) => ({
      title: `${m}: ${draft[field].includes(m) ? "on" : "off"}`,
      value: m,
    })),
    renderFilter: false,
    current: focus,
    onSelect: (option) => {
      navigated = true
      const list = draft[field]
      draft[field] = list.includes(option.value)
        ? list.filter((m) => m !== option.value)
        : [...MODALITIES.filter((m) => m === option.value || list.includes(m))]
      // keep the cursor on the toggled row
      setTimeout(() => modalitiesEdit(api, id, draft, origKey, field, option.value), 0)
    },
  }
  api.ui.dialog.replace(() => api.ui.DialogSelect<string>(selectProps), () => {
    if (!navigated) setTimeout(onBack ?? (() => modelForm(api, id, draft, origKey)), 0)
  })
}

function saveModelForm(api: TuiPluginApi, id: string, draft: ModelDraft, origKey?: string): void {
  const key = draft.key
  // opencode parses refs on the FIRST slash, so the key may contain '/'
  // for nested ids (e.g. 'vendor/gpt-5.6') — only spaces, edge slashes
  // and '//' are rejected.
  if (!key || /\s/.test(key) || key.startsWith("/") || key.endsWith("/") || key.includes("//")) {
    toast(api, tr("provider.invalidKey"), "error")
    setTimeout(() => modelForm(api, id, draft, origKey), 0)
    return
  }
  const ctx = draft.contextLimit ? Number(draft.contextLimit) : 0
  const out = draft.outputLimit ? Number(draft.outputLimit) : 0
  if (
    (draft.contextLimit && (!Number.isInteger(ctx) || ctx < 0)) ||
    (draft.outputLimit && (!Number.isInteger(out) || out < 0))
  ) {
    toast(api, tr("provider.invalidNumber"), "error")
    setTimeout(() => modelForm(api, id, draft, origKey), 0)
    return
  }
  const config = readConfigOrToast(api)
  if (!config) return
  const models = config.provider?.[id]?.models
  if (!models) {
    toast(api, tr("provider.addModelFailed", { err: `provider '${id}' has no models section` }), "error")
    detailMenu(api, id)
    return
  }
  if (models[key] && key !== origKey) {
    toast(api, tr("provider.modelExists", { id, key }), "error")
    setTimeout(() => modelForm(api, id, draft, origKey), 0)
    return
  }
  // Spread the existing entry so fields the form does not manage
  // (options, headers, variants, …) survive edits and renames.
  const existing: ModelDef = origKey !== undefined ? (models[origKey] ?? {}) : {}
  const entry: ModelDef = { ...existing, name: draft.name || key, id: draft.id || key }
  if (draft.status && draft.status !== "active") entry.status = draft.status
  else delete entry.status
  // Record capability fields only when they differ from the host
  // defaults (attachment/temperature/reasoning=false, tool_call=true)
  // to keep opencode.jsonc minimal.
  if (draft.attachment) entry.attachment = true
  else delete entry.attachment
  if (draft.temperature) entry.temperature = true
  else delete entry.temperature
  if (draft.reasoning) entry.reasoning = true
  else delete entry.reasoning
  if (!draft.toolCall) entry.tool_call = false
  else delete entry.tool_call
  const modsIn = draft.modalitiesIn.length ? draft.modalitiesIn : ["text"]
  const modsOut = draft.modalitiesOut.length ? draft.modalitiesOut : ["text"]
  const textOnly = (list: string[]) => list.length === 1 && list[0] === "text"
  if (!(textOnly(modsIn) && textOnly(modsOut))) entry.modalities = { input: modsIn, output: modsOut }
  else delete entry.modalities
  const limit: { context?: number; output?: number } = {}
  if (ctx) limit.context = ctx
  if (out) limit.output = out
  if (limit.context || limit.output) entry.limit = limit
  else delete entry.limit
  if (origKey !== undefined && origKey !== key) delete models[origKey]
  models[key] = entry
  if (saveConfig(api, config, id)) {
    toast(api, tr("provider.modelAdded", { id, key }), "success")
  }
  detailMenu(api, id)
}

// ─── Plugin entry ────────────────────────────────────────────────────

const tui: TuiPlugin = async (api) => {
  initI18n(api)
  api.keymap.registerLayer({
    commands: [
      {
        name: "provider.wizard",
        title: tr("provider.wizardTitle"),
        desc: tr("provider.cmdDesc"),
        category: "Provider",
        namespace: "palette",
        slashName: "provider",
        run() {
          startWizard(api)
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
