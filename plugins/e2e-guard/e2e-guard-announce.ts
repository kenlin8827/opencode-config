/**
 * Hook: event — announce the e2e-guard state to the user.
 *
 * The switch persists as the `e2eGuard` field of the project's
 * opencode.jsonc and silently survives across sessions; without a visible
 * signal the user can forget the gate is on — and E2E runs may get blocked
 * unexpectedly. Also keeps the in-memory approval store tidy: approvals die
 * with their session (session.deleted).
 *
 * Two surfaces, one message builder:
 *   - session.created → top-level sessions only (subagent sessions carry
 *     parentID), state=off stays silent, on gets a warning variant.
 *   - /e2e-guard <state|allow|status> → the command hook reuses the
 *     announce helpers for switch confirmation, approval confirmation and
 *     status reports.
 *
 * Toast-only strategy:
 *   tui.showToast is the sole surface — non-intrusive, no chat-transcript
 *   pollution, and degrades to a log line in headless/older-server
 *   environments. Never fatal.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getState, type GuardState } from "./e2e-guard-config"
import { revokeApproval } from "./e2e-guard-runtime"
import { makeLogger, safeHook } from "../adr-guard/adr-guard-runtime"

type Client = PluginInput["client"]

/** Minimal shape we rely on; the SDK's Event union is broader. */
type SessionEvent = {
  type: string
  properties?: { info?: { parentID?: string; id?: string } }
}

/** One user-visible line per state. ON MUST name the enforcement surface. */
export function announceMessage(state: GuardState): string {
  if (state === "on") {
    return (
      `[e2e-guard] ON — E2E runs are blocked until the user confirms and ` +
      `/e2e-guard allow grants a one-shot pass. /e2e-guard off to disable.`
    )
  }
  return (
    "[e2e-guard] OFF — no E2E gating. /e2e-guard on to require user confirmation before E2E runs in this project."
  )
}

/** Read-only status report for `/e2e-guard` without a state argument. */
export function statusMessage(): string {
  const state = getState()
  return (
    `[e2e-guard] Status: ${state.toUpperCase()} | ` +
    `switch: /e2e-guard on|off (project-level, stored in opencode.jsonc) | ` +
    `allow: /e2e-guard allow (one full-suite pass) | ` +
    `allow targeted: unlock affected-spec re-runs only, full suites stay gated`
  )
}

/** Confirmation for `/e2e-guard allow [targeted]` — names the grant scope. */
export function allowMessage(scope: "full" | "targeted" = "full"): string {
  if (scope === "targeted") {
    return (
      "[e2e-guard] Approved (TARGETED only) — targeted spec re-runs now pass " +
      "for the rest of this session. Full-suite runs stay gated and still " +
      "need a fresh confirmation + `/e2e-guard allow`."
    )
  }
  return (
    "[e2e-guard] Approved — the next FULL-suite run passes (one-shot). " +
    "Targeted single-spec re-runs stay unlocked for the rest of this session; " +
    "each later FULL-suite run needs a fresh user confirmation."
  )
}

/**
 * Best-effort toast + log. Toast failure (headless run, older server without
 * /tui/show-toast) degrades to the log line — announcing must never break a
 * session start or a switch.
 */
async function showToast(client: Client, message: string, variant: "warning" | "info"): Promise<void> {
  const log = makeLogger(client, "e2e-guard")
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
async function announce(
  client: Client,
  message: string,
  variant: "warning" | "info",
  _sessionID?: string,
): Promise<void> {
  await showToast(client, message, variant)
}

export function makeAnnounceHook(client: Client) {
  const log = makeLogger(client, "e2e-guard")

  return safeHook(
    async ({ event }: { event: SessionEvent }) => {
      if (event.type === "session.deleted") {
        // Approvals are session-scoped — never let one outlive its session.
        const id = event.properties?.info?.id
        if (id) revokeApproval(id)
        return
      }
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

/** Immediate user-visible confirmation for `/e2e-guard on|off` switches. */
export async function announceSwitch(
  client: Client,
  state: GuardState,
  sessionID?: string,
): Promise<void> {
  await announce(client, announceMessage(state), state === "on" ? "warning" : "info", sessionID)
}

/** Immediate user-visible confirmation for `/e2e-guard allow [targeted]`. */
export async function announceAllow(
  client: Client,
  sessionID?: string,
  scope: "full" | "targeted" = "full",
): Promise<void> {
  await announce(client, allowMessage(scope), "info", sessionID)
}

/** Immediate user-visible status report for bare `/e2e-guard`. */
export async function announceStatus(client: Client, sessionID?: string): Promise<void> {
  await announce(client, statusMessage(), "info", sessionID)
}
