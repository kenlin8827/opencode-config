/**
 * Hook: experimental.chat.system.transform — inject the E2E guard protocol
 * (loaded from e2e-guard-protocol.md) into the system prompt when the
 * switch is on; strip any stale marker when it is off or when running on a subagent.
 *
 * Scoped to Primary Delivery Agents only (code, build, architect, or root orchestrator session):
 *   - Subagents (with parentID or specialized non-delivery agents) do not have
 *     interactive `ask` tool permissions and do not perform git commit/handoff,
 *     so injecting E2E protocol into them would cause noise and context pollution.
 *
 * Cache-friendly strategy:
 *   - on + primary agent + exact marker present → no-op, prompt-cache warm.
 *   - on + primary agent + marker absent/stale → strip stale, append fresh.
 *   - off (or non-primary agent) + marker present → strip marker.
 *   - off (or non-primary agent) + marker absent → no-op.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { scoped } from "../shared/plugin-scope"
import { isEnabled } from "./e2e-guard-config"
import { getGuardPrompt, MARKER, MARKER_ON } from "./e2e-guard-instructions"

// Known primary delivery agents with interaction & commit capabilities
const PRIMARY_AGENTS = new Set(["code", "build", "architect", "general", ""])

export function isPrimaryAgent(input?: { agent?: string; parentID?: string }): boolean {
  if (!input) return true
  // Subagents have parentID set
  if (input.parentID) return false
  const agent = (input.agent ?? "").toLowerCase()
  return PRIMARY_AGENTS.has(agent)
}

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

/** Append the fragment to the LAST string entry only. */
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
  const log = (level: "info" | "warn", message: string) =>
    client.app.log({ body: { service: "e2e-guard", level, message } })

  return async (input: { agent?: string; parentID?: string; sessionID?: string } | undefined, output: { system: string[] }) => {
    // Lite mode: bare-prompt contract — no e2e protocol for @lite.
    // (A lite session can never carry a stale block: all injectors skip it.)
    if (!await scoped(input, output.system, "e2e-guard", client)) return

    const shouldInject = isEnabled() && isPrimaryAgent(input)

    if (!shouldInject) {
      // Switch off or not a primary agent — make sure no stale protocol lingers.
      if (hasAnyMarker(output.system)) {
        stripMarker(output.system)
        await log("info", "system prompt: stale e2e-guard block stripped")
      }
      return
    }

    // Fast path: already injected for the active state → don't touch anything.
    // Keeps the prompt-cache warm.
    if (hasExactMarker(output.system, MARKER_ON)) return

    // Slow path: first injection (or stale block from another state).
    if (hasAnyMarker(output.system)) stripMarker(output.system)
    const changed = appendPrompt(output.system, getGuardPrompt())
    if (changed) await log("info", "system prompt: e2e-guard protocol injected (primary agent)")
  }
}
