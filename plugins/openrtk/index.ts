/**
 * openrtk — OpenCode plugin for RTK (Rust Token Killer).
 *
 * Vendored from https://github.com/martinstannard/openrtk
 * Copyright (c) 2026 Martin Stannard, MIT License.
 * Intercepts shell commands in `tool.execute.before` and rewrites them
 * through RTK for automatic output compression (60-90% token savings on
 * common dev commands) — fully transparent to the model.
 *
 * Local deviation from upstream: the rtk probe uses `rtk --version`
 * instead of `which rtk` — `which` doesn't exist on native Windows and
 * would silently disable the plugin there.
 *
 * Replaces rtk's official opencode plugin (`rtk init -g --opencode`):
 * same hook, same effect, but shipped by this repo so no `rtk init`
 * step is needed and the rewrite rules are reviewable in-tree.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { rewrite } from "./rewrite"

export const OpenRtkPlugin: Plugin = async ({ $ }) => {
  // Check rtk is installed at plugin load time
  try {
    await $`rtk --version`.quiet()
  } catch {
    console.warn("[openrtk] rtk binary not found in PATH — plugin disabled")
    return {}
  }

  return {
    "tool.execute.before": async (input, output) => {
      // OpenCode may use "bash", "shell", or other names
      const tool = String(input?.tool ?? "").toLowerCase()
      if (tool !== "bash" && tool !== "shell") return

      // args may be {command: "..."} or have command nested differently
      const args = output?.args
      if (!args || typeof args !== "object") return

      const command = (args as Record<string, unknown>).command
      const rewritten = rewrite(command)
      if (rewritten) {
        ;(args as Record<string, unknown>).command = rewritten
      }
    },
  }
}
