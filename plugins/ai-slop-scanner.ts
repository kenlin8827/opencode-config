/// <reference types="bun" />
import type { Plugin } from "@opencode-ai/plugin"

/**
 * AI Slop Scanner — scans frontend files after edit for common AI-generated
 * anti-patterns. Reports warnings (does NOT block — use design-token-guard for blocking).
 *
 * Detects:
 *  - Gradient soup (multi-stop gradients on non-special elements)
 *  - Excessive rounded corners (rounded-3xl on everything)
 *  - Drop shadow overuse (shadow-2xl on multiple elements)
 *  - Purple/blue gradient text headings
 *  - Floating glassmorphism without context
 *  - Div soup (<div onClick> instead of <button>)
 *  - Inline styles when Tailwind exists
 *  - z-index wars (z-[9999])
 *  - Emoji in professional UI
 *
 * Only scans TSX/JSX/Vue/Svelte files. Warnings are logged via client.app.log().
 */

const FRONTEND_EXTENSIONS = [".tsx", ".jsx", ".vue", ".svelte"] as const

const SLOP_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /bg-gradient-to-\w+\s+from-\w+-\d+\s+via-\w+-\d+\s+to-\w+-\d+/g,
    message: "Gradient soup: multi-stop gradient detected. Use sparingly, with intent.",
  },
  {
    pattern: /rounded-(?:3xl|full)/g,
    message: "Excessive rounded corners: rounded-3xl/full on elements. Match design system radius.",
  },
  {
    pattern: /shadow-2xl/g,
    message: "Drop shadow overuse: shadow-2xl. Use design system elevation.",
  },
  {
    pattern: /bg-clip-text\s+text-transparent\s+bg-gradient/g,
    message: "Gradient text on headings: almost never professional.",
  },
  {
    pattern: /backdrop-blur-xl\s+bg-white\/10\s+border\s+border-white\/20/g,
    message: "Floating glassmorphism without context.",
  },
  {
    pattern: /<div[^>]*onClick/g,
    message: "Div soup: <div onClick> instead of <button>. Use semantic HTML.",
  },
  {
    pattern: /style\s*=\s*\{\{[^}]*(?:color|background|padding|margin|width|height)\s*:/g,
    message: "Inline styles when Tailwind/design tokens exist.",
  },
  {
    pattern: /z-\[9999\]|z-\[10000\]|z-\[999\]/g,
    message: "z-index wars: z-[9999]. Use design system stacking.",
  },
  {
    pattern: /[🔥🚀✨⚡🎯💡🚦]/g,
    message: "Emoji in professional UI. Use icon library instead.",
  },
]

function isFrontend(filePath: string): boolean {
  return FRONTEND_EXTENSIONS.some((ext) => filePath.endsWith(ext))
}

function scanForSlop(content: string): string[] {
  const warnings: string[] = []
  for (const { pattern, message } of SLOP_PATTERNS) {
    const matches = content.match(pattern)
    if (matches) {
      warnings.push(`${message} (${matches.length} occurrence${matches.length > 1 ? "s" : ""})`)
    }
  }
  return warnings
}

export const AiSlopScanner: Plugin = async ({ client }) => {
  return {
    event: async ({ event }) => {
      if (event.type !== "file.edited") return
      const file = (event as any).properties?.file || (event as any).file || ""
      if (!file || !isFrontend(file)) return

      // Read the edited file content
      try {
        const content = await Bun.file(file).text()
        if (!content) return

        const warnings = scanForSlop(content)
        if (warnings.length === 0) return

        // Log warnings via structured logging
        await client.app.log({
          body: {
            service: "ai-slop-scanner",
            level: "warn",
            message: `AI Slop detected in ${file}`,
            extra: {
              file,
              warnings,
              count: warnings.length,
            },
          },
        })
      } catch {
        // File read failed — skip silently
      }
    },
  }
}
