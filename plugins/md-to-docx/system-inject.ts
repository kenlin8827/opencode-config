import { scoped } from "../shared/plugin-scope"

export function makeSystemHook(client: unknown) {
  return async (input: { sessionID?: string }, output: { system?: string[] }) => {
    output.system ??= []
    // Lite mode: bare-prompt contract — no capability steering for @lite.
    if (!await scoped(input, output.system, "md-to-docx", client as never)) return

    const instruction = `
# Markdown to Word (DOCX) Conversion Capability

You have access to the \`md_to_docx\` tool and \`/md-to-docx\` slash command to export Markdown documents into publication-quality Word (.docx) files.

When to use \`md_to_docx\`:
- When the user asks to "convert to word", "export to docx", "generate word report", "转word", "转docx", or export meeting minutes, ADRs, requirements documents, architecture specifications into Word documents.
- When documents need structured Chinese typography (SongTi/HeiTi), auto TOC, customized header/footers with page numbers, and beautiful tables.
`
    output.system.push(instruction)
  }
}
