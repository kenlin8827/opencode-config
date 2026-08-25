/**
 * Markdown to PDF - Print & Typography Styles
 * Loads default A4 print CSS from style.css with optional custom CSS injection.
 */

import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

let cachedDefaultCss: string | null = null

export function getStyleCssPath(): string {
  const currentDir = typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))
  return join(currentDir, "style.css")
}

export function getDefaultCss(): string {
  if (cachedDefaultCss !== null) {
    return cachedDefaultCss
  }

  const cssPath = getStyleCssPath()
  if (existsSync(cssPath)) {
    cachedDefaultCss = readFileSync(cssPath, "utf8")
  } else {
    // Fallback minimal safe CSS if style.css is not found
    cachedDefaultCss = `@page { size: A4; margin: 16mm 14mm; } body { font-family: sans-serif; line-height: 1.45; }`
  }

  return cachedDefaultCss
}

export function buildInjectedStyle(customCss?: string): string {
  const baseCss = getDefaultCss()
  if (!customCss) {
    return `<style>\n${baseCss}\n</style>`
  }
  return `<style>\n${baseCss}\n\n/* Custom Injected CSS */\n${customCss}\n</style>`
}
