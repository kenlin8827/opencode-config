/// <reference types="bun" />
import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { HttpServerResponse } from "effect/unstable/http"

/**
 * Profile Switcher — switch model provider profiles from within opencode.
 *
 * The `/profile` slash command is registered programmatically via the
 * `config` hook — no `commands/profile.md` file is needed.
 *
 * Slash command: /profile
 *   /profile              — show current active profile + tier mappings
 *   /profile list         — list all available profiles
 *   /profile <name>       — apply a profile (rewrites opencode.jsonc)
 *   /profile current      — same as /profile (show current state)
 *
 * Profiles are JSON files in:
 *   ~/.config/opencode/profiles/  (installed from repo + user-custom)
 *
 * State file: ~/.config/opencode/.active-profile
 *
 * Output: results are injected into the chat transcript via
 * `session.prompt({ noReply: true })` — appears in the main UI without
 * triggering an LLM call. Toast is only a fallback in headless mode.
 *
 * Note: Changes to opencode.jsonc require an opencode restart to take
 * effect.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
} from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "opencode.jsonc")
const STATE_FILE = join(CONFIG_DIR, ".active-profile")
const PROFILES_DIR = join(CONFIG_DIR, "profiles")
const COMMAND_NAME = "profile"

// ─── Command suppression ────────────────────────────────────────────
// OpenCode's command hook has no cancel/noReply output. Throwing a raw
// Effect response is handled by OpenCode's HTTP layer as an empty
// successful command — the LLM never sees an empty prompt.
const handled = (): never => {
  throw HttpServerResponse.empty({ status: 204 })
}

// ─── Types ───────────────────────────────────────────────────────────

interface Profile {
  description?: string
  tiers: Record<string, string> // tier name → "provider/model_id"
}

interface Agent {
  tier?: string
  model?: string
  [key: string]: unknown
}

interface OpenCodeConfig {
  model?: string
  agent?: Record<string, Agent>
  provider?: Record<string, unknown>
  [key: string]: unknown
}

// ─── JSONC stripping ─────────────────────────────────────────────────
// Strips // and /* */ comments while respecting string literals.
// Also removes trailing commas before } or ] (common in JSONC).

function stripJsonc(raw: string): string {
  let result = ""
  let i = 0
  const len = raw.length
  let state: "normal" | "string" | "lineComment" | "blockComment" = "normal"

  while (i < len) {
    const c = raw[i]
    const next = i + 1 < len ? raw[i + 1] : ""

    switch (state) {
      case "normal":
        if (c === '"') {
          result += c
          state = "string"
        } else if (c === "/" && next === "/") {
          state = "lineComment"
          i++
        } else if (c === "/" && next === "*") {
          state = "blockComment"
          i++
        } else {
          result += c
        }
        break
      case "string":
        result += c
        if (c === "\\") {
          i++
          if (i < len) result += raw[i]
        } else if (c === '"') {
          state = "normal"
        }
        break
      case "lineComment":
        if (c === "\n") {
          result += c
          state = "normal"
        }
        break
      case "blockComment":
        if (c === "*" && next === "/") {
          state = "normal"
          i++
        }
        break
    }
    i++
  }

  return result.replace(/,(\s*[}\]])/g, "$1")
}

function hasJsoncComments(path: string): boolean {
  if (!existsSync(path)) return false
  const raw = readFileSync(path, "utf-8")
  return /(^|\s)\/\//m.test(raw) || /\/\*/.test(raw)
}

// ─── Config IO ───────────────────────────────────────────────────────

function readConfig(path: string): OpenCodeConfig {
  if (!existsSync(path)) throw new Error(`config not found: ${path}`)
  const raw = readFileSync(path, "utf-8")
  const clean = stripJsonc(raw)
  return JSON.parse(clean) as OpenCodeConfig
}

function writeConfigAtomic(path: string, data: OpenCodeConfig): void {
  const dir = join(path, "..")
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (existsSync(path)) {
    writeFileSync(path + ".bak", readFileSync(path))
  }
  const json = JSON.stringify(data, null, 2)
  writeFileSync(path + ".tmp", json, "utf-8")
  renameSync(path + ".tmp", path)
}

// ─── Profile loading ─────────────────────────────────────────────────
// Scans the profiles directory (installed bundled + user-custom together).

function loadProfiles(): Map<string, { path: string; data: Profile }> {
  const profiles = new Map<string, { path: string; data: Profile }>()

  if (!existsSync(PROFILES_DIR)) return profiles
  let files: string[]
  try {
    files = readdirSync(PROFILES_DIR)
  } catch {
    return profiles
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    const name = file.replace(/\.json$/, "")
    try {
      const path = join(PROFILES_DIR, file)
      const data = JSON.parse(readFileSync(path, "utf-8")) as Profile
      if (data.tiers && typeof data.tiers === "object") {
        profiles.set(name, { path, data })
      }
    } catch {
      // skip invalid profiles silently
    }
  }

  return profiles
}

// ─── Profile application ─────────────────────────────────────────────
// Validates tier value format, then rewrites agent models per tier.
// Mixed providers are allowed — a profile can span multiple providers.
// Root `model` tracks tier.default — kept in sync like config.sh/config.ps1.

function applyProfile(
  config: OpenCodeConfig,
  profile: Profile,
): { updated: number; details: string[] } {
  const details: string[] = []
  let updated = 0

  if (!config.agent) {
    throw new Error("opencode.jsonc has no agent section")
  }

  // Validate format: each tier value must be '<provider>/<model_id>'.
  // Mixed providers are allowed — a profile can route different tiers to
  // different providers (e.g. deepseek for text tiers, llm-router for vision).
  for (const [tier, ref] of Object.entries(profile.tiers)) {
    if (!ref.includes("/") || ref.startsWith("/") || ref.endsWith("/")) {
      throw new Error(
        `tier ${tier}: value '${ref}' must be '<provider>/<model_id>'`,
      )
    }
  }

  // Apply each tier: rewrite every agent whose tier matches.
  for (const [tier, ref] of Object.entries(profile.tiers)) {
    let count = 0
    for (const agent of Object.values(config.agent)) {
      if (agent.tier === tier) {
        agent.model = ref
        count++
      }
    }
    if (count === 0) {
      throw new Error(`no agent currently uses tier ${tier}`)
    }
    if (tier === "default") {
      config.model = ref
    }
    details.push(
      `  tier.${tier} → ${ref} (${count} agent${count > 1 ? "s" : ""})`,
    )
    updated += count
  }

  return { updated, details }
}

// ─── State file ──────────────────────────────────────────────────────

function getActiveProfile(): string | null {
  if (!existsSync(STATE_FILE)) return null
  const name = readFileSync(STATE_FILE, "utf-8").trim()
  return name || null
}

function setActiveProfile(name: string): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(STATE_FILE, name, "utf-8")
}

// ─── Current tier mapping ────────────────────────────────────────────
// Reads the first agent's model for each tier (all agents in a tier share
// one ref — same semantics as config.sh/config.ps1).

function getCurrentTierMapping(config: OpenCodeConfig): Record<string, string> {
  const map: Record<string, string> = {}
  if (!config.agent) return map
  for (const agent of Object.values(config.agent)) {
    if (agent.tier && agent.model && !(agent.tier in map)) {
      map[agent.tier] = agent.model
    }
  }
  return map
}

// ─── Logger + Toast ──────────────────────────────────────────────────

function makeLogger(client: PluginInput["client"]) {
  return (
    level: "info" | "warn",
    message: string,
    extra?: Record<string, unknown>,
  ) =>
    client.app.log({
      body: {
        service: "profile-switcher",
        level,
        message,
        ...(extra ? { extra } : {}),
      },
    })
}

async function announce(
  client: PluginInput["client"],
  message: string,
  variant: "info" | "warning" = "info",
): Promise<void> {
  try {
    await client.tui.showToast({ body: { message, variant } })
  } catch {
    // headless — toast not available, degrade silently
  }
}

// ─── Chat reply (main UI output) ─────────────────────────────────────
// Injects a user message into the session transcript via `session.prompt`
// with `noReply: true`. The message appears in the main chat UI without
// triggering an LLM response.
//
// The part is tagged `ignored: true` so OpenCode's native message-v2
// converter skips it when building LLM context (see message-v2.ts:206).
// No extra transform hook needed. Falls back to toast in headless mode.

async function reply(
  client: PluginInput["client"],
  sessionID: string,
  message: string,
): Promise<void> {
  try {
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        parts: [{ type: "text", text: message, ignored: true }],
        noReply: true,
      },
      throwOnError: true,
    })
  } catch {
    // session.prompt failed (headless or no session) — fall back to toast
    await announce(client, message)
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────

export const ProfileSwitcherPlugin: Plugin = async ({ client }) => {
  const log = makeLogger(client)
  let commentsWarned = false

  return {
    // ── Register /profile as a real slash command ─────────────────
    config: async (cfg) => {
      cfg.command ??= {}
      cfg.command[COMMAND_NAME] = {
        template: "",
        description: "Switch model provider profile (list | <name> | current)",
      }
    },

    "command.execute.before": async (input) => {
      if (input.command !== COMMAND_NAME) return

      const args = (input.arguments || "").trim()

      // ── /profile list ────────────────────────────────────────────
      if (args === "list") {
        const profiles = loadProfiles()
        if (profiles.size === 0) {
          await reply(
            client,
            input.sessionID,
            "[profile] No profiles found.\n" +
              "Expected in ~/.config/opencode/profiles/",
          )
          return handled()
        }

        const active = getActiveProfile()
        const sorted = Array.from(profiles.keys()).sort()
        const lines: string[] = [`[profile] ${profiles.size} profile(s) available:`]

        for (const name of sorted) {
          const { data } = profiles.get(name)!
          const marker = name === active ? " ← active" : ""
          const desc = data.description
            ? ` — ${data.description.slice(0, 100)}`
            : ""
          lines.push(`  ${name}${desc}${marker}`)
        }

        lines.push("")
        lines.push("[profile] Use /profile <name> to switch.")
        await reply(client, input.sessionID, lines.join("\n"))
        return handled()
      }

      // ── /profile or /profile current ─────────────────────────────
      if (args === "" || args === "current") {
        const active = getActiveProfile()
        const activeLine = active
          ? `[profile] Active: ${active}`
          : "[profile] No profile explicitly set (using current config)"

        try {
          const config = readConfig(CONFIG_FILE)
          const tiers = getCurrentTierMapping(config)
          const rootModel = config.model || "(unset)"
          const lines: string[] = [
            activeLine,
            "[profile] Current tier mappings:",
            `  model    → ${rootModel}  ← tracks tier.default`,
          ]
          for (const [tier, ref] of Object.entries(tiers).sort()) {
            lines.push(`  tier.${tier.padEnd(7)} → ${ref}`)
          }
          lines.push("")
          lines.push(
            "[profile] /profile list — see options  |  /profile <name> — switch",
          )
          await reply(client, input.sessionID, lines.join("\n"))
        } catch {
          await reply(client, input.sessionID, activeLine)
        }
        return handled()
      }

      // ── /profile <name> — apply ──────────────────────────────────
      const name = args.split(/\s+/)[0]
      const profiles = loadProfiles()

      if (!profiles.has(name)) {
        const available = Array.from(profiles.keys()).sort().join(", ")
        await reply(
          client,
          input.sessionID,
          `[profile] Not found: ${name}\n` +
            `Available: ${available || "(none)"}`,
        )
        return handled()
      }

      const { data: profile } = profiles.get(name)!

      try {
        // Warn about comment loss (one-time per session).
        if (!commentsWarned && hasJsoncComments(CONFIG_FILE)) {
          commentsWarned = true
          await reply(
            client,
            input.sessionID,
            "[profile] Warning: opencode.jsonc contains comments — they will be lost on write.",
          )
        }

        const config = readConfig(CONFIG_FILE)
        const { updated, details } = applyProfile(config, profile)
        writeConfigAtomic(CONFIG_FILE, config)
        setActiveProfile(name)

        const message = [
          `[profile] Switched to: ${name}`,
          ...details,
          `[profile] ${updated} agent(s) updated — restart opencode to take effect.`,
        ].join("\n")

        await reply(client, input.sessionID, message)
        await log("info", `profile=${name} applied (${updated} agents updated)`, {
          profile: name,
          updated,
          details,
        })
      } catch (err) {
        const msg = (err as Error).message
        await reply(
          client,
          input.sessionID,
          `[profile] Failed to apply '${name}': ${msg}`,
        )
        await log("warn", `apply failed for '${name}': ${msg}`)
      }
      return handled()
    },

    event: async ({ event }) => {
      if (event.type !== "session.created") return
      // Only announce on top-level sessions (not subagent dispatches).
      const props = (event as any).properties
      if (props?.info?.parentID) return

      const active = getActiveProfile()
      if (!active) return

      await announce(client, `[profile] Active profile: ${active}`)
    },
  }
}
