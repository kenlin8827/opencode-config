import type { PluginInput } from "@opencode-ai/plugin"
import { HttpServerResponse } from "effect/unstable/http"
import { relative } from "node:path"
import {
  convertSingleFile,
  checkPandoc,
  checkNode,
  checkChromium,
  autoInstallPandoc,
  autoInstallChromium,
} from "./engine"

export const COMMAND_NAMES = ["md-to-pdf"] as const

export function makeCommandHook(client: PluginInput["client"], projectDir: string) {
  return async (input: { command?: string; arguments?: string; sessionID?: string }) => {
    if (!input.command || !COMMAND_NAMES.includes(input.command as any)) return

    const argsStr = (input.arguments || "").trim()

    // Show help if no arguments provided
    if (!argsStr || argsStr === "help" || argsStr === "--help" || argsStr === "-h") {
      const help = `[md-to-pdf] Markdown to PDF Exporter

Usage:
  /md-to-pdf <file.md> [output.pdf] [--style=<custom.css>]  - Convert markdown to styled A4 PDF
  /md-to-pdf --doctor                                        - Check Pandoc, Node, and Playwright status
  /md-to-pdf --install-deps                                  - Auto-install missing dependencies

Examples:
  /md-to-pdf README.md
  /md-to-pdf doc/api-v1.md dist/api-v1.pdf
  /md-to-pdf doc/whitepaper.md --style=custom-theme.css`

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

      const doctorReport = `[md-to-pdf Environment Diagnostic]
- Pandoc (Markdown parser): ${pandocOk ? "✅ Available" : "❌ Missing"}
- Node.js runtime: ${nodeOk ? "✅ Available" : "❌ Missing"}
- Playwright Chromium: ${chromiumOk ? "✅ Ready" : "⚠️ Browser binary missing"}

${!pandocOk || !chromiumOk ? "👉 Run `/md-to-pdf --install-deps` to auto-install missing tools or view install guide.\n" : ""}`

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
      const reportLines: string[] = ["[md-to-pdf Dependency Provisioning]"]

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

      if (!checkChromium()) {
        reportLines.push("\n• Playwright Chromium Browser:")
        const res = autoInstallChromium(projectDir)
        if (res.success) {
          reportLines.push("  ✅ Auto-installed successfully.")
        } else {
          reportLines.push(`  ❌ Auto-install failed: ${res.message}`)
          reportLines.push("  👉 Manual installation guide:")
          reportLines.push("     - In your terminal run: `npx playwright install chromium`")
          reportLines.push("     - If system drive (C:) is full, run: `$env:PLAYWRIGHT_BROWSERS_PATH=\"D:\\.ms-playwright\"; npx playwright install chromium`")
          if (res.logFile) {
            const relLog = res.logFile.startsWith(projectDir) ? relative(projectDir, res.logFile) : res.logFile
            reportLines.push(`  📝 Log: ${relLog}`)
          }
        }
      } else {
        reportLines.push("\n• Playwright Chromium Browser: ✅ Already installed.")
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

    const parts = argsStr.split(/\s+/).filter(Boolean)
    let inputFile = ""
    let outputFile: string | undefined = undefined
    let stylePath: string | undefined = undefined

    for (const part of parts) {
      if (part.startsWith("--style=")) {
        stylePath = part.slice("--style=".length).trim().replace(/^['"]|['"]$/g, "")
      } else if (!inputFile) {
        inputFile = part
      } else if (!outputFile) {
        outputFile = part
      }
    }

    // 1. Notify user in dialogue: conversion is starting
    if (input.sessionID) {
      try {
        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            parts: [{ type: "text", text: `⏳ Converting \`${inputFile}\` to PDF (Pandoc parsing & A4 rendering in progress)...`, ignored: true }],
            noReply: true,
          },
        })
      } catch {}
    }

    try {
      const result = await convertSingleFile(
        {
          inputPath: inputFile,
          outputPath: outputFile,
          customCss: stylePath,
        },
        projectDir,
      )

      // 2. Notify user in dialogue: conversion complete
      const successMsg = `🎉 PDF generation complete!
• Source: ${result.inputPath}
• Output: ${result.outputPath}
• File size: ${(result.fileSizeBytes / 1024).toFixed(1)} KB`

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
