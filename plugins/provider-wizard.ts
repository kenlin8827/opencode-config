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
import { tr, initI18n, languageOption, toggleLocale, localeName, SWITCH_LANG, withBookends } from "./i18n"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "opencode.jsonc")
const PROVIDERS_DIR = join(CONFIG_DIR, "providers")
const PLUGIN_ID = "opencode-prime.provider"
const MANAGE_MODELS = "__manage_models__"
const ADD_MODEL = "__add_model__"
const BACK = "__back__"

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
  api.ui.toast({ title: tr("provider.toastTitle"), message, variant })
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
      title: tr("provider.baseURLTitle", { id }),
      placeholder: tr("provider.baseURLPlaceholder", { hint: currentHint }),
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
        toast(api, added ? tr("provider.cancelledAdded", { id }) : tr("provider.cancelled"), "warning")
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
      title: tr("provider.apiKeyTitle", { id }),
      // Never pre-fill a literal secret; env tokens are safe to show.
      placeholder: tr("provider.apiKeyPlaceholder", { hint: currentHint }),
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
            added ? tr("provider.configSavedAdded", { id }) : tr("provider.configSaved", { id }),
            "success",
          )
        } catch (err) {
          api.ui.dialog.clear()
          toast(api, tr("provider.writeFailed", { err: (err as Error).message }), "error")
        }
      },
      onCancel: () => {
        api.ui.dialog.clear()
        toast(api, added ? tr("provider.cancelledAdded", { id }) : tr("provider.cancelled"), "warning")
      },
    }),
  )
}

function startWizard(api: TuiPluginApi): void {
  let config: OpenCodeConfig
  try {
    config = readConfig(CONFIG_FILE)
  } catch (err) {
    toast(api, tr("provider.cannotReadConfig", { path: CONFIG_FILE, err: (err as Error).message }), "error")
    return
  }

  const defs = loadDefinitions()
  const ids = Array.from(
    new Set<string>([...Object.keys(config.provider ?? {}), ...defs.keys()]),
  ).sort()

  if (ids.length === 0) {
    toast(
      api,
      tr("provider.noProvidersAvailable", { dir: PROVIDERS_DIR }),
      "warning",
    )
    return
  }

  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: tr("provider.setupTitle"),
      placeholder: tr("provider.setupPlaceholder"),
      options: [
        {
          title: tr("provider.manageModels"),
          value: MANAGE_MODELS,
          description: tr("provider.manageModelsDesc"),
        },
        ...ids.map((id) => {
          const active = config.provider?.[id]
          return {
            title: id,
            value: id,
            description: active
              ? tr("provider.activeInConfig")
              : tr("provider.availableFromDef", { source: defs.get(id)?.source ?? "" }),
          }
        }),
        languageOption(api),
      ],
      onSelect: (option) => {
        if (option.value === SWITCH_LANG) {
          const next = toggleLocale(api)
          toast(api, tr("common.langSwitched", { lang: localeName(next) }), "info")
          startWizard(api)
          return
        }
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
            toast(api, tr("provider.noDefinition", { id }), "error")
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
    toast(api, tr("provider.cannotReadConfig", { path: CONFIG_FILE, err: (err as Error).message }), "error")
    return
  }

  const ids = Object.keys(config.provider ?? {})
    .filter((pid) => config.provider![pid]?.models)
    .sort()
  if (ids.length === 0) {
    api.ui.dialog.clear()
    toast(api, tr("provider.noActiveModels"), "warning")
    return
  }

  let navigated = false
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: tr("provider.manageTitle"),
      placeholder: tr("provider.managePlaceholder"),
      options: withBookends(
        ids.map((pid) => ({
          title: pid,
          value: pid,
          description: tr("common.modelCount", { count: Object.keys(config.provider![pid].models!).length }),
        })),
        [
          {
            title: tr("common.back"),
            value: BACK,
            description: tr("provider.backToMain"),
          },
        ],
      ),
      onSelect: (option) => {
        navigated = true
        if (option.value === BACK) {
          startWizard(api)
          return
        }
        modelList(api, option.value)
      },
    }),
    () => {
      if (!navigated) setTimeout(() => startWizard(api), 0)
    },
  )
}

function modelList(api: TuiPluginApi, id: string): void {
  let config: OpenCodeConfig
  try {
    config = readConfig(CONFIG_FILE)
  } catch (err) {
    api.ui.dialog.clear()
    toast(api, tr("provider.cannotReadConfig", { path: "config", err: (err as Error).message }), "error")
    return
  }
  const def = config.provider?.[id]
  const models = def?.models
  if (!models) {
    api.ui.dialog.clear()
    toast(api, tr("provider.noModelsSection", { id }), "error")
    return
  }

  let navigated = false
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: tr("provider.modelsTitle", { id }),
      placeholder: tr("provider.modelsPlaceholder"),
      options: withBookends(
        Object.entries(models).map(([key, m]) => ({
          title: key,
          value: key,
          description: m.name ? `${m.name} — upstream id: ${m.id ?? key}` : `upstream id: ${m.id ?? key}`,
        })),
        [
          {
            title: tr("provider.addModel"),
            value: ADD_MODEL,
            description: tr("provider.addModelDesc"),
          },
          {
            title: tr("common.back"),
            value: BACK,
            description: tr("provider.backToMain"),
          },
        ],
      ),
      onSelect: (option) => {
        navigated = true
        if (option.value === ADD_MODEL) {
          promptModelKey(api, id)
          return
        }
        if (option.value === BACK) {
          manageModelsPicker(api)
          return
        }
        confirmRemoveModel(api, config, id, option.value)
      },
    }),
    () => {
      if (!navigated) setTimeout(() => manageModelsPicker(api), 0)
    },
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
      title: tr("provider.removeModelTitle", { id }),
      message: tr("provider.removeModelConfirm", { id, key }),
      onConfirm: () => {
        delete config.provider![id].models![key]
        try {
          writeConfigAtomic(CONFIG_FILE, config)
          toast(api, tr("provider.modelRemoved", { id, key }), "success")
        } catch (err) {
          toast(api, tr("provider.writeFailed", { err: (err as Error).message }), "error")
        }
        modelList(api, id)
      },
      onCancel: () => setTimeout(() => modelList(api, id), 0),
    }),
  )
}

function promptModelKey(api: TuiPluginApi, id: string): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: tr("provider.modelKeyTitle", { id }),
      placeholder: tr("provider.modelKeyPlaceholder"),
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
          toast(api, tr("provider.invalidKey"), "error")
          promptModelKey(api, id)
          return
        }
        let config: OpenCodeConfig
        try {
          config = readConfig(CONFIG_FILE)
        } catch (err) {
          api.ui.dialog.clear()
          toast(api, tr("provider.cannotReadConfig", { path: "config", err: (err as Error).message }), "error")
          return
        }
        if (config.provider?.[id]?.models?.[key]) {
          toast(api, tr("provider.modelExists", { id, key }), "error")
          promptModelKey(api, id)
          return
        }
        promptModelId(api, id, key)
      },
      onCancel: () => setTimeout(() => modelList(api, id), 0),
    }),
  )
}

function promptModelId(api: TuiPluginApi, id: string, key: string): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: tr("provider.modelIdTitle", { id, key }),
      placeholder: tr("provider.modelIdPlaceholder"),
      value: key,
      onConfirm: (value) => {
        const modelId = value.trim() || key
        promptModelName(api, id, key, modelId)
      },
      onCancel: () => setTimeout(() => modelList(api, id), 0),
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
      title: tr("provider.modelNameTitle", { id, key }),
      placeholder: tr("provider.modelNamePlaceholder"),
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
            tr("provider.modelAdded", { id, key }),
            "success",
          )
        } catch (err) {
          toast(api, tr("provider.addModelFailed", { err: (err as Error).message }), "error")
        }
        modelList(api, id)
      },
      onCancel: () => setTimeout(() => modelList(api, id), 0),
    }),
  )
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
