/**
 * Advisor Mode Guard — 3-mode toggle for blocking decisions.
 * Modes: off | lite (default) | full.
 *
 *   off  — no @advisor dispatch. Orchestrator decides alone.
 *   lite — both opinions returned to user; advisor never answers for the user.
 *   full — FACTUAL question + confidence ≥ 8 → advisor answers on the user's
 *          behalf (auto-execute); PREFERENCE or < 8 → lite flow.
 *
 * File layout: one entry + one job per file.
 *   advisor-config.ts            — mode normalize, state file IO, cold-start
 *   advisor-runtime.ts           — log, advisor detection, output shaping,
 *                                  red-team + question-class guards,
 *                                  auto-answer state (session-keyed)
 *   advisor-instructions.ts      — prompt fragment per mode (loads advisor-protocol.md)
 *   advisor-protocol.md         — advisor protocol body (markdown, read once + cached)
 *   advisor-mode-tracker.ts      — command hook (writes state on slash command)
 *   advisor-system-inject.ts     — system-transform hook (injects prompt)
 *   advisor-tool-guard.ts        — tool.before hook: blocks @advisor when off;
 *                                  blocks question tool when auto-answer armed
 *   advisor-full-inject.ts       — tool.after hook: auto-answer FACTUAL ≥ 8 in
 *                                  full mode; arms auto-answer state on success
 *   advisor-announce.ts          — event hook (session-created mode notice,
 *                                  toast → log fallback; also switch feedback)
 *
 * State file: ~/.config/opencode/.advisor-mode
 */

import type { Plugin } from "@opencode-ai/plugin"
import { HttpServerResponse } from "effect/unstable/http"
import { makeAnnounceHook } from "./advisor/advisor-announce"
import { makeCommandHook } from "./advisor/advisor-mode-tracker"
import { makeSystemHook } from "./advisor/advisor-system-inject"
import { makeToolGuardHook } from "./advisor/advisor-tool-guard"
import { makeFullInjectHook } from "./advisor/advisor-full-inject"
import { COMMAND_NAME } from "./advisor/advisor-config"

// OpenCode's command hook has no cancel/noReply output. Throwing a raw
// Effect response is handled by OpenCode's HTTP layer as an empty
// successful command — the LLM never sees an empty prompt.
const handled = (): never => {
  throw HttpServerResponse.empty({ status: 204 })
}

export const AdvisorModePlugin: Plugin = async ({ client }) => ({
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "",
      description: "Switch advisor mode (off | lite | full)",
    }
  },
  "command.execute.before": makeCommandHook(client, handled),
  "experimental.chat.system.transform": makeSystemHook(client),
  "tool.execute.before": makeToolGuardHook(client),
  "tool.execute.after": makeFullInjectHook(client),
  event: makeAnnounceHook(client) as any,
})