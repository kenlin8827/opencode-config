/**
 * lite-tools — compress native tool definitions for @lite only.
 *
 * opencode ships Claude-Code-derived tool descriptions (~6.5k tok total;
 * bash alone ~1.8k). Frontier models are RL-trained on these schemas, so
 * short descriptions lose almost nothing. Rewrite every native tool to a
 * one-line description; keep parameter schemas untouched (they carry the
 * actual contract and feed permission checks).
 *
 * tool.definition input has no agent field, so gate via chat.message +
 * chat.params state (both fire per user message before the request is
 * assembled; dual signals guard against either hook dropping the agent
 * field in a future opencode version).
 * Loader contract: this module MUST export a function only
 * (getLegacyPlugins drops files with any non-function export).
 */
const OVERRIDES: Record<string, string> = {
  bash: "Execute a shell command; returns stdout and stderr. Use workdir instead of cd. Prefer dedicated tools for file operations (Read/Grep/Glob/Edit/Write). Quote paths containing spaces.",
  read: "Read a file, or a line range with offset/limit. Truncated output includes a pointer to the full-content file.",
  write: "Create or overwrite a file with content.",
  edit: "Surgical edit: oldText must match exactly, including whitespace. Read the file first; prefer multiple small edits over one large replacement.",
  grep: "Search file contents with ripgrep-compatible regex. Returns matching lines; combine with Glob for path filtering.",
  glob: "Find files by glob pattern, sorted by modification time.",
  websearch: "Search the web; returns result titles, snippets, and URLs.",
  webfetch: "Fetch a URL and extract its main content.",
  task: "Delegate to a read-only assistant; returns its result. explore: codebase understanding/search. code-review: review diffs or files (only when the user asks). advisor: second opinion (only when the user asks). vision: image/screenshot analysis (when you cannot see it yourself). These four are the only subagents available.",
}

export async function LiteToolsPlugin() {
  let currentAgent = ""
  const track = (agent?: string) => { if (agent) currentAgent = agent }
  return {
    "chat.message": async (input: { agent?: string }, _output: unknown) => track(input.agent),
    "chat.params": async (input: { agent?: string }, _output: unknown) => track(input.agent),
    "tool.definition": async (input: { toolID: string }, output: { description: string }) => {
      if (currentAgent !== "lite") return
      const next = OVERRIDES[input.toolID]
      if (next) output.description = next
    },
  }
}
