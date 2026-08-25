import type { PluginInput } from "@opencode-ai/plugin"
import { HttpServerResponse } from "effect/unstable/http"
import { relative } from "node:path"
import {
  convertSingleFile,
  checkPandoc,
  checkNode,
  checkChromium,
  autoInstallPandoc,
} from "./engine"

export const COMMAND_NAMES = ["md-to-docx"] as const

export function makeCommandHook(client: PluginInput["client"], projectDir: string) {
  return async (input: { command?: string; arguments?: string; sessionID?: string }) => {
    if (!input.command || !COMMAND_NAMES.includes(input.command as any)) return

    const argsStr = (input.arguments || "").trim()

    // Show help if no arguments provided
    if (!argsStr || argsStr === "help" || argsStr === "--help" || argsStr === "-h") {
      const help = `[md-to-docx] Markdown to Word (DOCX) Exporter

Usage:
  /md-to-docx <file.md> [output.docx] [--style=custom.css]  - Convert markdown to styled Word document
  /md-to-docx --doctor                                      - Check Pandoc, Node, and Playwright status
  /md-to-docx --install-deps                                - Auto-install missing dependencies

Features:
  🎨 CSS Stylesheets: Customize brand color, fonts, borders & tables via CSS (:root / table th / pre)
  ✨ Chinese Typography: SongTi body + HeiTi headings + A4 margins
  📑 Auto TOC: Centered, dotted leader lines, Word field updates
  📊 Enhanced Tables: 100% full width, auto column widths, header background
  💻 Code Blocks: Monospace Consolas font, light gray background and border
  🧜‍♂️ Mermaid Support: Native high-res diagram rendering into Word

Examples:
  /md-to-docx README.md
  /md-to-docx docs/materials/system-design.md dist/design.docx
  /md-to-docx report.md --style=custom-theme.css`

      if (input.sessionID) {
        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            parts: [{ type: "text", text: help, ignored: true }],
            noReply: true,
          },
        })
      }
      throw HttpServerResponse.empty({ status: 204 })
    }

    if (argsStr === "--doctor" || argsStr === "doctor") {
      const pandocOk = checkPandoc()
      const nodeOk = checkNode()
      const chromiumOk = checkChromium()

      const doctorReport = `[md-to-docx Environment Diagnostic]
- Pandoc (Markdown parser): ${pandocOk ? "✅ Available" : "❌ Missing"}
- Node.js runtime: ${nodeOk ? "✅ Available" : "❌ Missing"}
- Playwright Chromium (Mermaid renderer): ${chromiumOk ? "✅ Ready" : "⚠️ Browser binary missing"}

${!pandocOk || !chromiumOk ? "👉 Run `/md-to-docx --install-deps` to auto-install missing tools or view install guide.\n" : "✨ All DOCX typography, CSS theme & Mermaid engines are ready!"}`

      if (input.sessionID) {
        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            parts: [{ type: "text", text: doctorReport, ignored: true }],
            noReply: true,
          },
        })
      }
      throw HttpServerResponse.empty({ status: 204 })
    }

    if (argsStr === "--install-deps") {
      const reportLines: string[] = ["[md-to-docx Dependency Provisioning]"]

      if (!checkPandoc()) {
        reportLines.push("• Pandoc Markdown Parser:")
        const res = autoInstallPandoc(projectDir)
        if (res.success) {
          reportLines.push("  ✅ Auto-installed successfully via winget.")
        } else {
          reportLines.push(`  ❌ Auto-install failed: ${res.message}`)
          reportLines.push("  👉 Manual installation guide:")
          reportLines.push("     - Windows: Run `winget install JohnMacFarlane.Pandoc` (or `choco install pandoc`)")
          reportLines.push("     - macOS:   Run `brew install pandoc`")
          reportLines.push("     - Linux:   Run `sudo apt-get install pandoc`")
          if (res.logFile) {
            const relLog = res.logFile.startsWith(projectDir) ? relative(projectDir, res.logFile) : res.logFile
            reportLines.push(`  📝 Log: ${relLog}`)
          }
        }
      } else {
        reportLines.push("• Pandoc Markdown Parser: ✅ Already installed.")
      }

      if (input.sessionID) {
        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            parts: [{ type: "text", text: reportLines.join("\n"), ignored: true }],
            noReply: true,
          },
        })
      }
      throw HttpServerResponse.empty({ status: 204 })
    }

    // Normal conversion invocation
    const parts = argsStr.split(/\s+/)
    let inputPath = ""
    let outputPath: string | undefined
    let stylePath: string | undefined

    for (const p of parts) {
      if (p.startsWith("--style=")) {
        stylePath = p.slice(8).trim()
      } else if (!inputPath) {
        inputPath = p
      } else if (!outputPath) {
        outputPath = p
      }
    }

    if (input.sessionID) {
      await client.session.prompt({
        path: { id: input.sessionID },
        body: {
          parts: [{ type: "text", text: `⏳ Converting \`${inputPath}\` to publication-quality Word (DOCX)...`, ignored: true }],
          noReply: true,
        },
      })
    }

    try {
      const res = await convertSingleFile({ inputPath, outputPath, stylePath }, projectDir)
      const successMsg = `🎉 Word document generated successfully!\n• Source: \`${res.inputPath}\`\n• Output: \`${res.outputPath}\`\n• Size: ${(res.fileSizeBytes / 1024).toFixed(1)} KB`

      if (input.sessionID) {
        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            parts: [{ type: "text", text: successMsg, ignored: true }],
            noReply: true,
          },
        })
      }
    } catch (err) {
      const errorMsg = (err as Error).message

      if (input.sessionID) {
        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            parts: [{ type: "text", text: errorMsg, ignored: true }],
            noReply: true,
          },
        })
      }
    }

    throw HttpServerResponse.empty({ status: 204 })
  }
}
