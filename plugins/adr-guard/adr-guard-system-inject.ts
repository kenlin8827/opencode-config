/**
 * Hook: experimental.chat.system.transform — inject the ADR iron-law
 * protocol (loaded from adr-guard-protocol.md) into the system prompt
 * when the switch is on; strip any stale marker when it is off.
 *
 * Cache-friendly strategy (same as auto-advisor):
 *   - on + exact marker already present → complete no-op, prompt-cache warm.
 *   - on + marker absent/stale → strip stale block, append fresh fragment.
 *   - off + marker present → strip the block (switch flipped off mid-session).
 *   - off + marker absent → complete no-op.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { scoped } from "../shared/plugin-scope"
import { isEnabled } from "./adr-guard-config"
import { getGuardPrompt, MARKER, MARKER_ON } from "./adr-guard-instructions"
import { makeLogger } from "./adr-guard-runtime"

type Log = ReturnType<typeof makeLogger>

function hasExactMarker(system: string[], exact: string): boolean {
  return system.some((s) => typeof s === "string" && s.includes(exact))
}

function hasAnyMarker(system: string[]): boolean {
  return system.some((s) => typeof s === "string" && s.includes(MARKER))
}

function stripMarker(system: string[]): boolean {
  let changed = false
  for (let i = 0; i < system.length; i++) {
    const s = system[i]
    if (typeof s !== "string") continue
    const idx = s.indexOf(MARKER)
    if (idx === -1) continue
    // Trim the separator whitespace that preceded the marker so the
    // original prompt restores without leftover blank space.
    system[i] = s.substring(0, idx).replace(/\s+$/, "")
    changed = true
  }
  return changed
}

/** Append the fragment to the LAST string entry only — appending to every
 * entry would duplicate it across multi-entry system prompts (same fix as
 * project-profiler / project-manager). */
function appendPrompt(system: string[], fragment: string): boolean {
  for (let i = system.length - 1; i >= 0; i--) {
    const s = system[i]
    if (typeof s !== "string") continue
    system[i] = s + fragment
    return true
  }
  return false
}

export function makeSystemHook(client: PluginInput["client"]) {
  const log: Log = makeLogger(client, "adr-guard")

  return async (input: { sessionID?: string } | undefined, output: { system: string[] }) => {
    // Lite mode: bare-prompt contract — no iron-law protocol for @lite.
    // (A lite session can never carry a stale block: all injectors skip it.)
    if (!await scoped(input, output.system, "adr-guard", client)) return

    if (!isEnabled()) {
      // Switch off — make sure no stale protocol lingers in the prompt.
      if (hasAnyMarker(output.system)) {
        stripMarker(output.system)
        await log("info", "system prompt: stale iron-law block stripped (state=off)")
      }
      return
    }

    // Fast path: already injected for the active state → don't touch
    // anything. Keeps the prompt-cache warm.
    if (hasExactMarker(output.system, MARKER_ON)) return

    // Slow path: first injection (or stale block from another state).
    if (hasAnyMarker(output.system)) stripMarker(output.system)
    const changed = appendPrompt(output.system, getGuardPrompt())
    if (changed) await log("info", "system prompt: iron-law protocol injected (state=on)")
  }
}
