/**
 * Shared review-fix-loop instructions — loads the protocol from a sibling
 * markdown file at runtime.
 *
 * The protocol lives in `review-fix-loop.md` (same directory as this file).
 * This keeps the Markdown editable with proper syntax highlighting, avoids
 * 297 lines of template-string escaping, and is loaded once on first access.
 *
 * The protocol is injected via `experimental.chat.system.transform` only
 * when the command was actually invoked in the current session (see
 * `rfl-config.ts: isSessionArmed`).
 *
 * The frontmatter (`agent: build`) and `$ARGUMENTS` are handled by the
 * `command.execute.before` hook — they don't need to be in the protocol.
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

let cached: string | null = null

export function getProtocol(): string {
  if (cached !== null) return cached
  cached = readFileSync(join(__dirname, "review-fix-loop.md"), "utf-8")
  return cached
}
