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
 * Toast-only strategy:
 *   tui.showToast is the sole surface — non-intrusive, no chat-transcript
 *   pollution, and degrades to a log line in headless/older-server
 *   environments. Never fatal.
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
 * Show the message as a toast notification — non-intrusive, no
 * chat-transcript pollution. Degrades to a log line if the TUI is
 * unavailable. Never fatal.
 */
export async function announce(
  client: Client,
  message: string,
  variant: "warning" | "info" = "info",
  _sessionID?: string,
): Promise<void> {
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
