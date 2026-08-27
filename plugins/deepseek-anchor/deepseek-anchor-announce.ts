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
 * Toast-only strategy:
 *   tui.showToast is the sole surface — non-intrusive, no chat-transcript
 *   pollution, and degrades to a log line in headless/older-server
 *   environments. Never fatal.
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
 * Show the message as a toast notification — non-intrusive, no
 * chat-transcript pollution. Degrades to a log line if the TUI is
 * unavailable. Never fatal.
 */
export async function announceToUI(
  client: Client,
  message: string,
  _sessionID?: string,
): Promise<void> {
  await showToast(client, message)
}

// NOTE: The announce hook used to fire on session.created, but at that point
// the model is not yet known — it would announce even for non-DeepSeek models.
// The announce is now triggered from system.transform in index.ts when a
// target model is first detected for a session.
//
// This file exports the announce helpers; the caller (index.ts) manages
// per-session deduplication.
