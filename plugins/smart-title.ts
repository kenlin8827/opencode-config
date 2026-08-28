/**
 * Smart Title Plugin (bundled) — auto-generates session titles with the
 * flash-tier model resolved from the active opencode config.
 *
 * Replaces the third-party @frankhommers/opencode-smart-title npm plugin,
 * which resolves models through @tarquinen/opencode-auth-provider: its
 * hardcoded fallback chain is stale (deepseek-chat no longer exists), it
 * cannot see subscription-plan provider IDs, and every failure is swallowed
 * silently.
 *
 * This bundled version reads the SAME config opencode runs on — no env vars,
 * no hardcoded model IDs:
 *   1. Candidate models (in priority order): smart-title.jsonc override →
 *      agent.explorer.model (the flash tier in tiers.json) → the session's
 *      own model (from its assistant messages) → global model.
 *   2. Endpoint/credentials = provider.<id>.options.baseURL/apiKey from that
 *      config ({env:...} placeholders are already interpolated server-side);
 *      providers without a baseURL (subscription plans) are skipped.
 *   3. Title is generated over plain OpenAI-compatible HTTP (zero npm
 *      dependencies → no ai-SDK version conflicts), trying each candidate
 *      until one succeeds.
 *   4. If every candidate fails: the first user question becomes the title
 *      (deterministic, always works). If even that is unavailable, the
 *      plugin steps back and opencode's built-in titling applies.
 *
 * Trigger: session.status idle (plus session.idle for forward compat).
 * Subagent sessions and unchanged conversations are skipped. Generation
 * errors are logged with a [smart-title] prefix — never silent.
 *
 * Config: ~/.config/opencode/smart-title.jsonc (JSONC, all keys optional):
 *   {
 *     "enabled": true,                  // master switch
 *     "model": "providerID/modelID",    // override the flash-tier default
 *     "prompt": "...",                  // custom generation instruction
 *     "titleFormat": "{title}",         // {title} {cwd} {cwdTip} {cwdTip:N}
 *     "updateThreshold": 1              // idle events between updates
 *   }
 */

import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode-ai/plugin"

// -- Constants ----------------------------------------------------------------

const CONFIG_FILE = join(homedir(), ".config", "opencode", "smart-title.jsonc")
// Flash tier per tiers.json — the fast/cheap layer explorer runs on.
const FLASH_TIER_AGENT = "explorer"
const DEFAULT_PROMPT =
  "You are a title generator. Generate a short, specific title (max 8 words) for this conversation. " +
  "Match the conversation's dominant language. Output ONLY the title itself — no quotes, no markdown, " +
  "no commentary, no word counts, no punctuation at the end."
const CONTEXT_MAX_CHARS = 4000
const REQUEST_TIMEOUT_MS = 30_000
const LOG_PREFIX = "[smart-title]"
// Upper bound on per-session tracking Maps.  If a user creates and closes
// hundreds of sessions without session.deleted events firing (or if the
// events have a different shape that our handler misses), the Maps would
// grow without limit.  This is a safety valve, not a normal code path.
const MAX_TRACKED_SESSIONS = 500

// -- Global safety net --------------------------------------------------------
// IMPORTANT: We do NOT register a process-level unhandledRejection handler.
//
// A previous version of this plugin registered one that checked whether the
// rejection string contained our [smart-title] prefix and swallowed it if
// so.  The intent was to be conservative (only suppress our own errors),
// but the side-effect was catastrophic: merely registering an
// unhandledRejection handler changes Node/Bun's default process-crash
// behavior for the ENTIRE process — not just this plugin.  Rejections from
// opencode itself (e.g. AI_APICallError when the main model returns 502 Bad
// Gateway) were silently swallowed, preventing opencode's own error
// recovery logic from seeing them.  This caused the server process to die
// in an unrecoverable state.
//
// Instead, every entry point in this plugin (handleIdle, event handler) is
// wrapped in try/catch, and the fire-and-forget call in the event handler
// has a .catch() safety net.  This is sufficient — no global handler needed.

// -- Plugin config (smart-title.jsonc) ------------------------------------------

export interface SmartTitleConfig {
  enabled: boolean
  /** "providerID/modelID" override; empty = use the flash-tier agent model. */
  model: string
  prompt: string
  titleFormat: string
  updateThreshold: number
}

/** Strip // and /* ... *\/ comments outside string literals (JSONC subset).
 *  Defensive: non-string input returns "" — parseConfig already guards
 *  with its own try/catch, but this prevents a raw TypeError if the
 *  function is called directly (e.g. from tests or future callers). */
export function stripJsonComments(text: string): string {
  if (typeof text !== "string") return ""
  let out = ""
  let inString = false
  let inLine = false
  let inBlock = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inLine) {
      if (ch === "\n") {
        inLine = false
        out += ch
      }
      continue
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false
        i++
      }
      continue
    }
    if (inString) {
      out += ch
      if (ch === "\\" && next !== undefined) {
        out += next
        i++
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === "/" && next === "/") {
      inLine = true
      i++
      continue
    }
    if (ch === "/" && next === "*") {
      inBlock = true
      i++
      continue
    }
    out += ch
  }
  return out
}

export function parseConfig(raw: string | null): SmartTitleConfig {
  const base: SmartTitleConfig = {
    enabled: true,
    model: "",
    prompt: DEFAULT_PROMPT,
    titleFormat: "{title}",
    updateThreshold: 1,
  }
  if (!raw) return base
  try {
    const parsed = JSON.parse(stripJsonComments(raw)) as Partial<SmartTitleConfig>
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : base.enabled,
      model: typeof parsed.model === "string" && parsed.model ? parsed.model : base.model,
      prompt: typeof parsed.prompt === "string" && parsed.prompt ? parsed.prompt : base.prompt,
      titleFormat:
        typeof parsed.titleFormat === "string" && parsed.titleFormat
          ? parsed.titleFormat
          : base.titleFormat,
      updateThreshold:
        typeof parsed.updateThreshold === "number" && parsed.updateThreshold >= 1
          ? Math.floor(parsed.updateThreshold)
          : base.updateThreshold,
    }
  } catch {
    // Malformed config must never break session startup — fall back to
    // defaults and surface the problem in the server log.
    console.warn(`${LOG_PREFIX} config parse failed (${CONFIG_FILE}); using defaults`)
    return base
  }
}

let cachedConfig: SmartTitleConfig | null = null
export function getConfig(): SmartTitleConfig {
  if (cachedConfig) return cachedConfig
  let raw: string | null = null
  try {
    raw = existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, "utf-8") : null
  } catch (err) {
    // File read errors (permissions, locks, EBUSY on Windows) must never
    // crash the plugin — fall back to defaults and log.
    console.warn(`${LOG_PREFIX} config read failed (${CONFIG_FILE}): ${(err as Error)?.message ?? err}; using defaults`)
    raw = null
  }
  cachedConfig = parseConfig(raw)
  return cachedConfig
}

// -- Model/endpoint resolution from opencode config (pure, unit-tested) --------

export interface Target {
  baseUrl: string
  apiKey: string
  model: string
}

/**
 * Resolve ordered generation candidates from the merged opencode config.
 *
 * Priority: `overrideModel` (smart-title.jsonc) → flash-tier agent model
 * (agent.explorer.model) → `sessionModel` (the model this session actually
 * runs on) → global default model. Each "providerID/modelKey" reference is
 * kept only if its provider exposes an OpenAI-compatible baseURL (our
 * llm-router does; built-in/subscription providers do not). The model "id"
 * field from the provider config (e.g. "cx/gpt-5.6-luna") is sent to the
 * router instead of the dictionary key (e.g. "gpt-5.6-luna"); without this
 * remapping the router cannot dispatch the request to the right backend.
 * The caller tries candidates in order; the deterministic last resort
 * (first user question as title) lives outside this function.
 */
export function resolveTargets(
  config: any,
  overrideModel: string,
  flashAgent: string = FLASH_TIER_AGENT,
  sessionModel: string = "",
): Target[] {
  const refs = [
    overrideModel,
    config?.agent?.[flashAgent]?.model,
    sessionModel,
    config?.model,
  ]
  const targets: Target[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    if (typeof ref !== "string" || !ref.includes("/")) continue
    const [providerID, ...rest] = ref.split("/")
    const modelKey = rest.join("/")
    if (!providerID || !modelKey) continue
    const key = `${providerID}/${modelKey}`
    if (seen.has(key)) continue
    seen.add(key)
    const provider = config?.provider?.[providerID]
    const options = provider?.options
    const baseUrl = typeof options?.baseURL === "string" ? options.baseURL : ""
    const apiKey = typeof options?.apiKey === "string" ? options.apiKey : ""
    // {env:...} placeholders are interpolated by opencode before the config
    // is served; a literal placeholder here means the variable is unset.
    if (!baseUrl || !apiKey || baseUrl.includes("{env:") || apiKey.includes("{env:")) continue
    // The model "id" field in the provider config is what the router backend
    // actually expects (e.g. "cx/gpt-5.6-luna" for codex-router).  If absent,
    // fall back to the model key (the dictionary entry name, e.g. "flash").
    const modelID =
      typeof provider?.models?.[modelKey]?.id === "string" && provider.models[modelKey].id
        ? provider.models[modelKey].id
        : modelKey
    targets.push({ baseUrl, apiKey, model: modelID })
  }
  return targets
}

// -- Endpoint & response parsing (pure, unit-tested) ----------------------------

/** Normalize a router baseURL to the chat-completions endpoint.
 *  Defensive: non-string input returns the default endpoint shape. */
export function resolveEndpoint(baseUrl: string): string {
  if (typeof baseUrl !== "string" || !baseUrl) return "/v1/chat/completions"
  let url = baseUrl.replace(/\/+$/, "")
  if (!/\/v\d+$/i.test(url)) url += "/v1"
  return url + "/chat/completions"
}

/**
 * Extract the assistant text from a chat-completions response body.
 * Handles both the plain JSON shape and SSE streams (some router backends
 * ignore stream:false and always stream). `truncated` reports a
 * finish_reason of "length"/"max_tokens" (budget hit) so callers can reject
 * a half-baked title instead of pinning it.
 */
const TRUNCATED_FINISH_REASONS = ["length", "max_tokens"]

export function parseCompletionBody(body: string): { text: string; truncated: boolean } {
  if (typeof body !== "string") return { text: "", truncated: false }
  const trimmed = body.trim()
  if (!trimmed.startsWith("data:")) {
    try {
      const j = JSON.parse(trimmed)
      const choice = j?.choices?.[0]
      const msg = choice?.message
      return {
        text: typeof msg?.content === "string" ? msg.content : "",
        truncated: TRUNCATED_FINISH_REASONS.includes(choice?.finish_reason),
      }
    } catch {
      return { text: "", truncated: false }
    }
  }
  // SSE: accumulate delta.content across chunks.
  let text = ""
  let truncated = false
  for (const line of trimmed.split("\n")) {
    const l = line.trim()
    if (!l.startsWith("data:")) continue
    const payload = l.slice(5).trim()
    if (payload === "[DONE]") break
    try {
      const j = JSON.parse(payload)
      const choice = j?.choices?.[0]
      const delta = choice?.delta?.content
      if (typeof delta === "string") text += delta
      if (TRUNCATED_FINISH_REASONS.includes(choice?.finish_reason)) truncated = true
    } catch {
      // Skip malformed chunk lines — keep whatever we have.
    }
  }
  return { text, truncated }
}

/** Clean an AI-generated title: drop think tags, wrappers, excess length.
 *  Defensive: non-string input returns "". */
export function cleanTitle(raw: string): string {
  if (typeof raw !== "string") return ""
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>\s*/gi, "")
  const lines = cleaned.split("\n").map((l) => l.trim())
  cleaned = lines.find((l) => l.length > 0) || ""
  cleaned = stripWrappers(cleaned)
  if (cleaned.length > 100) cleaned = cleaned.substring(0, 97) + "..."
  return cleaned
}

/** Remove matched wrapping markers (**x**, "x", `x`, heading/list markers).
 *  Defensive: non-string input returns "". */
export function stripWrappers(text: string): string {
  if (typeof text !== "string") return ""
  let result = text.trim().replace(/^\s*(?:#{1,6}|[-*+>])\s+/, "").trim()
  const pairs: Array<[string, string]> = [
    ["**", "**"],
    ["__", "__"],
    ["*", "*"],
    ["_", "_"],
    ["`", "`"],
    ['"', '"'],
    ["'", "'"],
  ]
  let changed = true
  while (changed) {
    changed = false
    for (const [open, close] of pairs) {
      if (result.length > open.length + close.length && result.startsWith(open) && result.endsWith(close)) {
        const inner = result.slice(open.length, result.length - close.length).trim()
        if (inner.length > 0) {
          result = inner
          changed = true
        }
      }
    }
  }
  return result
}

/** Apply titleFormat placeholders: {title}, {cwd}, {cwdTip}, {cwdTip:N}.
 *  Defensive: if `format` is not a string (e.g. undefined from a malformed
 *  config object), returns `title` unchanged so the session still gets a
 *  title instead of crashing the plugin. */
export function applyTitleFormat(format: string, title: string, cwd: string): string {
  if (typeof format !== "string" || !format) return title
  if (typeof title !== "string") title = String(title ?? "")
  if (typeof cwd !== "string") cwd = String(cwd ?? "")
  const segments = cwd.split(/[\\/]/).filter((s) => s.length > 0)
  let result = format
    .replace(/\{title\}/g, title)
    .replace(/\{cwd\}/g, cwd)
    .replace(/\{cwdTip(?::(\d+))?\}/g, (_m, n) => {
      const depth = n ? Math.max(1, parseInt(n, 10)) : 1
      return segments.slice(-depth).join("/")
    })
  if (result.length > 100) result = result.substring(0, 97) + "..."
  return result
}

// -- Conversation context -------------------------------------------------------

interface Turn {
  user: string
  assistantFirst?: string
  assistantLast?: string
}

/** Group raw session messages into compact turns (first+last assistant text).
 *  Defensive: non-array input returns []. */
export function buildTurns(messages: any[]): Turn[] {
  if (!Array.isArray(messages)) return []
  const turns: Turn[] = []
  let current: Turn | null = null
  let assistantTexts: string[] = []
  const flush = () => {
    if (current) {
      if (assistantTexts.length > 0) {
        current.assistantFirst = assistantTexts[0]
        current.assistantLast = assistantTexts[assistantTexts.length - 1]
      }
      turns.push(current)
    }
  }
  for (const msg of messages) {
    const role = msg?.info?.role
    if (role === "user") {
      flush()
      const text = extractText(msg.parts)
      current = { user: text }
      assistantTexts = []
    } else if (role === "assistant" && current) {
      const text = extractText(msg.parts)
      if (text) assistantTexts.push(text)
    }
  }
  flush()
  return turns.filter((t) => t.user.length > 0)
}

function extractText(parts: any[]): string {
  if (!Array.isArray(parts)) return ""
  return parts
    .filter(
      (p) =>
        p?.type === "text" &&
        !p.synthetic &&
        !p.ignored &&
        typeof p.text === "string",
    )
    .map((p) => p.text)
    .join("\n")
    .trim()
}

/** Format turns into a bounded context string for the title model.
 *  Defensive: non-array input returns "". */
export function formatContext(turns: Turn[]): string {
  if (!Array.isArray(turns)) return ""
  const lines: string[] = []
  for (const turn of turns) {
    const user = typeof turn?.user === "string" ? turn.user : String(turn?.user ?? "")
    lines.push(`User: ${user}`)
    if (turn.assistantFirst && turn.assistantFirst === turn.assistantLast) {
      lines.push(`Assistant: ${turn.assistantFirst}`)
    } else {
      if (turn.assistantFirst) lines.push(`Assistant (initial): ${turn.assistantFirst}`)
      if (turn.assistantLast) lines.push(`Assistant (final): ${turn.assistantLast}`)
    }
    lines.push("")
  }
  let context = lines.join("\n")
  if (context.length > CONTEXT_MAX_CHARS) context = context.slice(0, CONTEXT_MAX_CHARS) + "\n..."
  return context
}

// -- Title generation (HTTP) ------------------------------------------------------

export async function generateTitle(opts: {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  context: string
}): Promise<string> {
  // Validate opts: all fields must be strings (the caller resolves them
  // from the opencode config, but a missing/null field should not crash).
  if (!opts || typeof opts !== "object") {
    throw new Error("generateTitle: opts is not an object")
  }
  const baseUrl = typeof opts.baseUrl === "string" ? opts.baseUrl : ""
  const apiKey = typeof opts.apiKey === "string" ? opts.apiKey : ""
  const model = typeof opts.model === "string" ? opts.model : ""
  const prompt = typeof opts.prompt === "string" ? opts.prompt : DEFAULT_PROMPT
  const context = typeof opts.context === "string" ? opts.context : ""
  if (!baseUrl || !apiKey || !model) {
    throw new Error(`generateTitle: missing required field (baseUrl=${!!baseUrl}, apiKey=${!!apiKey}, model=${!!model})`)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(resolveEndpoint(baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        stream: false,
        temperature: 0.2,
        // Reasoning backends can burn the whole budget on thinking tokens;
        // ask for minimal reasoning (harmless where unsupported).
        reasoning_effort: "low",
        // Some router backends interpret this as a CHARACTER cap; keep it
        // generous — the title prompt already bounds output length.
        max_tokens: 512,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `<conversation>\n${context}\n</conversation>` },
        ],
      }),
      signal: controller.signal,
    })
    const body = await res.text()
    if (!res.ok) {
      throw new Error(`router HTTP ${res.status}: ${body.slice(0, 300)}`)
    }
    const parsed = parseCompletionBody(body)
    const title = cleanTitle(parsed.text)
    if (!title) throw new Error("empty title in router response")
    // max_tokens hit mid-generation — reject the broken title; the next
    // idle event retries.
    if (parsed.truncated) throw new Error(`title response truncated: ${JSON.stringify(title)}`)
    return title
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Last-resort title: the session's first real user question, collapsed to
 * one line and truncated at a boundary. Deterministic and free — used when
 * every LLM candidate failed, so a title ALWAYS appears.
 */
export function userQuestionTitle(turns: Turn[], maxLen: number = 60): string {
  const raw = turns?.[0]?.user ?? ""
  const text0 = typeof raw === "string" ? raw : String(raw ?? "")
  let text = text0.replace(/\s+/g, " ").trim()
  if (!text) return ""
  if (text.length > maxLen) {
    const cut = text.slice(0, maxLen + 1)
    const boundary = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("，"), cut.lastIndexOf("。"))
    text = (boundary > maxLen / 2 ? cut.slice(0, boundary) : text.slice(0, maxLen)).trim() + "…"
  }
  return text
}

/** Pull "providerID/modelID" from the latest assistant message, if any. */
export function sessionModelRef(messages: any[]): string {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
    const info = messages[i]?.info
    if (info?.role === "assistant" && info?.providerID && info?.modelID) {
      return `${info.providerID}/${info.modelID}`
    }
  }
  return ""
}

// -- Candidate-loop generation (injectable fetcher for tests) -------------------

/**
 * Try candidates in priority order; the first success wins. A truncated or
 * empty title rejects that candidate so the chain continues. Returns null
 * when every candidate fails — the caller then leaves the session title
 * untouched so opencode's built-in titling still applies.
 */
export async function generateWithFallback(
  targets: Target[],
  opts: { prompt: string; context: string },
  fetcher: (t: Target) => Promise<string> = (t) =>
    generateTitle({ ...t, prompt: opts.prompt, context: opts.context }),
): Promise<string | null> {
  if (!Array.isArray(targets) || targets.length === 0) return null
  for (const target of targets) {
    try {
      const title = await fetcher(target)
      if (title) return title
      console.warn(`${LOG_PREFIX} candidate ${target.model} returned an empty title — trying next`)
    } catch (err) {
      console.warn(`${LOG_PREFIX} candidate ${target.model} failed: ${(err as Error)?.message ?? err}`)
    }
  }
  return null
}

// -- Plugin -------------------------------------------------------------------

export const SmartTitlePlugin: Plugin = async (input) => {
  const client = input?.client
  // Defensive: older opencode runtimes do not pass `directory` (the plugin
  // then failed to load with "cwd.split" on undefined, silently disabling
  // the plugin — exactly what this rewrite was supposed to prevent).
  let cwd = ""
  try {
    cwd = input?.directory || process.cwd()
  } catch {
    cwd = ""
  }
  // Registration heartbeat: grep the opencode server log for this line to
  // confirm the plugin actually loaded (load failures are otherwise only
  // visible as "failed to load plugin" errors).
  console.info(`${LOG_PREFIX} registered (cwd: ${cwd || "unknown"})`)

  // If the opencode runtime does not pass a client, the plugin cannot do
  // anything useful — bail early instead of crashing on every idle event.
  // The plugin still loads (so opencode doesn't show a load error), but
  // every idle event becomes a no-op.
  if (!client || typeof client.session?.messages !== "function") {
    console.warn(`${LOG_PREFIX} no opencode client available — plugin disabled (idle events will be no-ops)`)
    return {}
  }

  // Subagent sessions (task-dispatched, carry parentID) never get titles.
  const subagentSessions = new Set<string>()
  // Per-session idle counter (updateThreshold) — gates how many idle events
  // pass before we attempt title generation.
  const idleCount = new Map<string, number>()
  // Sessions that already have a smart-title — we generate ONCE per session
  // (mainstream behavior: VS Code Copilot, ChatGPT, Claude Code all do this).
  // If LLM fails, the session is NOT marked, so the next idle retries.
  // This replaces the old lastTitledCount approach which regenerated on
  // every new message (overwriting a good title with a worse one on failure).
  const titledSessions = new Set<string>()
  // In-flight session IDs — prevents concurrent handleIdle calls for the
  // same session from racing (two idle events can fire before the first
  // LLM call resolves).  The second call sees the session is busy and
  // returns immediately; the first call completes and (if it produced a
  // title) marks the session so future calls skip it.
  const inflightSessions = new Set<string>()
  let warnedNoTarget = false
  // Cached opencode config snapshot — provider/model definitions rarely
  // change mid-session, so we fetch once and reuse.  Set to null on failure
  // so the next idle event retries.
  let cachedConfigSnapshot: any = null

  const handleIdle = async (sessionID: string) => {
    // The entire function is wrapped in try/catch so no exception — whether
    // from getConfig, client calls, or the title pipeline — can escape as an
    // unhandledRejection and crash the opencode server process.
    try {
      let config: SmartTitleConfig
      try {
        config = getConfig()
      } catch (err) {
        // getConfig should never throw after its own try/catch, but if it
        // does (e.g. parseConfig throws on truly bizarre input), we still
        // must not crash — use hardcoded defaults.
        console.warn(`${LOG_PREFIX} getConfig threw unexpectedly: ${(err as Error)?.message ?? err}; using hardcoded defaults`)
        config = {
          enabled: true,
          model: "",
          prompt: DEFAULT_PROMPT,
          titleFormat: "{title}",
          updateThreshold: 1,
        }
      }
      if (!config.enabled) return
      if (subagentSessions.has(sessionID)) return
      // Concurrency guard: if a previous handleIdle for this session is
      // still in flight (waiting on the LLM), skip — the first call will
      // either set a title or fail, and the next idle event will retry.
      if (inflightSessions.has(sessionID)) return
      inflightSessions.add(sessionID)

      const count = (idleCount.get(sessionID) ?? 0) + 1
      // Memory cap: if the Map has grown beyond the safety limit (sessions
      // were never deleted via session.deleted events), clear it and start
      // fresh — the counters are just for the updateThreshold gate, losing
      // old counts is harmless.
      if (idleCount.size > MAX_TRACKED_SESSIONS) idleCount.clear()
      idleCount.set(sessionID, count)
      if (count % config.updateThreshold !== 0) return

      // Already titled this session?  Generate once, then leave it alone —
      // mainstream behavior (VS Code Copilot, ChatGPT, Claude Code).
      if (titledSessions.has(sessionID)) return

      const res = await client.session.messages({ path: { id: sessionID } })
      const messages: any[] = (res as any)?.data ?? []
      if (messages.length === 0) return

      const turns = buildTurns(messages)
      if (turns.length === 0) return

      // Candidate chain (override → flash tier → session model → global
      // model) from the live opencode config (no env vars). The session's
      // own model comes from its latest assistant message.
      let targets: Target[] = []
      try {
        if (!cachedConfigSnapshot) {
          const cfgRes: any = await client.config.get()
          cachedConfigSnapshot = cfgRes?.data
        }
        targets = resolveTargets(cachedConfigSnapshot, config.model, FLASH_TIER_AGENT, sessionModelRef(messages))
      } catch (err) {
        cachedConfigSnapshot = null  // retry next idle
        console.warn(`${LOG_PREFIX} config.get failed: ${(err as Error)?.message ?? err}`)
      }

      let title = ""
      if (targets.length > 0) {
        // Candidates in priority order; the first success wins.
        title = (await generateWithFallback(targets, {
          prompt: config.prompt,
          context: formatContext(turns),
        })) ?? ""
      } else if (!warnedNoTarget) {
        // Log once per process — the reason must be visible (the npm
        // plugin's silent failure was the whole point of this rewrite).
        warnedNoTarget = true
        console.warn(
          `${LOG_PREFIX} no usable candidate: override/flash-tier/session/global model must reference a provider with options.baseURL/apiKey (e.g. llm-router)`,
        )
      }

      // Last resort: the first user question as the title — deterministic,
      // free, and guarantees a title even when every model call fails.
      // Fallback does NOT mark the session as titled — the next idle event
      // will retry the LLM and potentially upgrade to a high-quality title.
      // Only an LLM success (title !== fallback source) marks the session.
      let usedFallback = false
      if (!title) {
        title = userQuestionTitle(turns)
        if (title) {
          usedFallback = true
          console.warn(`${LOG_PREFIX} all ${targets.length} candidate(s) failed — using first user question as title (will retry LLM next idle)`)
        } else {
          // No usable user text at all (e.g. the only "user" messages were
          // plugin announce injections that we filtered out).  opencode may
          // have set the session title to one of those announce texts —
          // overwrite it with a neutral placeholder so the user doesn't see
          // "[adr-guard] ON — ..." as the session title in the sidebar.
          let currentTitle = ""
          try {
            const sessRes: any = await client.session.get({ path: { id: sessionID } })
            currentTitle = (sessRes as any)?.data?.title ?? ""
          } catch {
            // can't check — leave it alone
          }
          if (currentTitle) {
            try {
              await client.session.update({ path: { id: sessionID }, body: { title: "New Session" } })
            } catch {
              // best-effort — don't crash
            }
          }
          console.warn(`${LOG_PREFIX} all ${targets.length} candidate(s) failed and no user question available — built-in titling applies`)
          return
        }
      }
      // Defensive: ensure titleFormat is a string before passing it to
      // applyTitleFormat.  getConfig()/parseConfig() guarantee this, but
      // a runtime edge case (e.g. hot-reload clearing the module cache,
      // or an object prototype pollution) could theoretically produce a
      // non-string value.  This guard prevents a TypeError that would be
      // logged as a plugin load failure in the opencode server log.
      const fmt = typeof config?.titleFormat === "string" && config.titleFormat
        ? config.titleFormat
        : "{title}"
      const finalTitle = applyTitleFormat(fmt, title, cwd)
      // Guard against writing an empty title — would blank the sidebar.
      // If applyTitleFormat somehow produced empty (e.g. format="{title}"
      // and title=""), fall back to the raw title or a neutral placeholder.
      const safeTitle = finalTitle || title || "New Session"

      await client.session.update({ path: { id: sessionID }, body: { title: safeTitle } })
      // Only mark as titled when the LLM produced the title — fallback
      // titles are temporary and will be upgraded on a future idle event.
      if (!usedFallback) titledSessions.add(sessionID)
    } catch (err) {
      // Never silent: surface failures in the opencode server log. This is
      // the outermost catch — nothing should ever escape to become an
      // unhandledRejection.
      console.warn(`${LOG_PREFIX} title update failed for ${sessionID}: ${(err as Error)?.message ?? err}`)
    } finally {
      // Always clear the in-flight flag — even on error — so the next
      // idle event can retry.
      inflightSessions.delete(sessionID)
    }
  }

  return {
    event: async (input: { event: any }) => {
      try {
        const event = input?.event
        if (!event) return
        const type = event?.type as string | undefined
        const info = event?.properties?.info

        if (type === "session.created" && info?.id && info?.parentID) {
          subagentSessions.add(info.id)
          return
        }
        if (type === "session.deleted" && info?.id) {
          subagentSessions.delete(info.id)
          idleCount.delete(info.id)
          titledSessions.delete(info.id)
          return
        }

        // session.status(idle) is what current opencode emits; session.idle is
        // accepted too so a future event-shape change cannot silently disable
        // the plugin again.
        const statusIdle =
          type === "session.status" && event?.properties?.status?.type === "idle"
        const legacyIdle = type === "session.idle"
        if (!statusIdle && !legacyIdle) return

        const sessionID = event?.properties?.sessionID
        if (typeof sessionID !== "string" || !sessionID) return
        // Fire-and-forget: never block the event loop on title generation.
        // The .catch() is a belt-and-suspenders safety net: handleIdle has
        // its own outermost try/catch, but if a bug ever lets an exception
        // slip through, this prevents an unhandledRejection from crashing
        // the opencode server process.
        handleIdle(sessionID).catch((err) =>
          console.warn(`${LOG_PREFIX} unexpected unhandled error in handleIdle: ${(err as Error)?.message ?? err}`),
        )
      } catch (err) {
        // Even the event handler itself must not throw — opencode may kill
        // plugins that throw synchronously from event callbacks.
        console.warn(`${LOG_PREFIX} event handler error: ${(err as Error)?.message ?? err}`)
      }
    },
  }
}

// Default export as well: some opencode runtimes require it ("must default
// export a plugin"), named export kept for tests and barrel imports.
export default SmartTitlePlugin
