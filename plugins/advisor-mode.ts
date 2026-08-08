import type { Plugin } from "@opencode-ai/plugin"

/**
 * Advisor Mode Guard — session-level 3-mode toggle for advisor mode.
 *
 * Modes:
 *  - "off"       — No advisor dispatch. Orchestrator decides alone.
 *  - "advisory"  — Advisor gives opinion, both returned to human. (default)
 *  - "decisive"  — If advisor confidence ≥ 9, follow advisor's decision directly.
 *                  Otherwise, return both opinions to human.
 *
 * Enforcement layers (verified 2026-08-08):
 *
 *  1. command.execute.before — writes state file when commands fire.
 *     ✅ Verified — fires with `opencode run --command advisor-off`.
 *
 *  2. experimental.chat.system.transform — strips advisor protocol from system prompt when off.
 *     ⚠️ Experimental, undocumented. Best-effort.
 *
 *  3. tool.execute.before — blocks dispatch to @advisor when off.
 *     ✅ Verified — confirmed working in runtime test.
 *
 *  4. tool.execute.after — in decisive mode, parses advisor's confidence score
 *     and injects a MANDATORY directive when ≥ 9.
 *     ⚠️ Best-effort — relies on output shape being modifiable.
 *
 * State file: ~/.config/opencode/.advisor-mode
 *  - File absent or content "advisory" → advisory mode (default)
 *  - Content "off" → off
 *  - Content "decisive" → decisive
 *  - Content "on" → advisory (backward compat)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const STATE_FILE = join(CONFIG_DIR, ".advisor-mode")

const ADVISOR_PROTOCOL_MARKER = "Decision advisor protocol"

type AdvisorMode = "off" | "advisory" | "decisive"

function getAdvisorMode(): AdvisorMode {
  if (!existsSync(STATE_FILE)) return "advisory" // default on
  const content = readFileSync(STATE_FILE, "utf-8").trim().toLowerCase()
  if (content === "off") return "off"
  if (content === "decisive") return "decisive"
  return "advisory" // "on", "advisory", or anything else → advisory
}

function isAdvisorModeOn(): boolean {
  return getAdvisorMode() !== "off"
}

function setAdvisorMode(mode: AdvisorMode): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
  writeFileSync(STATE_FILE, mode, "utf-8")
}

/**
 * Parse confidence score from advisor's response text.
 * Matches patterns like "Confidence: 8/10", "confidence 9", "**Confidence**: 10"
 */
function parseConfidence(text: string): number {
  // Matches: "Confidence: 9", "**Confidence**: 9", "confidence 10", "Confidence**: 8"
  const match = text.match(/confidence\*{0,2}[:\s]+(\d{1,2})/i)
  return match ? parseInt(match[1], 10) : 0
}

export const AdvisorModePlugin: Plugin = async ({ client }) => {
  return {
    /**
     * Layer 1: Intercept advisor commands.
     * ✅ Verified: fires with `opencode run --command advisor-off`.
     */
    "command.execute.before": async (input, output) => {
      const cmd = (input.command || "").replace(/^\//, "")

      if (cmd === "advisor-off") {
        setAdvisorMode("off")
        await client.app.log({
          body: {
            service: "advisor-mode",
            level: "info",
            message: "Advisor mode OFF — state file written",
          },
        })
      } else if (cmd === "advisor-on") {
        setAdvisorMode("advisory")
        await client.app.log({
          body: {
            service: "advisor-mode",
            level: "info",
            message: "Advisor mode ADVISORY — state file written",
          },
        })
      } else if (cmd === "advisor-decisive") {
        setAdvisorMode("decisive")
        await client.app.log({
          body: {
            service: "advisor-mode",
            level: "info",
            message: "Advisor mode DECISIVE — state file written",
          },
        })
      }
    },

    /**
     * Layer 2: Modify system prompt based on current advisor mode.
     *
     * - off: Strip advisor protocol entirely. LLM doesn't know @advisor exists.
     * - advisory: Leave protocol as-is (default, describes all 3 modes).
     * - decisive: Append a CRITICAL mode marker so the LLM knows decisive is active.
     *
     * This is essential: without the mode marker, the LLM sees the protocol
     * describing all 3 modes but doesn't know which one is currently active.
     */
    "experimental.chat.system.transform": async (input, output) => {
      const mode = getAdvisorMode()

      // Skip title generator and other non-main system prompts
      // (only process system prompts that contain the advisor protocol)
      const hasAdvisorProtocol = output.system?.some(
        (s: string) => s.includes(ADVISOR_PROTOCOL_MARKER)
      )
      if (!hasAdvisorProtocol) return

      if (mode === "off") {
        // Strip advisor protocol section from the system prompt string.
        // All instructions are concatenated into a single string, so we can't
        // use array.filter — we need to find and remove the section.
        //
        // Strategy: find "## Decision advisor protocol" and remove from there
        // to the end of the string (it's the last instruction in the array).
        // If there's content after it, find the next "\n## " section.
        for (let i = 0; i < output.system.length; i++) {
          const s = output.system[i]
          const markerIdx = s.indexOf(ADVISOR_PROTOCOL_MARKER)
          if (markerIdx === -1) continue

          // Find the end: next "\n## " after the marker, or end of string
          const afterMarker = s.substring(markerIdx)
          const nextSectionIdx = afterMarker.indexOf("\n## ", 1) // skip the marker itself
          let endIdx: number
          if (nextSectionIdx > 0) {
            endIdx = markerIdx + nextSectionIdx
          } else {
            endIdx = s.length // remove to end of string
          }

          // Replace the section with a disabled notice
          output.system[i] =
            s.substring(0, markerIdx) +
            "## Advisor mode: OFF (disabled by plugin)\n" +
            "Advisor consultation is disabled. Do not dispatch @advisor.\n" +
            s.substring(endIdx)
        }

        await client.app.log({
          body: {
            service: "advisor-mode",
            level: "info",
            message: "System prompt: advisor protocol stripped (off mode)",
          },
        })
        return
      }

      if (mode === "decisive") {
        // Inject a mode marker so the LLM knows decisive mode is active
        const modeMarker =
          "\n\n---\n" +
          "⚠️ [ADVISOR MODE: DECISIVE — ACTIVE NOW]\n" +
          "Current advisor mode: DECISIVE.\n" +
          "When @advisor returns confidence ≥ 9, you MUST auto-execute. Do NOT ask the user.\n" +
          "When confidence < 9, present both opinions to the user.\n" +
          "This is not advisory mode. This is not off. This is DECISIVE.\n"

        for (let i = 0; i < output.system.length; i++) {
          if (output.system[i].includes(ADVISOR_PROTOCOL_MARKER) &&
              !output.system[i].includes("[ADVISOR MODE: DECISIVE")) {
            output.system[i] = output.system[i] + modeMarker
            break
          }
        }

        await client.app.log({
          body: {
            service: "advisor-mode",
            level: "info",
            message: "System prompt: decisive mode marker injected",
          },
        })
      }

      // advisory mode: no modification needed — protocol describes all modes
    },

    /**
     * Layer 3: Block @advisor dispatch when mode is off.
     * ✅ Verified: confirmed working in runtime test on 2026-08-08.
     */
    "tool.execute.before": async (input, output) => {
      if (isAdvisorModeOn()) return

      const argsStr = JSON.stringify(output.args || {})

      if (
        argsStr.includes('"advisor"') ||
        argsStr.includes('"@advisor"') ||
        argsStr.includes("@advisor")
      ) {
        throw new Error(
          "[Advisor Mode Guard] Advisor mode is currently OFF.\n" +
          "The @advisor agent cannot be dispatched while advisor mode is disabled.\n" +
          "Run /advisor-on (advisory) or /advisor-decisive (decisive) to re-enable."
        )
      }
    },

    /**
     * Layer 4: Decisive mode enforcement — inject directive after advisor returns.
     *
     * When in decisive mode and advisor's confidence ≥ 9, appends a MANDATORY
     * directive to the tool output telling the orchestrator to auto-execute.
     *
     * This is best-effort: if the output shape isn't modifiable, the directive
     * won't be injected and we rely on system prompt compliance alone.
     */
    "tool.execute.after": async (input, output) => {
      const mode = getAdvisorMode()
      if (mode === "off") return

      // Check if this was an advisor dispatch
      const inputArgsStr = JSON.stringify(input.args || input || {})
      if (
        !inputArgsStr.includes("advisor") &&
        !inputArgsStr.includes("@advisor")
      ) {
        return
      }

      // Try to extract advisor's response text from various output shapes
      // OpenCode's task tool returns output in different shapes depending on version:
      // - output.output (string)
      // - output.state.output (nested)
      // - output.content (string)
      // - output.result (string)
      // - plain string
      // Also try JSON.stringify as last resort (covers nested objects)
      let responseText = ""
      if (typeof output === "string") {
        responseText = output
      } else if (output && typeof output === "object") {
        const out = output as Record<string, unknown>
        // Try direct string fields
        for (const key of ["content", "result", "text", "output", "data"]) {
          if (typeof out[key] === "string") {
            responseText = out[key] as string
            break
          }
        }
        // Try nested state.output (OpenCode task tool shape)
        if (!responseText && out.state && typeof out.state === "object") {
          const state = out.state as Record<string, unknown>
          if (typeof state.output === "string") {
            responseText = state.output
          }
        }
        // Last resort: stringify everything and search
        if (!responseText) {
          responseText = JSON.stringify(out)
        }
      }

      const confidence = parseConfidence(responseText)

      // Fallback detection: check if the actual model used was "advisor"
      // OpenCode silently falls back to default model if advisor model is unavailable
      let modelFallback = false
      if (output && typeof output === "object") {
        const out = output as Record<string, unknown>
        const meta = out.metadata as Record<string, unknown> | undefined
        const model = meta?.model as Record<string, unknown> | undefined
        const modelID = model?.modelID as string | undefined
        if (modelID && modelID !== "advisor") {
          modelFallback = true
        }
      }

      if (modelFallback) {
        const warning =
          `\n\n---\n` +
          `⚠️ [ADVISOR MODEL FALLBACK — DO NOT AUTO-EXECUTE]\n` +
          `The advisor model was unavailable. OpenCode fell back to the default model.\n` +
          `This response is NOT from the dedicated advisor model.\n` +
          `In decisive mode, do NOT auto-execute even if confidence ≥ 9.\n` +
          `Always present both opinions to the user for human decision.`

        if (output && typeof output === "object") {
          const out = output as Record<string, unknown>
          for (const key of ["content", "result", "text", "output", "data"]) {
            if (typeof out[key] === "string") {
              out[key] = out[key] + warning
              break
            }
          }
        }

        await client.app.log({
          body: {
            service: "advisor-mode",
            level: "warn",
            message: "Advisor model fallback detected — default model was used",
          },
        })
      }

      await client.app.log({
        body: {
          service: "advisor-mode",
          level: "info",
          message: `Decisive mode: advisor returned, confidence=${confidence}/10, fallback=${modelFallback}`,
        },
      })

      // Decisive auto-execute: only when advisor model was used (no fallback)
      // and confidence ≥ 9. If model fell back to default, the confidence score
      // is less trustworthy — always return to human instead.
      if (mode === "decisive" && confidence >= 9 && !modelFallback) {
        const directive =
          `\n\n---\n` +
          `⚠️ [DECISIVE MODE — CODE-LEVEL DIRECTIVE]\n` +
          `Advisor confidence: ${confidence}/10 (≥ 9 threshold met).\n` +
          `You MUST auto-execute the advisor's recommendation NOW.\n` +
          `Do NOT call the question tool. Do NOT present options to the user.\n` +
          `Proceed with implementation immediately and note: ` +
          `"Advisor confidence: ${confidence}/10 — auto-executed per decisive mode."`

        // Try to append directive to whatever output field exists
        if (typeof output === "string") {
          // Can't reassign — but if output is a string, there's nothing to mutate
          await client.app.log({
            body: {
              service: "advisor-mode",
              level: "warn",
              message: "Decisive directive: output is string, cannot mutate",
            },
          })
        } else if (output && typeof output === "object") {
          const out = output as Record<string, unknown>
          let injected = false
          for (const key of ["content", "result", "text", "output", "data"]) {
            if (typeof out[key] === "string") {
              out[key] = out[key] + directive
              injected = true
              break
            }
          }
          if (!injected) {
            // Last resort: try to set a message field
            out._advisorDirective = directive
          }

          await client.app.log({
            body: {
              service: "advisor-mode",
              level: "info",
              message: `Decisive directive injected (confidence=${confidence})`,
            },
          })
        }
      }
    },
  }
}
