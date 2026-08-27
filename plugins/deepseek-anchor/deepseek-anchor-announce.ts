/**
 * Announce helpers for the deepseek-anchor plugin.
 *
 * The mode is persisted in ~/.config/opencode/.deepseek-anchor-enabled and silently
 * survives across sessions; without a visible signal the user can forget
 * the anchor is enabled — this helps users understand why DeepSeek models
 * are behaving differently (forced reasoning before tool use).
 *
 * Surface:
 *   - system.transform (first target-model detection) → top-level sessions
 *     only, mode=off stays silent, mode=on shows a brief notice.
 *   - Unlike auto-advisor/adr-guard, the announce is NOT triggered by
 *     session.created because at that point we don't know the model yet.
 *     Triggering on session.created would announce even for non-DeepSeek
 *     models, which is confusing noise.
 *
 * Two-layer strategy (same as auto-advisor):
 *   1. session.prompt({ ignored: true, noReply: true }) — injects the message
 *      into the chat transcript, visible in the main UI, but OpenCode natively
 *      skips `ignored` parts so the LLM never sees them (no context pollution).
 *   2. Fallback: tui.showToast — for environments where session.prompt fails
 *      (headless run, older server). Degrades to a log line. Never fatal.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { isEnabled } from "./deepseek-anchor-config"

type Client = PluginInput["client"]

/** Minimal shape we rely on; the SDK's Event union is broader. */
type SessionCreatedEvent = {
  type: string
  properties?: { info?: { parentID?: string; id?: string } }
}

/** One user-visible line for enabled mode. */
export function enabledMessage(): string {
  return (
    `[deepseek-anchor] Mode: ON — DeepSeek models MUST restate goals, list constraints, ` +
    `and state approach before using tools. First turn tool calls are blocked.`
  )
}

/**
 * Best-effort toast. Toast failure (headless run, older server without
 * /tui/show-toast) degrades to the log line — announcing must never break a
 * session start.
 */
async function showToast(client: Client, message: string): Promise<void> {
  try {
    await client.tui.showToast({
      body: { message, variant: "info" },
    })
  } catch {
    // Headless or no TUI — just log, don't break the session
    console.log(`[deepseek-anchor] announce: ${message} (no TUI — log only)`)
  }
}

/**
 * Inject the message into the chat transcript via session.prompt with
 * ignored: true + noReply: true — visible in the main UI, no LLM call,
 * no context pollution (OpenCode natively skips ignored parts).
 *
 * Falls back to toast if session.prompt is unavailable or fails.
 */
export async function announceToUI(
  client: Client,
  message: string,
  sessionID?: string,
): Promise<void> {
  if (sessionID) {
    try {
      await client.session.prompt({
        path: { id: sessionID },
        body: {
          parts: [{ type: "text", text: message, ignored: true }],
          noReply: true,
        },
        throwOnError: true,
      })
      return
    } catch {
      // session.prompt failed — fall through to toast
    }
  }
  await showToast(client, message)
}

// NOTE: The announce hook used to fire on session.created, but at that point
// the model is not yet known — it would announce even for non-DeepSeek models.
// The announce is now triggered from system.transform in index.ts when a
// target model is first detected for a session.
//
// This file exports the announce helpers; the caller (index.ts) manages
// per-session deduplication.
