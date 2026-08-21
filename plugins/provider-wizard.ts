/// <reference types="bun" />
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui"

/**
 * Provider Wizard — TUI dialog-based provider configuration.
 *
 * The single provider management entry point: `/provider` opens a native
 * dialog wizard. Registered via `tui.json` → `plugin` array (TUI plugins
 * have no directory auto-discovery — they must be listed there).
 *
 * Entry points:
 *   /provider               — slash command (opens the wizard)
 *   command palette (ctrl+p) — "Provider setup wizard"
 *
 * Flow (each step is a host dialog):
 *   1. DialogSelect — pick a provider (active + available definitions),
 *                     or "( Manage provider models )" to add/remove
 *                     models on an active provider
 *   2. DialogPrompt — baseURL  (empty input keeps the current value)
 *   3. DialogPrompt — apiKey   (never pre-filled with a literal secret)
 *   4. atomic write of opencode.jsonc + success toast
 *
 * Model management flow:
 *   1. DialogSelect — pick an active provider
 *   2. DialogSelect — its models; "( Add model… )" walks three prompts
 *                     (key → upstream id → display name), picking an
 *                     existing model asks for removal confirmation
 *
 * If the picked provider is not active yet but has a definition in
 * ~/.config/opencode/providers/, step 1 activates it automatically.
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
  mkdirSync,
  readdirSync,
  renameSync,
} from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "opencode.jsonc")
const PROVIDERS_DIR = join(CONFIG_DIR, "providers")
const PLUGIN_ID = "opencode-config.provider"
const MANAGE_MODELS = "__manage_models__"
const ADD_MODEL = "__add_model__"

// ─── Types ───────────────────────────────────────────────────────────

interface ModelDef {
  name?: string
  id?: string
  [key: string]: unknown
}

interface ProviderDef {
  npm?: string
  name?: string
  options?: Record<string, unknown>
  models?: Record<string, ModelDef>
  [key: string]: unknown
}

interface OpenCodeConfig {
  model?: string
  provider?: Record<string, ProviderDef>
  [key: string]: unknown
}

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

function isEnvToken(value: unknown): boolean {
  return String(value).startsWith("{env:")
}

// ─── Wizard steps ────────────────────────────────────────────────────

function toast(
  api: TuiPluginApi,
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
) {
  api.ui.toast({ title: "Provider wizard", message, variant })
}

function promptBaseURL(
  api: TuiPluginApi,
  config: OpenCodeConfig,
  id: string,
  provider: ProviderDef,
  added: boolean,
): void {
  const current = provider.options?.baseURL
  const currentHint = current === undefined ? "not set" : `current: ${String(current)}`

  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: `${id} — baseURL`,
      placeholder: `https://api.example.com/v1 or {env:VAR} (${currentHint}; empty keeps)`,
      value: current !== undefined && !isEnvToken(current) ? String(current) : "",
      onConfirm: (value) => {
        const v = value.trim()
        if (v) {
          provider.options ??= {}
          provider.options.baseURL = v
        }
        promptApiKey(api, config, id, provider, added)
      },
      onCancel: () => {
        api.ui.dialog.clear()
        toast(api, `Cancelled — ${added ? `'${id}' was activated but ` : ""}no credentials changed.`, "warning")
      },
    }),
  )
}

function promptApiKey(
  api: TuiPluginApi,
  config: OpenCodeConfig,
  id: string,
  provider: ProviderDef,
  added: boolean,
): void {
  const current = provider.options?.apiKey
  const currentHint = current === undefined
    ? "not set"
    : isEnvToken(current)
      ? `current: ${String(current)}`
      : "current: set (hidden)"

  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: `${id} — apiKey`,
      // Never pre-fill a literal secret; env tokens are safe to show.
      placeholder: `sk-... or {env:VAR} (${currentHint}; empty keeps)`,
      value: "",
      onConfirm: (value) => {
        const v = value.trim()
        if (v) {
          provider.options ??= {}
          provider.options.apiKey = v
        }
        try {
          writeConfigAtomic(CONFIG_FILE, config)
          api.ui.dialog.clear()
          toast(
            api,
            `${added ? `'${id}' activated + ` : ""}credentials saved — restart opencode to take effect.`,
            "success",
          )
        } catch (err) {
          api.ui.dialog.clear()
          toast(api, `Failed to write config: ${(err as Error).message}`, "error")
        }
      },
      onCancel: () => {
        api.ui.dialog.clear()
        toast(api, `Cancelled — ${added ? `'${id}' was activated but ` : ""}no credentials changed.`, "warning")
      },
    }),
  )
}

function startWizard(api: TuiPluginApi): void {
  let config: OpenCodeConfig
  try {
    config = readConfig(CONFIG_FILE)
  } catch (err) {
    toast(api, `Cannot read ${CONFIG_FILE}: ${(err as Error).message}`, "error")
    return
  }

  const defs = loadDefinitions()
  const ids = Array.from(
    new Set<string>([...Object.keys(config.provider ?? {}), ...defs.keys()]),
  ).sort()

  if (ids.length === 0) {
    toast(
      api,
      `No providers configured and no definitions in ${PROVIDERS_DIR}.`,
      "warning",
    )
    return
  }

  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: "Provider setup — select provider",
      placeholder: "Pick a provider to configure credentials for",
      options: [
        {
          title: "( Manage provider models )",
          value: MANAGE_MODELS,
          description: "Add or remove models on an active provider",
        },
        ...ids.map((id) => {
          const active = config.provider?.[id]
          return {
            title: id,
            value: id,
            description: active
              ? "active in opencode.jsonc"
              : `available (${defs.get(id)?.source}) — will be activated`,
          }
        }),
      ],
      onSelect: (option) => {
        if (option.value === MANAGE_MODELS) {
          manageModelsPicker(api)
          return
        }
        const id = option.value
        const provider = config.provider?.[id]
        let added = false

        if (!provider) {
          const entry = defs.get(id)
          if (!entry) {
            api.ui.dialog.clear()
            toast(api, `No definition for '${id}'.`, "error")
            return
          }
          config.provider ??= {}
          config.provider[id] = entry.def
          added = true
        }

        promptBaseURL(api, config, id, config.provider![id], added)
      },
    }),
  )
}

// ─── Model management: input/remove models on an active provider ───

function manageModelsPicker(api: TuiPluginApi): void {
  let config: OpenCodeConfig
  try {
    config = readConfig(CONFIG_FILE)
  } catch (err) {
    toast(api, `Cannot read ${CONFIG_FILE}: ${(err as Error).message}`, "error")
    return
  }

  const ids = Object.keys(config.provider ?? {})
    .filter((pid) => config.provider![pid]?.models)
    .sort()
  if (ids.length === 0) {
    api.ui.dialog.clear()
    toast(api, "No active provider has a models section.", "warning")
    return
  }

  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: "Manage models — select provider",
      placeholder: "Pick a provider to add/remove models (Esc closes)",
      options: ids.map((pid) => ({
        title: pid,
        value: pid,
        description: `${Object.keys(config.provider![pid].models!).length} model(s)`,
      })),
      onSelect: (option) => modelList(api, option.value),
    }),
  )
}

function modelList(api: TuiPluginApi, id: string): void {
  let config: OpenCodeConfig
  try {
    config = readConfig(CONFIG_FILE)
  } catch (err) {
    api.ui.dialog.clear()
    toast(api, `Cannot read config: ${(err as Error).message}`, "error")
    return
  }
  const def = config.provider?.[id]
  const models = def?.models
  if (!models) {
    api.ui.dialog.clear()
    toast(api, `Provider '${id}' has no models section.`, "error")
    return
  }

  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: `${id} — models`,
      placeholder: "Pick a model to remove, or add a new one (Esc closes)",
      options: [
        {
          title: "( Add model… )",
          value: ADD_MODEL,
          description: "Enter key, upstream id and display name",
        },
        ...Object.entries(models).map(([key, m]) => ({
          title: key,
          value: key,
          description: m.name ? `${m.name} — upstream id: ${m.id ?? key}` : `upstream id: ${m.id ?? key}`,
        })),
      ],
      onSelect: (option) => {
        if (option.value === ADD_MODEL) {
          promptModelKey(api, id)
          return
        }
        confirmRemoveModel(api, config, id, option.value)
      },
    }),
  )
}

function confirmRemoveModel(
  api: TuiPluginApi,
  config: OpenCodeConfig,
  id: string,
  key: string,
): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogConfirm({
      title: `${id} — remove model`,
      message: `Remove model '${key}' from '${id}'? Profiles referencing '${id}/${key}' will break.`,
      onConfirm: () => {
        delete config.provider![id].models![key]
        try {
          writeConfigAtomic(CONFIG_FILE, config)
          toast(api, `Removed '${id}/${key}' — restart opencode to take effect.`, "success")
        } catch (err) {
          toast(api, `Failed to write config: ${(err as Error).message}`, "error")
        }
        modelList(api, id)
      },
      onCancel: () => modelList(api, id),
    }),
  )
}

function promptModelKey(api: TuiPluginApi, id: string): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: `${id} — new model key`,
      placeholder: "Key used in refs '<provider>/<key>', e.g. gpt-5.6-low or vendor/gpt-5.6",
      value: "",
      onConfirm: (value) => {
        const key = value.trim()
        // opencode parses refs on the FIRST slash, so the key may contain
        // '/' for nested ids (e.g. 'vendor/gpt-5.6') — only spaces, edge
        // slashes and '//' are rejected.
        if (
          !key ||
          /\s/.test(key) ||
          key.startsWith("/") ||
          key.endsWith("/") ||
          key.includes("//")
        ) {
          toast(api, "Invalid key — no spaces; '/' allowed inside, not at edges or doubled.", "error")
          promptModelKey(api, id)
          return
        }
        let config: OpenCodeConfig
        try {
          config = readConfig(CONFIG_FILE)
        } catch (err) {
          api.ui.dialog.clear()
          toast(api, `Cannot read config: ${(err as Error).message}`, "error")
          return
        }
        if (config.provider?.[id]?.models?.[key]) {
          toast(api, `Model '${key}' already exists on '${id}'.`, "error")
          promptModelKey(api, id)
          return
        }
        promptModelId(api, id, key)
      },
      onCancel: () => modelList(api, id),
    }),
  )
}

function promptModelId(api: TuiPluginApi, id: string, key: string): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: `${id}/${key} — upstream model id`,
      placeholder: "Id sent to the API (empty keeps the key)",
      value: key,
      onConfirm: (value) => {
        const modelId = value.trim() || key
        promptModelName(api, id, key, modelId)
      },
      onCancel: () => modelList(api, id),
    }),
  )
}

function promptModelName(
  api: TuiPluginApi,
  id: string,
  key: string,
  modelId: string,
): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: `${id}/${key} — display name`,
      placeholder: "Shown in pickers (empty keeps the key)",
      value: key,
      onConfirm: (value) => {
        const name = value.trim() || key
        let config: OpenCodeConfig
        try {
          config = readConfig(CONFIG_FILE)
          const models = config.provider?.[id]?.models
          if (!models) throw new Error(`provider '${id}' has no models section`)
          models[key] = { name, id: modelId }
          writeConfigAtomic(CONFIG_FILE, config)
          toast(
            api,
            `Added '${id}/${key}' — restart opencode to take effect.`,
            "success",
          )
        } catch (err) {
          toast(api, `Failed to add model: ${(err as Error).message}`, "error")
        }
        modelList(api, id)
      },
      onCancel: () => modelList(api, id),
    }),
  )
}

// ─── Plugin entry ────────────────────────────────────────────────────

const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: [
      {
        name: "provider.wizard",
        title: "Provider setup wizard",
        desc: "Guided provider configuration (credentials + model list) via dialogs",
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
