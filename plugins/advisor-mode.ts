/**
 * Advisor Mode Guard — 3-mode toggle for blocking decisions.
 * Modes: off | lite (default) | full.
 *
 *   off  — no @advisor dispatch. Orchestrator decides alone.
 *   lite — both opinions returned to user.
 *   full — confidence ≥ 9 → auto-execute; < 9 → lite flow.
 *
 * File layout: one entry + one job per file.
 *   advisor-config.ts            — mode normalize, state file IO, cold-start
 *   advisor-runtime.ts           — log, advisor detection, output shaping
 *   advisor-instructions.ts      — embedded prompt fragment per mode
 *   advisor-mode-tracker.ts      — command hook (writes state on slash command)
 *   advisor-system-inject.ts     — system-transform hook (injects prompt)
 *   advisor-tool-guard.ts        — tool.before hook (blocks @advisor when off)
 *   advisor-full-inject.ts       — tool.after hook (auto-execute ≥ 9 in full mode)
 *
 * State file: ~/.config/opencode/.advisor-mode
 */

import type { Plugin } from "@opencode-ai/plugin"
import { makeCommandHook } from "./advisor/advisor-mode-tracker"
import { makeSystemHook } from "./advisor/advisor-system-inject"
import { makeToolGuardHook } from "./advisor/advisor-tool-guard"
import { makeFullInjectHook } from "./advisor/advisor-full-inject"

export const AdvisorModePlugin: Plugin = async ({ client }) => ({
  "command.execute.before": makeCommandHook(client),
  "experimental.chat.system.transform": makeSystemHook(client),
  "tool.execute.before": makeToolGuardHook(client),
  "tool.execute.after": makeFullInjectHook(client),
})