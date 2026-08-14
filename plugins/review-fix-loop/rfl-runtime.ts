/**
 * Shared review-fix-loop runtime — log helper.
 * Single source of truth for utilities hooks reuse.
 */

import type { PluginInput } from "@opencode-ai/plugin"

export function makeLogger(client: PluginInput["client"], service: string) {
  return (level: "info" | "warn", message: string) =>
    client.app.log({ body: { service, level, message } })
}
