/**
 * Hook: event — announce the ADR iron-law state to the user.
 *
 * The switch is persisted as the `adrGuard` field of the project's
 * opencode.jsonc and silently survives across sessions; without a visible
 * signal the user
 * can forget the iron law is on — and commits may get blocked unexpectedly.
 *
 * Two surfaces, one message builder:
 *   - session.created → top-level sessions only (subagent sessions carry
 *     parentID), state=off stays silent, on gets a warning variant that
 *     names the ADR directory.
 *   - /adr-guard <state|status> → the command hook reuses the announce
 *     helpers for switch confirmation and status reports.
 *
 * Two-layer strategy (same as auto-advisor):
 *   1. session.prompt({ ignored: true, noReply: true }) — injects the message
 *      into the chat transcript, visible in the main UI, but OpenCode natively
 *      skips `ignored` parts so the LLM never sees them (no context pollution).
 *   2. Fallback: tui.showToast — for environments where session.prompt fails
 *      (headless run, older server). Degrades to a log line. Never fatal.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getAdrDir, getState, type GuardState } from "./adr-guard-config"
import { makeLogger, safeHook } from "./adr-guard-runtime"

type Client = PluginInput["client"]

/** Minimal shape we rely on; the SDK's Event union is broader. */
type SessionCreatedEvent = {
  type: string
  properties?: { info?: { parentID?: string; id?: string } }
}

/** One user-visible line per state. ON MUST name the enforcement surface. */
export function announceMessage(state: GuardState): string {
  if (state === "on") {
    return (
      `[adr-guard] ON — every feat/refactor commit requires a new/updated ADR ` +
      `(${getAdrDir()}/). /adr-guard off to disable.`
    )
  }
  return (
    "[adr-guard] OFF — no ADR enforcement. /adr-guard on to enable the iron law for this project."
  )
}

/** Read-only status report for `/adr-guard` without a state argument. */
export function statusMessage(): string {
  const state = getState()
  const adrDir = getAdrDir()
  return (
    `[adr-guard] Status: ${state.toUpperCase()} | ADR dir: ${adrDir}/ | ` +
    `switch: /adr-guard on|off (project-level, stored in opencode.jsonc)`
  )
}

/**
 * Best-effort toast + log. Toast failure (headless run, older server without
 * /tui/show-toast) degrades to the log line — announcing must never break a
 * session start or a switch.
 */
async function showToast(client: Client, message: string, variant: "warning" | "info"): Promise<void> {
  const log = makeLogger(client, "adr-guard")
  try {
    await client.tui.showToast({ body: { message, variant } })
    await log("info", `announce: toast shown — ${message}`)
  } catch {
    await log("info", `announce (no TUI — log only): ${message}`)
  }
}

/**
 * Inject the message into the chat transcript via session.prompt with
 * ignored: true + noReply: true — visible in the main UI, no LLM call,
 * no context pollution (OpenCode natively skips ignored parts).
 *
 * Falls back to toast if session.prompt is unavailable or fails.
 */
export async function announce(
  client: Client,
  message: string,
  variant: "warning" | "info" = "info",
  sessionID?: string,
): Promise<void> {
  const log = makeLogger(client, "adr-guard")
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
      await log("info", `announce: chat reply — ${message}`)
      return
    } catch (err) {
      await log("warn", `announce: session.prompt failed (${String(err)}) — falling back to toast`)
    }
  }
  await showToast(client, message, variant)
}

export function makeAnnounceHook(client: Client) {
  const log = makeLogger(client, "adr-guard")

  return safeHook(
    async ({ event }: { event: SessionCreatedEvent }) => {
      if (event.type !== "session.created") return
      // Subagent sessions (task-dispatched) carry parentID — only announce on
      // the top-level session the user actually opened.
      if (event.properties?.info?.parentID) return
      const state = getState()
      if (state === "off") return
      const sessionID = event.properties?.info?.id
      await announce(client, announceMessage(state), "warning", sessionID)
    },
    log,
  )
}

/** Immediate user-visible confirmation for `/adr-guard on|off` switches. */
export async function announceSwitch(
  client: Client,
  state: GuardState,
  sessionID?: string,
): Promise<void> {
  await announce(client, announceMessage(state), state === "on" ? "warning" : "info", sessionID)
}

/** Immediate user-visible status report for bare `/adr-guard`. */
export async function announceStatus(client: Client, sessionID?: string): Promise<void> {
  await announce(client, statusMessage(), "info", sessionID)
}
