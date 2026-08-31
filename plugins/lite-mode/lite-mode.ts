/**
 * Lite-Mode — L2 disclosure layer.
 *
 * The `lite` agent carries the `<!-- lite-mode -->` sentinel in its inline
 * prompt. When the joined system prompt contains the sentinel, this plugin
 * strips it and every `Instructions from: <path>` block (L0 instruction
 * files, project AGENTS.md, remote instructions) from the system text.
 *
 * Fail-open: any error leaves the system prompt untouched. Pure string ops —
 * no I/O, no session lookup, runs on every step but costs only an includes().
 */

import type { Plugin } from "@opencode-ai/plugin"

export const SENTINEL = "<!-- lite-mode -->"
const INSTRUCTION_MARKER = "Instructions from: "

/** True when the marker's path argument looks like a file path or URL. */
export function isInstructionPath(path: string): boolean {
  const t = path.trim()
  return /^(https?:\/\/|\.{0,2}\/|~\/|[A-Za-z]:\\)/.test(t) || /\.(md|txt)$/.test(t)
}

// Blocks that follow the instruction segments in opencode's joined system
// (session/prompt: system = [env, instructions, mcpInstructions, skills]).
const SYSTEM_TAG = /^<(available_skills|mcp_instructions|env)\b/

/**
 * Strip the sentinel and all instruction blocks. A block starts at a line
 * beginning with `Instructions from: <path-like>` and runs until the next
 * such marker, a system block tag, or end of text — internal blank lines in
 * instruction files stay inside the block.
 */
export function stripLiteOverhead(system: string): string {
  const lines = system.split("\n")
  const kept: string[] = []
  let inBlock = false
  for (const line of lines) {
    if (line.startsWith(INSTRUCTION_MARKER) && isInstructionPath(line.slice(INSTRUCTION_MARKER.length))) {
      inBlock = true
      continue
    }
    if (inBlock && SYSTEM_TAG.test(line)) inBlock = false
    if (!inBlock) kept.push(line)
  }
  return kept
    .join("\n")
    .replace(SENTINEL, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export const LiteModePlugin: Plugin = async () => ({
  "experimental.chat.system.transform": async (
    _input: unknown,
    output: { system: string[] },
  ) => {
    for (let i = 0; i < output.system.length; i++) {
      const s = output.system[i]
      if (typeof s !== "string" || !s.includes(SENTINEL)) continue
      try {
        output.system[i] = stripLiteOverhead(s)
      } catch {
        // Fail-open: keep the original system text.
      }
    }
  },
})
