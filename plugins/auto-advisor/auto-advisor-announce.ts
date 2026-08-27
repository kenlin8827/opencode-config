/**
 * Hook: event — announce the active auto-advisor mode to the user.
 *
 * The mode is persisted as `autoAdvisorMode` in the project's opencode.jsonc
 * and silently
 * survives across sessions; without a visible signal the user can forget
 * full mode is on — and full mode auto-answers on their behalf.
 *
 * Two surfaces, one message builder:
 *   - session.created → top-level sessions only (subagent sessions carry
 *     parentID), mode=off stays silent, full gets a warning variant that
 *     names the auto-answer risk, lite gets a light info toast.
 *   - /auto-advisor <mode> → the command hook reuses announceMessage() for the
 *     switch confirmation.
 *
 * Toast-only strategy:
 *   tui.showToast is the sole surface — non-intrusive, no chat-transcript
 *   pollution, and degrades to a log line in headless/older-server
 *   environments. Never fatal.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getMode, type AdvisorMode } from "./auto-advisor-config"
import { CONFIDENCE_THRESHOLD, makeLogger, MAX_AUTO_ANSWERS, safeHook } from "./auto-advisor-runtime"

type Client = PluginInput["client"]

/** Minimal shape we rely on; the SDK's Event union is broader. */
type SessionCreatedEvent = {
  type: string
  properties?: { info?: { parentID?: string; id?: string } }
}

/** One user-visible line per mode. Full MUST name the auto-answer risk. */
export function announceMessage(mode: AdvisorMode): string {
  if (mode === "full") {
    return (
      `[auto-advisor] Mode: FULL — advisor may answer blocking questions on your ` +
      `behalf (FACTUAL, confidence ≥ ${CONFIDENCE_THRESHOLD}, max ${MAX_AUTO_ANSWERS}/session). /auto-advisor lite to require sign-off.`
    )
  }
  if (mode === "off") {
    return "[auto-advisor] Mode: OFF — no auto-dispatch of @advisor; manual @advisor still works. Orchestrator decides alone."
  }
  return (
    "[auto-advisor] Mode: LITE — both opinions returned to you; nothing auto-executes."
  )
}

function toastVariant(mode: AdvisorMode): "warning" | "info" {
  return mode === "full" ? "warning" : "info"
}

/**
 * Best-effort toast + log. Toast failure (headless run, older server without
 * /tui/show-toast) degrades to the log line — announcing must never break a
 * session start or a mode switch.
 */
async function showToast(client: Client, mode: AdvisorMode): Promise<void> {
  const log = makeLogger(client, "auto-advisor-mode")
  try {
    await client.tui.showToast({
      body: { message: announceMessage(mode), variant: toastVariant(mode) },
    })
    await log("info", `announce: mode=${mode} toast shown`)
  } catch {
    await log("info", `announce: mode=${mode} (no TUI — log only)`)
  }
}

/**
 * Show the message as a toast notification — non-intrusive, no
 * chat-transcript pollution. Degrades to a log line if the TUI is
 * unavailable. Never fatal.
 */
async function announce(client: Client, mode: AdvisorMode, _sessionID?: string): Promise<void> {
  await showToast(client, mode)
}

export function makeAnnounceHook(client: Client) {
  const log = makeLogger(client, "auto-advisor-mode")

  return safeHook(
    async ({ event }: { event: SessionCreatedEvent }) => {
      if (event.type !== "session.created") return
      // Subagent sessions (task-dispatched) carry parentID — only announce on
      // the top-level session the user actually opened.
      if (event.properties?.info?.parentID) return
      const mode = getMode()
      if (mode === "off") return
      const sessionID = event.properties?.info?.id
      await announce(client, mode, sessionID)
    },
    log,
  )
}

/** Immediate user-visible confirmation for `/auto-advisor <mode>` switches. */
export async function announceSwitch(
  client: Client,
  mode: AdvisorMode,
  sessionID?: string,
): Promise<void> {
  await announce(client, mode, sessionID)
}
