/**
 * Hook: experimental.chat.system.transform — inject natural language steering
 * instructions into the system prompt so all agents know to automatically call
 * `md_to_pdf` when the user asks in natural language (e.g. "@path/to/doc.md 转PDF").
 */

const MARKER = "[MD-TO-PDF CAPABILITY]"

const SYSTEM_PROMPT_FRAGMENT = `
${MARKER}
### Markdown to PDF Conversion Workflow
- When the user asks in natural language to convert, render, or export a Markdown file to PDF (e.g., "@file.md 转PDF", "将 doc.md 转为 PDF", "export @README.md as PDF"):
  1. Extract the file path mentioned (from @filepath or plain text).
  2. Inform the user in dialogue that PDF generation is in progress (e.g. "⏳ 正在将 \`<filePath>\` 转换为 PDF...").
  3. Call the \`md_to_pdf\` tool with \`{ inputPath: "<filePath>" }\`.
  4. If conversion succeeds, explicitly inform the user in dialogue of the completed PDF file path, size, and success status.
  5. If conversion fails, output the error message in dialogue, provide the manual dependency install commands, and clearly advise the user to inspect the detailed log file located in \`.opencode/logs/\`.
`

function hasMarker(system: string[]): boolean {
  return system.some((s) => typeof s === "string" && s.includes(MARKER))
}

function appendPrompt(system: string[], fragment: string): boolean {
  for (let i = system.length - 1; i >= 0; i--) {
    const s = system[i]
    if (typeof s !== "string") continue
    system[i] = s + fragment
    return true
  }
  return false
}

export function makeSystemHook() {
  return async (_input: unknown, output: { system: string[] }) => {
    if (!output.system || hasMarker(output.system)) return
    appendPrompt(output.system, SYSTEM_PROMPT_FRAGMENT)
  }
}
