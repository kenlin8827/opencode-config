/**
 * Hook: experimental.chat.system.transform — inject the review-fix-loop
 * protocol into the system prompt.
 *
 * Strategy:
 *   - Only inject when the session is armed (i.e., the user actually
 *     ran `/review-fix-loop` in this session — not on every system prompt
 *     build for every session).
 *   - Strip any prior [REVIEW-FIX-LOOP] block (idempotent across turns).
 *   - Append the full protocol fragment to every system-prompt element.
 *
 * The protocol is loaded from `review-fix-loop.md` via `getProtocol()` —
 * no 300-line template string in source. The protocol stays out of the
 * chat UI (visual) and in the system prompt (LLM-only).
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { isSessionArmed, disarmSession } from "./rfl-config"
import { getProtocol } from "./rfl-instructions"
import { makeLogger } from "./rfl-runtime"

type Log = ReturnType<typeof makeLogger>

const MARKER = "[REVIEW-FIX-LOOP PROTOCOL ARMED]"

function hasMarker(system: string[]): boolean {
  return system.some((s) => typeof s === "string" && s.includes(MARKER))
}

function stripMarker(system: string[]): boolean {
  let changed = false
  for (let i = 0; i < system.length; i++) {
    const s = system[i]
    if (typeof s !== "string") continue
    const idx = s.indexOf(MARKER)
    if (idx === -1) continue
    system[i] = s.substring(0, idx)
    changed = true
  }
  return changed
}

function appendPrompt(system: string[], fragment: string): boolean {
  let appended = false
  for (let i = 0; i < system.length; i++) {
    const s = system[i]
    if (typeof s !== "string") continue
    system[i] = s + fragment
    appended = true
  }
  return appended
}

export function makeSystemHook(client: PluginInput["client"]) {
  const log: Log = makeLogger(client, "review-fix-loop")

  return async (
    input: { sessionID?: string },
    output: { system: string[] },
  ) => {
    const sessionID = input?.sessionID || "default"

    // Only inject if the user ran /review-fix-loop in this session.
    if (!isSessionArmed(sessionID)) return

    // Disarm after first injection — the protocol stays in the system
    // prompt for the rest of the session. We don't need to re-inject
    // on every subsequent system prompt build.
    disarmSession(sessionID)

    // Strip prior injection (idempotent — safe across compaction/turns).
    if (hasMarker(output.system)) stripMarker(output.system)

    const fragment = `\n\n---\n${MARKER}\n\n${getProtocol()}\n`
    const changed = appendPrompt(output.system, fragment)

    if (changed) {
      await log("info", "protocol injected into system prompt")
    }
  }
}
