/**
 * Context Compress — deterministic input-side compression for long sessions,
 * powered by the vendored context-compression-engine (see ./vendor/VENDOR.md,
 * AGPL-3.0-only, author Lisa Welsch; OCP conveys under AGPL-3.0).
 *
 * Why: every step ships the full message history to the LLM. Tool outputs and
 * assistant prose from dozens of turns ago keep costing input tokens — full
 * price on non-caching providers — long after their details stopped mattering.
 * This plugin compresses that stale tail with a deterministic, zero-API engine:
 * code, JSON, and file paths stay verbatim; filler prose is scored and packed.
 *
 * Design — prompt-cache stability first:
 *   - Watermark: the last RECENCY_WINDOW messages always stay verbatim.
 *   - Monotonic: a message is compressed ONCE, when it first crosses the
 *     watermark. The compressed replacement is cached by message ID and
 *     re-applied byte-identically on every later step, so earlier bytes never
 *     change again — each crossing costs one tail re-read, not a full-context
 *     cache bust. (A naive sliding re-compression would bust the provider
 *     prefix cache on every single step.)
 *
 * Never touched:
 *   - user messages — requirements and decisions are prose where semantics
 *     matter more than tokens
 *   - assistant text parts — smoke-bench on v1.0.0 showed prose compression
 *     at 9.75x that also dropped the one information-bearing sentence;
 *     assistant reasoning/conclusions are too costly to lose for the tokens
 *     saved (tool outputs are the token heavyweight anyway)
 *   - thinking/reasoning parts — Anthropic signatures must stay intact
 *   - tool-call structure — callID pairing survives; only state.output text
 *     of completed tool parts is rewritten, and CCE's structure-aware tiers
 *     keep code/JSON/paths inside those outputs verbatim (measured 1.00x on
 *     pure code, 1.30x on log-plus-code — the safe middle we want)
 *   - content below MIN_COMPRESS_CHARS — byte churn outweighs the savings
 *
 * Verbatim originals are NOT persisted: opencode's session storage stays the
 * source of truth — this transform is a request-time view, so a lost cache
 * entry merely re-compresses deterministically.
 *
 * Kill switch: OCP_CONTEXT_COMPRESS=0 (checked per call). Fail-open: any
 * error leaves the message array untouched.
 *
 * Subagent sessions are skipped — ephemeral isolated contexts (session.created
 * parentID tracking via the event hook, same pattern as deepseek-anchor).
 */

import type { Plugin } from "@opencode-ai/plugin"
import { compress } from "./vendor/dist/index.js"

/** Recency window: the last N messages always stay verbatim. */
export const RECENCY_WINDOW = 12

/** Below this size, rewriting a text part costs more churn than it saves. */
export const MIN_COMPRESS_CHARS = 1200

/**
 * Compress one stale tool output with the vendored engine. Returns null when
 * compression yields no benefit (or the engine fails) — callers then keep the
 * original bytes, which is also what gets cached (no retry churn).
 */
export function compressStaleToolOutput(content: string): string | null {
  if (content.length < MIN_COMPRESS_CHARS) return null
  try {
    const result = compress(
      [{ id: "stale", index: 0, role: "tool", content }],
      { preserve: [], recencyWindow: 0, dedup: false },
    )
    const out = result.messages[0]?.content
    if (typeof out !== "string" || out.length >= content.length) return null
    return out
  } catch {
    return null
  }
}

type Replacement = { partIdx: number; text: string }

// Per-session replacement cache: messageID → frozen replacements. Frozen =
// never recomputed — this is what keeps the request prefix byte-stable.
const replacementsBySession = new Map<string, Map<string, Replacement[]>>()
// Sessions whose session.created carried a parentID — subagents, skipped.
const subagentSessions = new Set<string>()

/** Apply frozen replacements by part index. Parts of persisted messages are
 * immutable, so index stability holds; a shape mismatch (opencode schema
 * change) skips that part rather than corrupting it. */
function applyReplacements(parts: unknown[], reps: Replacement[]): void {
  for (const r of reps) {
    const part = parts[r.partIdx] as { type?: string; state?: { output?: string } } | undefined
    if (part?.type !== "tool" || !part.state) continue
    part.state.output = r.text
  }
}

/** First crossing of the watermark: compute this message's frozen replacements.
 * Only tool outputs — see the header note for why prose stays verbatim. */
function buildReplacements(role: string | undefined, parts: unknown[]): Replacement[] {
  const fresh: Replacement[] = []
  if (role === "user") return fresh // never touch user content
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p] as { type?: string; state?: { output?: unknown } }
    if (part?.type !== "tool" || typeof part.state?.output !== "string") continue
    const out = compressStaleToolOutput(part.state.output)
    if (out) fresh.push({ partIdx: p, text: out })
  }
  return fresh
}

export const ContextCompressPlugin: Plugin = async () => ({
  // Learn subagent sessions from session.created events (the transform input
  // carries no parent info) and drop per-session state on session.deleted so
  // the maps stay bounded — same pattern as deepseek-anchor.
  event: async (input: { event: unknown }) => {
    try {
      const event = input.event as {
        type?: string
        properties?: { info?: { id?: string; parentID?: string } }
      }
      const info = event?.properties?.info
      if (!info?.id) return
      if (event?.type === "session.created" && info.parentID) {
        subagentSessions.add(info.id)
      } else if (event?.type === "session.deleted") {
        subagentSessions.delete(info.id)
        replacementsBySession.delete(info.id)
      }
    } catch {
      // Best-effort: without the event feed the transform still runs.
    }
  },

  "experimental.chat.messages.transform": async (
    input: { sessionID?: string } | undefined,
    output: {
      messages: {
        info: { id?: string; role?: string; sessionID?: string }
        parts: unknown[]
      }[]
    },
  ) => {
    try {
      if (process.env.OCP_CONTEXT_COMPRESS === "0") return
      const msgs = output.messages
      if (!Array.isArray(msgs) || msgs.length <= RECENCY_WINDOW) return

      // Prefer the hook input's sessionID; fall back to the first message's
      // info — some opencode builds pass no input here, but message info
      // always carries the session.
      const sessionID =
        input?.sessionID ??
        msgs.find((m) => typeof m?.info?.sessionID === "string")?.info.sessionID
      if (!sessionID || subagentSessions.has(sessionID)) return

      let cache = replacementsBySession.get(sessionID)
      if (!cache) {
        cache = new Map()
        replacementsBySession.set(sessionID, cache)
      }

      const staleEnd = msgs.length - RECENCY_WINDOW
      for (let i = 0; i < staleEnd; i++) {
        const m = msgs[i]
        const id = m.info?.id
        if (!id || !Array.isArray(m.parts)) continue

        const cached = cache.get(id)
        if (cached) {
          applyReplacements(m.parts, cached)
          continue
        }
        // First crossing: compute once, then freeze for every later step.
        const fresh = buildReplacements(m.info?.role, m.parts)
        cache.set(id, fresh)
        applyReplacements(m.parts, fresh)
      }
    } catch {
      // Never crash the session — degrade to no compression.
    }
  },
})
