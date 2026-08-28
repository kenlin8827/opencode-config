/**
 * OCP Plugin — registers the `/ocp` slash command programmatically and
 * intercepts it via command.execute.before, wrapping the repo's `ocp` CLI:
 *
 *   /ocp version → print install/VERSION
 *   /ocp update  → check for a newer release (read-only)
 *   /ocp upgrade → pull the latest release and re-apply the installer
 *   /ocp status  → installed vs repo version
 *
 * The hook handles the command entirely in-process: it shells out to the
 * CLI, posts the result into the chat with noReply, and then throws a
 * synthetic empty HTTP response (`handled()`) so OpenCode never sends an
 * LLM turn for this command.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { HttpServerResponse } from "effect/unstable/http"
import { COMMAND_NAME } from "./ocp-config"
import { makeCommandHook } from "./ocp-command"

/**
 * OpenCode's command hook has no cancel/noReply output. Throwing a raw
 * Effect response is handled by OpenCode's HTTP layer as an empty
 * successful command — the LLM never sees an empty prompt. (Same pattern
 * as deepseek-anchor.)
 */
const handled = (): never => {
  throw HttpServerResponse.empty({ status: 204 })
}

export const OcpPlugin: Plugin = async ({ client }) => {
  return {
    config: async (cfg) => {
      cfg.command ??= {}
      cfg.command[COMMAND_NAME] = {
        template: "",
        description:
          "OpenCode Prime self-management: /ocp update (check) | /ocp upgrade | /ocp status | /ocp version",
      }
    },
    "command.execute.before": makeCommandHook(client, handled),
  }
}
