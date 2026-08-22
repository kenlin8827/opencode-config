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
import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { rewrite } from "./rewrite"

/**
 * Touch rtk's hook-warn marker so the "No hook installed" banner is
 * rate-limited to silence for the opencode session.
 *
 * rtk's hook_check::check_and_warn() emits the banner when its own
 * shell hook isn't installed. On Windows `rtk init -g` can't install
 * the bash hook (no bash/jq/POSIX perms), so the banner appears on
 * every command and pollutes the LLM context. The check has a 24-hour
 * rate-limit via a marker file at dirs::data_local_dir()/rtk/
 * .hook_warn_last — touching it at plugin load keeps it fresh for the
 * session. Platform paths follow the Rust `dirs` crate: win32 =
 * LOCALAPPDATA, darwin = ~/Library/Application Support (XDG ignored),
 * linux = XDG_DATA_HOME or ~/.local/share.
 *
 * Our vendored plugin already rewrites commands via tool.execute.before,
 * so rtk's shell hook is redundant (and impossible on Windows).
 */
function silenceHookWarn() {
  try {
    const dataDir =
      process.platform === "win32"
        ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "rtk")
        : process.platform === "darwin"
          ? join(homedir(), "Library", "Application Support", "rtk")
          : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "rtk")
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(join(dataDir, ".hook_warn_last"), "")
  } catch {
    // best-effort — don't break plugin init
  }
}

export const OpenRtkPlugin: Plugin = async ({ $ }) => {
  // Check rtk is installed at plugin load time
  try {
    await $`rtk --version`.quiet()
  } catch {
    console.warn("[openrtk] rtk binary not found in PATH — plugin disabled")
    return {}
  }

  // Suppress rtk's "No hook installed" banner — our vendored plugin
  // already handles command rewriting via tool.execute.before, so
  // rtk's own shell hook is redundant (and impossible on Windows).
  silenceHookWarn()

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
