/**
 * E2E guard (e2e-guard) — project-level switch gating E2E test runs behind
 * an explicit user confirmation. Hard enforcement of the E2E red line in the
 * test-scope policy: E2E suites are slow, flaky, expensive, and a last
 * resort — a soft prompt rule alone lets an agent talk itself into running
 * them anyway, so the execution itself gets gated.
 *
 *   on  — bash/shell tool calls that run an E2E suite (npm/pnpm/yarn/bun
 *         run scripts named *e2e*, playwright test, cypress run,
 *         nightwatch, codeceptjs run, pytest/tox invocations that say e2e)
 *         are hard-blocked unless the session
 *         holds a one-shot approval. Graded by risk: full-suite runs need
 *         a fresh approval every time; targeted runs (explicit spec/test
 *         file argument) pass automatically once the session has ANY
 *         confirmed approval. The block message instructs the agent to
 *         prefer a targeted run of the specs affected by the diff and let
 *         the user choose; the user then runs `/e2e-guard allow targeted`
 *         (affected-spec runs only) or `/e2e-guard allow` (one full-suite
 *         pass) and the agent retries.
 *   off — default; the plugin is a complete no-op.
 *
 * The approval is deliberately in-memory and one-shot: it is the user's
 * live confirmation for THIS session, consumed on first use, revoked on
 * session.deleted, and never persisted — a stale approval must not let a
 * future session run E2E silently.
 *
 * File layout: one entry + one job per file (mirrors adr-guard).
 *   e2e-guard-config.ts     — state normalize, project opencode.jsonc field
 *                               IO, command-argument parsing
 *   e2e-guard-runtime.ts    — E2E command detection + risk levels, one-shot
 *                               approval store + sticky session unlock,
 *                               block messages
 *   e2e-guard-tool-guard.ts — tool.before hook: blocks ungated E2E runs
 *   e2e-guard-command.ts    — command hook (/e2e-guard on|off|reset|allow|status)
 *   e2e-guard-announce.ts   — event hook (session-created notice, approval
 *                               revocation on session.deleted; switch feedback)
 *
 * Switch: `e2eGuard` field in the project-level opencode.jsonc (no state file).
 */

import type { Plugin } from "@opencode-ai/plugin"
import { HttpServerResponse } from "effect/unstable/http"
import { makeAnnounceHook } from "./e2e-guard-announce"
import { makeCommandHook } from "./e2e-guard-command"
import { COMMAND_NAME, setProjectDir } from "./e2e-guard-config"
import { makeToolGuardHook } from "./e2e-guard-tool-guard"

// OpenCode's command hook has no cancel/noReply output. Throwing a raw
// Effect response is handled by OpenCode's HTTP layer as an empty
// successful command — the LLM never sees an empty prompt.
const handled = (): never => {
  throw HttpServerResponse.empty({ status: 204 })
}

export const E2eGuardPlugin: Plugin = async ({ client, directory }) => {
  // Switch is project-level: pin state/config paths to this project's directory.
  setProjectDir(directory)
  return {
    config: async (cfg) => {
      cfg.command ??= {}
      cfg.command[COMMAND_NAME] = {
        template: "",
        description:
          "Toggle the E2E gate for this project — E2E runs require user confirmation + /e2e-guard allow (one full-suite pass) or allow targeted (affected-spec runs only) (on | off | allow [targeted] | status)",
      }
    },
    "command.execute.before": makeCommandHook(client, handled),
    "tool.execute.before": makeToolGuardHook(client),
    event: makeAnnounceHook(client) as any,
  }
}
