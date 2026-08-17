/**
 * Hook: experimental.chat.system.transform — inject the active-mode marker
 * and the embedded advisor protocol into the system prompt.
 *
 * Cache-friendly strategy:
 *   - Build the expected marker for the active mode (e.g. "[ADVISOR MODE: LITE]").
 *   - If the system prompt already contains that exact marker → do nothing.
 *     The prior injection is still valid; touching the string would break
 *     the LLM provider's prompt-cache (the system prompt is byte-identical,
 *     so the cache stays warm — no extra tokens, no extra cost).
 *   - Only when the mode has changed (or on first-ever injection) do we
 *     strip the old marker block and append the new fragment.
 *
 * In the common case (mode unchanged across turns) this hook is a pure
 * no-op — it doesn't even assign to output.system[i].
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getMode } from "./advisor-config"
import { getAdvisorPrompt, MODE_MARKER } from "./advisor-instructions"
import { makeLogger } from "./advisor-runtime"

const MARKER = "[ADVISOR MODE:"

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
  const log: Log = makeLogger(client, "advisor-mode")

  return async (_input: unknown, output: { system: string[] }) => {
    const mode = getMode()
    const exactMarker = MODE_MARKER[mode]

    // Fast path: the system prompt already has the correct marker for the
    // active mode → don't touch anything. Keeps the prompt-cache warm.
    if (hasExactMarker(output.system, exactMarker)) return

    // Slow path: either first injection, or the mode changed since last turn.
    // Strip any stale [ADVISOR MODE: ...] block, then append the new one.
    if (hasAnyMarker(output.system)) stripMarker(output.system)
    const changed = appendPrompt(output.system, getAdvisorPrompt(mode))
    if (changed) await log("info", `system prompt: mode=${mode} injected`)
  }
}