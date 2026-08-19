/// <reference types="bun" />
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { mkdirSync, existsSync } from "node:fs"
import { join, basename } from "node:path"
import { homedir } from "node:os"
import { randomUUID } from "node:crypto"

/**
 * Browser Screenshot Plugin — registers a custom `browser_screenshot` tool
 * that agents (especially @vision and @frontend-dev) can call to capture
 * screenshots of web pages via Playwright's headless browser.
 *
 * The screenshot is saved as a PNG file and returned as a ToolAttachment,
 * so the LLM can directly "see" the image in the same turn — no manual
 * file reading step needed.
 *
 * Features:
 *  - Navigate to any URL
 *  - Configurable viewport (desktop / mobile presets or custom)
 *  - Full-page or viewport-only screenshot
 *  - Element-scoped screenshot via CSS selector
 *  - Wait for selector / network idle before capturing
 *
 * Dependencies:
 *  - playwright (auto-installed on first use via `bunx playwright install`)
 *
 * Tool: browser_screenshot
 *   Args:
 *     url         (string, required) — URL to navigate to
 *     fullPage    (boolean, optional, default false) — capture full scrollable page
 *     viewport    (object, optional) — { width, height } in px; defaults to 1440x900
 *     device      (string, optional) — preset: "desktop" | "mobile" | "tablet"
 *     selector    (string, optional) — CSS selector to screenshot a specific element
 *     waitUntil   (string, optional) — "load" | "domcontentloaded" | "networkidle" (default "load")
 *     timeout     (number, optional) — navigation timeout in ms (default 30000)
 *
 *   Returns: ToolResult with attachment(s) — PNG screenshot(s) the LLM can see.
 */

// ─── Constants ────────────────────────────────────────────────────────

const SCREENSHOT_DIR = join(homedir(), ".config", "opencode", ".screenshots")

const DEVICE_PRESETS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
}

// ─── Playwright lazy loader ──────────────────────────────────────────
// Playwright is a heavy dependency. Load it lazily so plugins that don't
// use screenshots don't pay the import cost.

let playwrightModule: any = null

async function loadPlaywright(): Promise<any> {
  if (playwrightModule) return playwrightModule

  // Step 1: ensure the playwright npm package is importable
  try {
    playwrightModule = await import("playwright")
  } catch {
    // npm package not installed — can't proceed via bunx alone
    throw new Error(
      "Playwright npm package is not installed. Run: bun add playwright",
    )
  }

  // Step 2: ensure the Chromium browser binary is installed
  try {
    // Verify the browser is available by launching a quick throwaway instance
    const probe = await playwrightModule.chromium.launch({ headless: true })
    await probe.close()
  } catch {
    // Browser binary missing — download it via `playwright install`
    try {
      const { exitCode } = await Bun.$`bunx playwright install chromium`.quiet()
      if (exitCode !== 0) {
        throw new Error("Failed to install Playwright chromium browser")
      }
    } catch (installErr) {
      throw new Error(
        "Chromium browser binary not found and auto-install failed.\n" +
        "Run: bunx playwright install chromium\n" +
        `Original error: ${(installErr as Error).message}`,
      )
    }
  }

  return playwrightModule
}

// ─── Screenshot capture ──────────────────────────────────────────────

interface ScreenshotOptions {
  url: string
  fullPage?: boolean
  viewport?: { width: number; height: number }
  device?: string
  selector?: string
  waitUntil?: string
  timeout?: number
}

async function captureScreenshot(opts: ScreenshotOptions): Promise<{ path: string; width: number; height: number }> {
  const pw = await loadPlaywright()

  // Resolve viewport
  let viewport = { width: 1440, height: 900 }
  if (opts.device && DEVICE_PRESETS[opts.device]) {
    viewport = { ...DEVICE_PRESETS[opts.device] }
  }
  if (opts.viewport) {
    viewport = { width: opts.viewport.width, height: opts.viewport.height }
  }

  // Launch browser — keep the try-finally tight so that if any step
  // fails (launch, newContext, newPage, goto), we still clean up the
  // resources that *were* successfully created.
  let browser: any = null
  let context: any = null
  let page: any = null

  try {
    browser = await pw.chromium.launch({ headless: true })
    context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2, // retina-quality screenshots
    })
    page = await context.newPage()

    // Navigate
    await page.goto(opts.url, {
      waitUntil: opts.waitUntil || "load",
      timeout: opts.timeout || 30000,
    })

    // Ensure screenshot dir exists
    if (!existsSync(SCREENSHOT_DIR)) {
      mkdirSync(SCREENSHOT_DIR, { recursive: true })
    }

    const filename = `screenshot-${Date.now()}-${randomUUID().slice(0, 8)}.png`
    const filepath = join(SCREENSHOT_DIR, filename)

    // Capture
    if (opts.selector) {
      const element = await page.$(opts.selector)
      if (!element) {
        throw new Error(`Element not found: selector "${opts.selector}"`)
      }
      await element.screenshot({ path: filepath, type: "png" })
    } else {
      await page.screenshot({
        path: filepath,
        type: "png",
        fullPage: opts.fullPage || false,
      })
    }

    return { path: filepath, width: viewport.width, height: viewport.height }
  } finally {
    // Close in reverse order; each may be null if an earlier step failed
    if (page) await page.close().catch(() => {})
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────

export const BrowserScreenshotPlugin: Plugin = async () => {
  return {
    tool: {
      browser_screenshot: tool({
        description:
          "Capture a screenshot of a web page using a headless browser (Playwright/Chromium). " +
          "The screenshot is returned as an image attachment that you can analyze directly. " +
          "Use this to: debug UI issues, verify visual changes, check responsive layouts, " +
          "audit accessibility, or compare designs. " +
          "EXPENSIVE: launches a full Chromium instance each call. " +
          "NEVER call more than once per turn. Skip if no dev server or no visual change. " +
          "Example: browser_screenshot({ url: 'http://localhost:3000', device: 'mobile' })",
        args: {
          url: tool.schema.string().describe("URL to navigate to (e.g. 'http://localhost:3000', 'https://example.com')"),
          fullPage: tool.schema.boolean().optional().describe("Capture the full scrollable page, not just the viewport. Default: false"),
          viewport: tool.schema.object({
            width: tool.schema.number().describe("Viewport width in px"),
            height: tool.schema.number().describe("Viewport height in px"),
          }).optional().describe("Custom viewport dimensions. Overrides 'device' preset."),
          device: tool.schema.enum(["desktop", "mobile", "tablet"]).optional().describe("Device preset for viewport. desktop=1440x900, tablet=768x1024, mobile=375x812. Default: desktop"),
          selector: tool.schema.string().optional().describe("CSS selector to screenshot a specific element instead of the whole page"),
          waitUntil: tool.schema.enum(["load", "domcontentloaded", "networkidle"]).optional().describe("When to consider navigation complete. Default: 'load'"),
          timeout: tool.schema.number().optional().describe("Navigation timeout in milliseconds. Default: 30000"),
        },
        execute: async (args, context) => {
          const opts: ScreenshotOptions = {
            url: args.url,
            fullPage: args.fullPage,
            viewport: args.viewport as { width: number; height: number } | undefined,
            device: args.device,
            selector: args.selector,
            waitUntil: args.waitUntil,
            timeout: args.timeout,
          }

          try {
            const result = await captureScreenshot(opts)

            context.metadata({
              title: `Screenshot: ${args.url}`,
              metadata: {
                url: args.url,
                viewport: `${result.width}x${result.height}`,
                fullPage: opts.fullPage || false,
                device: opts.device || "desktop",
                selector: opts.selector || null,
                screenshotPath: result.path,
              },
            })

            // Return as attachment so the LLM can see the image directly
            return {
              title: `Screenshot captured: ${args.url}`,
              output: `Captured screenshot of ${args.url} (${result.width}x${result.height}${opts.fullPage ? ", full page" : ""}${opts.selector ? `, selector: ${opts.selector}` : ""})\nSaved to: ${result.path}`,
              metadata: {
                url: args.url,
                viewport: { width: result.width, height: result.height },
                fullPage: opts.fullPage || false,
                device: opts.device || "desktop",
                path: result.path,
              },
              attachments: [
                {
                  type: "file" as const,
                  mime: "image/png",
                  url: result.path,
                  filename: basename(result.path),
                },
              ],
            }
          } catch (err) {
            const message = (err as Error).message
            return {
              title: `Screenshot failed: ${args.url}`,
              output: `Failed to capture screenshot of ${args.url}:\n${message}\n\n` +
                "Troubleshooting:\n" +
                "  1. Is the URL accessible? Try: curl -I <url>\n" +
                "  2. Is Playwright installed? Run: bun add playwright && bunx playwright install chromium\n" +
                "  3. Is the selector valid? Check the page structure first.",
              metadata: {
                url: args.url,
                error: message,
              },
            }
          }
        },
      }),
    },
  }
}
