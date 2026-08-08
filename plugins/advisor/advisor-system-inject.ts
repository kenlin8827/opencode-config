/**
 * Hook: experimental.chat.system.transform — inject the active-mode marker
 * and the embedded advisor protocol into the system prompt.
 *
 * Strategy:
 *   - Build the prompt fragment for the active mode.
 *   - Strip any prior [ADVISOR MODE:] block (idempotent across turns / mode changes).
 *   - Append the fragment to every system-prompt element.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getMode } from "./advisor-config"
import { getAdvisorPrompt } from "./advisor-instructions"
import { makeLogger } from "./advisor-runtime"

const MARKER = "[ADVISOR MODE:"

type Log = ReturnType<typeof makeLogger>

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
    // Find the end: next "\n---\n" or "\n\n" boundary after our marker
    const after = s.substring(idx)
    const endMarker = after.indexOf("\n\n---\n", after.indexOf("]\n") + 2)
    const end = endMarker > 0 ? idx + endMarker : s.length
    system[i] = s.substring(0, idx) + s.substring(end)
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
    if (hasMarker(output.system)) stripMarker(output.system)
    const changed = appendPrompt(output.system, getAdvisorPrompt(mode))
    if (changed) await log("info", `system prompt: mode=${mode} injected`)
  }
}