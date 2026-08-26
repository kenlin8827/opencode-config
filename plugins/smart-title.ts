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

// -- Plugin config (smart-title.jsonc) ------------------------------------------

export interface SmartTitleConfig {
  enabled: boolean
  /** "providerID/modelID" override; empty = use the flash-tier agent model. */
  model: string
  prompt: string
  titleFormat: string
  updateThreshold: number
}

/** Strip // and /* ... *\/ comments outside string literals (JSONC subset). */
export function stripJsonComments(text: string): string {
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
  const raw = existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, "utf-8") : null
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
 * runs on) → global default model. Each "providerID/modelID" reference is
 * kept only if its provider exposes an OpenAI-compatible baseURL (our
 * llm-router does; built-in/subscription providers do not). The caller
 * tries them in order; the deterministic last resort (first user question
 * as title) lives outside this function.
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
    const modelID = rest.join("/")
    if (!providerID || !modelID) continue
    const key = `${providerID}/${modelID}`
    if (seen.has(key)) continue
    seen.add(key)
    const options = config?.provider?.[providerID]?.options
    const baseUrl = typeof options?.baseURL === "string" ? options.baseURL : ""
    const apiKey = typeof options?.apiKey === "string" ? options.apiKey : ""
    // {env:...} placeholders are interpolated by opencode before the config
    // is served; a literal placeholder here means the variable is unset.
    if (!baseUrl || !apiKey || baseUrl.includes("{env:") || apiKey.includes("{env:")) continue
    targets.push({ baseUrl, apiKey, model: modelID })
  }
  return targets
}

// -- Endpoint & response parsing (pure, unit-tested) ----------------------------

/** Normalize a router baseURL to the chat-completions endpoint. */
export function resolveEndpoint(baseUrl: string): string {
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

/** Clean an AI-generated title: drop think tags, wrappers, excess length. */
export function cleanTitle(raw: string): string {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>\s*/gi, "")
  const lines = cleaned.split("\n").map((l) => l.trim())
  cleaned = lines.find((l) => l.length > 0) || ""
  cleaned = stripWrappers(cleaned)
  if (cleaned.length > 100) cleaned = cleaned.substring(0, 97) + "..."
  return cleaned
}

/** Remove matched wrapping markers (**x**, "x", `x`, heading/list markers). */
export function stripWrappers(text: string): string {
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

/** Apply titleFormat placeholders: {title}, {cwd}, {cwdTip}, {cwdTip:N}. */
export function applyTitleFormat(format: string, title: string, cwd: string): string {
  const segments = (cwd || "").split(/[\\/]/).filter((s) => s.length > 0)
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

/** Group raw session messages into compact turns (first+last assistant text). */
export function buildTurns(messages: any[]): Turn[] {
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
  for (const msg of messages ?? []) {
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
    .filter((p) => p?.type === "text" && !p.synthetic && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim()
}

/** Format turns into a bounded context string for the title model. */
export function formatContext(turns: Turn[]): string {
  const lines: string[] = []
  for (const turn of turns) {
    lines.push(`User: ${turn.user}`)
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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(resolveEndpoint(opts.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        stream: false,
        temperature: 0.2,
        // Reasoning backends can burn the whole budget on thinking tokens;
        // ask for minimal reasoning (harmless where unsupported).
        reasoning_effort: "low",
        // Some router backends interpret this as a CHARACTER cap; keep it
        // generous — the title prompt already bounds output length.
        max_tokens: 512,
        messages: [
          { role: "system", content: opts.prompt },
          { role: "user", content: `<conversation>\n${opts.context}\n</conversation>` },
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
  let text = raw.replace(/\s+/g, " ").trim()
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

  // Subagent sessions (task-dispatched, carry parentID) never get titles.
  const subagentSessions = new Set<string>()
  // Per-session idle counter (updateThreshold) and last-titled message count
  // (skip regeneration when nothing new happened since the last title).
  const idleCount = new Map<string, number>()
  const lastTitledCount = new Map<string, number>()
  let warnedNoTarget = false

  const handleIdle = async (sessionID: string) => {
    const config = getConfig()
    if (!config.enabled) return
    if (subagentSessions.has(sessionID)) return

    const count = (idleCount.get(sessionID) ?? 0) + 1
    idleCount.set(sessionID, count)
    if (count % config.updateThreshold !== 0) return

    try {
      const res = await client.session.messages({ path: { id: sessionID } })
      const messages: any[] = (res as any)?.data ?? []
      if (messages.length === 0) return
      if (lastTitledCount.get(sessionID) === messages.length) return

      const turns = buildTurns(messages)
      if (turns.length === 0) return

      // Candidate chain (override → flash tier → session model → global
      // model) from the live opencode config (no env vars). The session's
      // own model comes from its latest assistant message.
      let targets: Target[] = []
      try {
        const cfgRes: any = await client.config.get()
        targets = resolveTargets(cfgRes?.data, config.model, FLASH_TIER_AGENT, sessionModelRef(messages))
      } catch (err) {
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
      if (!title) {
        title = userQuestionTitle(turns)
        if (title) {
          console.warn(`${LOG_PREFIX} all ${targets.length} candidate(s) failed — using first user question as title`)
        } else {
          // Nothing usable at all: step back, opencode built-in titling applies.
          throw new Error(`all ${targets.length} candidate(s) failed and no user question available — built-in titling applies`)
        }
      }
      const finalTitle = applyTitleFormat(config.titleFormat, title, cwd)

      await client.session.update({ path: { id: sessionID }, body: { title: finalTitle } })
      lastTitledCount.set(sessionID, messages.length)
    } catch (err) {
      // Never silent: surface failures in the opencode server log.
      console.warn(`${LOG_PREFIX} title update failed for ${sessionID}: ${(err as Error)?.message ?? err}`)
    }
  }

  return {
    event: async (input: { event: any }) => {
      const event = input.event
      const type = event?.type as string | undefined
      const info = event?.properties?.info

      if (type === "session.created" && info?.id && info?.parentID) {
        subagentSessions.add(info.id)
        return
      }
      if (type === "session.deleted" && info?.id) {
        subagentSessions.delete(info.id)
        idleCount.delete(info.id)
        lastTitledCount.delete(info.id)
        return
      }

      // session.status(idle) is what current opencode emits; session.idle is
      // accepted too so a future event-shape change cannot silently disable
      // the plugin again.
      const statusIdle =
        type === "session.status" && event?.properties?.status?.type === "idle"
      const legacyIdle = type === "session.idle"
      if (!statusIdle && !legacyIdle) return

      const sessionID = event?.properties?.sessionID as string | undefined
      if (!sessionID) return
      // Fire-and-forget: never block the event loop on title generation.
      void handleIdle(sessionID)
    },
  }
}

// Default export as well: some opencode runtimes require it ("must default
// export a plugin"), named export kept for tests and barrel imports.
export default SmartTitlePlugin
