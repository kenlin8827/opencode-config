/**
 * Hook: event — announce the active advisor mode to the user.
 *
 * The mode is persisted in ~/.config/opencode/.advisor-mode and silently
 * survives across sessions; without a visible signal the user can forget
 * full mode is on — and full mode auto-answers on their behalf.
 *
 * Two surfaces, one message builder:
 *   - session.created → top-level sessions only (subagent sessions carry
 *     parentID), mode=off stays silent, full gets a warning variant that
 *     names the auto-answer risk, lite gets a light info toast.
 *   - /advisor <mode> → the command hook reuses announceMessage() for the
 *     switch confirmation.
 *
 * Toast is TUI-only by nature: in headless environments (opencode run) the
 * call throws / no-ops and we degrade to a log line. Never fatal.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getMode, type AdvisorMode } from "./advisor-config"
import { CONFIDENCE_THRESHOLD, makeLogger, MAX_AUTO_ANSWERS, safeHook } from "./advisor-runtime"

type Client = PluginInput["client"]

/** Minimal shape we rely on; the SDK's Event union is broader. */
type SessionCreatedEvent = {
  type: string
  properties?: { info?: { parentID?: string } }
}

/** One user-visible line per mode. Full MUST name the auto-answer risk. */
export function announceMessage(mode: AdvisorMode): string {
  if (mode === "full") {
    return (
      `[advisor] Mode: FULL — advisor may answer blocking questions on your ` +
      `behalf (FACTUAL, confidence ≥ ${CONFIDENCE_THRESHOLD}, max ${MAX_AUTO_ANSWERS}/session). /advisor lite to require sign-off.`
    )
  }
  if (mode === "off") {
    return "[advisor] Mode: OFF — no @advisor dispatch; orchestrator decides alone."
  }
  return (
    "[advisor] Mode: LITE — both opinions returned to you; nothing auto-executes."
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
async function announce(client: Client, mode: AdvisorMode): Promise<void> {
  const log = makeLogger(client, "advisor-mode")
  try {
    await client.tui.showToast({
      body: { message: announceMessage(mode), variant: toastVariant(mode) },
    })
    await log("info", `announce: mode=${mode} toast shown`)
  } catch {
    await log("info", `announce: mode=${mode} (no TUI — log only)`)
  }
}

export function makeAnnounceHook(client: Client) {
  const log = makeLogger(client, "advisor-mode")

  return safeHook(
    async ({ event }: { event: SessionCreatedEvent }) => {
      if (event.type !== "session.created") return
      // Subagent sessions (task-dispatched) carry parentID — only announce on
      // the top-level session the user actually opened.
      if (event.properties?.info?.parentID) return
      const mode = getMode()
      if (mode === "off") return
      await announce(client, mode)
    },
    log,
  )
}

/** Immediate user-visible confirmation for `/advisor <mode>` switches. */
export async function announceSwitch(
  client: Client,
  mode: AdvisorMode,
  sessionID?: string,
): Promise<void> {
  const log = makeLogger(client, "advisor-mode")
  const message = announceMessage(mode)
  // If we have a sessionID, inject the confirmation into the chat transcript
  // via session.prompt({ noReply: true, ignored: true }) — visible in the
  // main UI, no LLM call, no context pollution (OpenCode natively skips
  // ignored parts in message-v2.ts:206).
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
      await log("info", `announce: mode=${mode} (chat reply)`)
      return
    } catch {
      // session.prompt failed — fall through to toast
    }
  }
  await announce(client, mode)
}
