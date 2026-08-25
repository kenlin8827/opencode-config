/**
 * Markdown to Word (DOCX) Plugin — Unit & Integration Tests (Pure TypeScript)
 *
 * Validates:
 *   - CSS stylesheet parser (color normalization, font sizes, custom variables)
 *   - Mermaid preprocessor detection & rendering
 *   - Reference template path resolution
 *   - convertSingleFile end-to-end DOCX generation with CSS stylesheets & Mermaid diagrams
 *   - Error log writing and friendly error message formatting
 *   - Input error handling for non-existent files
 *
 * Run: bun tests/test-md-to-docx-unit.ts
 */

import { existsSync, writeFileSync, unlinkSync, statSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  checkPandoc,
  checkNode,
  checkChromium,
  convertSingleFile,
  writeErrorLog,
  getProjectLogDir,
  formatFriendlyErrorMessage,
  getReferenceDocxPath,
} from "../plugins/md-to-docx/engine"
import { hasMermaidBlocks, preprocessMermaidInMarkdown, cleanupMermaidTempImages, parseMermaidThemeFromCss } from "../plugins/shared/mermaid-renderer"
import { parseCssToTheme, normalizeHexColor, parseFontSizeToHalfPoints, loadThemeFromCssFile } from "../plugins/md-to-docx/style-parser"

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✅ ${msg}`)
    passed++
  } else {
    console.error(`  ❌ ${msg}`)
    failed++
  }
}

function section(title: string): void {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${"═".repeat(60)}`)
}

async function runTests() {
  section("1. Environment & Asset Detection Tests")

  const refPath = getReferenceDocxPath()
  assert(existsSync(refPath), `Reference template exists on disk (${refPath})`)

  const pandocOk = checkPandoc()
  console.log(`  ℹ️ Pandoc available: ${pandocOk}`)
  assert(typeof pandocOk === "boolean", "checkPandoc returns boolean")

  const nodeOk = checkNode()
  console.log(`  ℹ️ Node available: ${nodeOk}`)
  assert(typeof nodeOk === "boolean", "checkNode returns boolean")

  const chromiumOk = checkChromium()
  console.log(`  ℹ️ Chromium available: ${chromiumOk}`)
  assert(typeof chromiumOk === "boolean", "checkChromium returns boolean")

  section("2. CSS Stylesheet Parser Tests")

  assert(normalizeHexColor("#2E75B6") === "2E75B6", "Normalizes 6-digit hex color")
  assert(normalizeHexColor("#fff") === "FFFFFF", "Normalizes 3-digit hex color")
  assert(normalizeHexColor("rgb(0, 128, 0)") === "008000", "Normalizes rgb color")
  assert(parseFontSizeToHalfPoints("9pt") === "18", "Converts 9pt to 18 half-points")
  assert(parseFontSizeToHalfPoints("12pt") === "24", "Converts 12pt to 24 half-points")

  const sampleCss = `
:root {
  --page-content-width: 8500;
  --primary-color: #0055A5;
  --header-text-color: #FAFAFA;
  --table-border-color: #123456;
  --table-border-size: 1pt;
  --table-header-height: 650;
  --table-row-height: 500;
  --table-stripe-bg: #EBF3FC;
  --code-bg: #EAEAEA;
  --code-border-size: 0.5pt;
  --code-line-spacing: 240;
  --font-body: "Times New Roman", "SimSun", serif;
  --font-heading: "Arial", "SimHei", sans-serif;
  --font-code: "JetBrains Mono", "Microsoft YaHei", monospace;
  --font-body-size: 11pt;
  --font-h1-size: 24pt;
  --code-font-size: 10pt;
  --toc-title: "目 录";
  --heading1-pagebreak: false;
  --clean-underlines: true;
}

table th {
  background-color: #008080;
  color: #FFFFFF;
}

h1 {
  text-align: left;
  color: #CC0000;
}
`
  const parsedTheme = parseCssToTheme(sampleCss)
  assert(parsedTheme.pageContentWidthTwips === 8500, "pageContentWidthTwips parsed")
  assert(parsedTheme.primaryColor === "008080", "Selector override for primaryColor works")
  assert(parsedTheme.headerTextColor === "FFFFFF", "Header text color parsed")
  assert(parsedTheme.tableBorderColor === "123456", "Table border color parsed")
  assert(parsedTheme.tableBorderSize === "8", "Table border size 1pt converted to 8 (1/8 pt)")
  assert(parsedTheme.tableHeaderHeight === "650", "Table header height parsed")
  assert(parsedTheme.tableRowHeight === "500", "Table row height parsed")
  assert(parsedTheme.tableStripeBg === "EBF3FC", "Table stripe background parsed")
  assert(parsedTheme.codeBg === "EAEAEA", "Custom code background parsed from var")
  assert(parsedTheme.codeBorderSize === "4", "Code border size 0.5pt converted to 4")
  assert(parsedTheme.fontBodyAscii === "Times New Roman", "Body Western font parsed as Times New Roman")
  assert(parsedTheme.fontBodyEastAsia === "SimSun", "Body Chinese font parsed as SimSun")
  assert(parsedTheme.fontBodySizeHalfPt === "22", "Body 11pt converted to 22 half-pts")
  assert(parsedTheme.fontHeadingAscii === "Arial", "Heading Western font parsed as Arial")
  assert(parsedTheme.fontHeadingEastAsia === "SimHei", "Heading Chinese font parsed as SimHei")
  assert(parsedTheme.fontH1SizeHalfPt === "48", "H1 24pt converted to 48 half-pts")
  assert(parsedTheme.fontCodeAscii === "JetBrains Mono", "Code Western font parsed as JetBrains Mono")
  assert(parsedTheme.fontCodeEastAsia === "Microsoft YaHei", "Code Chinese font parsed as Microsoft YaHei")
  assert(parsedTheme.codeFontSizeHalfPt === "20", "Custom 10pt code font size converted to 20")
  assert(parsedTheme.h1Align === "left", "H1 text-align parsed")
  assert(parsedTheme.h1Color === "CC0000", "H1 color parsed")
  assert(parsedTheme.tocTitle === "目 录", "Custom TOC title parsed")
  assert(parsedTheme.heading1PageBreak === false, "Heading1 pagebreak parsed as false")
  assert(parsedTheme.cleanUnderlines === true, "Clean underlines parsed as true")

  section("3. Mermaid Preprocessor Tests")

  const sampleMermaidCss = `
:root {
  --mermaid-theme: neutral;
  --mermaid-primary-color: #EBF3FC;
  --mermaid-line-color: #FF0000;
  --mermaid-node-stroke-width: 2px;
}
`
  const mTheme = parseMermaidThemeFromCss(sampleMermaidCss)
  assert(mTheme.theme === "neutral", "Mermaid theme parsed from CSS")
  assert(mTheme.primaryColor === "#EBF3FC", "Mermaid primary color parsed from CSS")
  assert(mTheme.lineColor === "#FF0000", "Mermaid line color parsed from CSS")
  assert(mTheme.nodeStrokeWidth === "2px", "Mermaid stroke width parsed from CSS")

  const mdWithMermaid = `# Architecture Overview\n\n\`\`\`mermaid\ngraph TD;\n  A[Client] --> B[Server];\n\`\`\`\n`
  assert(hasMermaidBlocks(mdWithMermaid), "hasMermaidBlocks correctly identifies mermaid blocks")
  assert(!hasMermaidBlocks("# Normal Markdown"), "hasMermaidBlocks returns false when no mermaid blocks")

  if (chromiumOk) {
    const renderRes = await preprocessMermaidInMarkdown(mdWithMermaid)
    assert(renderRes.tempImages.length === 1, "preprocessMermaidInMarkdown rendered 1 diagram")
    assert(renderRes.content.includes("![Mermaid Diagram]"), "Markdown block replaced with image syntax")
    assert(existsSync(renderRes.tempImages[0]), "Rendered diagram PNG exists on disk")
    cleanupMermaidTempImages(renderRes.tempImages)
    assert(!existsSync(renderRes.tempImages[0]), "cleanupMermaidTempImages safely removes temp files")
  } else {
    console.log("  ⚠️ Skipping live mermaid render test: Chromium binary not found.")
  }

  section("4. Error Logging & Friendly Error Message Tests")

  const testLogDir = join(tmpdir(), `md-to-docx-test-${Date.now()}`)
  mkdirSync(testLogDir, { recursive: true })

  const logFile = writeErrorLog("testAction", new Error("Simulated unit test failure"), "Details: testing error logging", testLogDir)
  assert(existsSync(logFile), "writeErrorLog creates log file on disk")
  assert(logFile.includes("md-to-docx-"), "Log file has expected md-to-docx prefix")

  const friendlyPandocErr = formatFriendlyErrorMessage("demo.md", "pandoc: command not found", logFile, testLogDir)
  assert(friendlyPandocErr.includes("Pandoc parser is not installed"), "Detects pandoc missing error")
  assert(friendlyPandocErr.includes("winget install JohnMacFarlane.Pandoc"), "Includes Pandoc installation guide")

  section("5. Non-Existent Input Handling")

  try {
    await convertSingleFile({ inputPath: "non-existent-file-xyz.md" })
    assert(false, "Should throw for non-existent file")
  } catch (err) {
    assert((err as Error).message.includes("not found"), "Throws clear error for missing input")
  }

  section("6. End-to-End Markdown + CSS Theme + Mermaid to DOCX Conversion")

  if (pandocOk) {
    const testMdPath = join(testLogDir, "sample-document.md")
    const testDocxPath = join(testLogDir, "sample-document.docx")
    const testCssPath = join(testLogDir, "custom-style.css")

    const sampleCssContent = `
:root {
  --primary-color: #1F4E78;
  --table-border-color: #8EA9DB;
  --code-bg: #F2F4F7;
  --code-font-family: "Consolas";
  --code-font-size: 9.5pt;
}
`
    writeFileSync(testCssPath, sampleCssContent, "utf8")

    const sampleMd = `# 项目技术架构设计规范

> [!NOTE]
> 本文用于验证纯 TypeScript Markdown 转 Word (DOCX) 渲染、CSS 样式表与 Mermaid 排版引擎。

## 1. 核心架构流程图

\`\`\`mermaid
graph TD
  A[Markdown File] --> B[Pure TS Preprocessor]
  B --> C[Mermaid Vector Graphics]
  C --> D[Pandoc DOCX Engine]
  D --> E[CSS Theme OpenXML Beautification]
\`\`\`

## 2. 核心特性矩阵

| 特性分类 | 功能描述 | 状态 | 责任团队 |
| :--- | :--- | :--- | :--- |
| **样式表** | 支持标准 CSS 主题配置与变量覆盖 | ✅ 已支持 | 研发效能部 |
| **Mermaid** | 纯 TS 原生渲染 300DPI 图表 | ✅ 已支持 | 架构组 |
| **智能表格** | 100% 满宽自适应 + 深蓝底纹表头 | ✅ 已支持 | 架构组 |
| **代码高亮** | 等宽 Consolas 字体 + 浅灰背景边框 | ✅ 已支持 | 工具链组 |

## 3. 核心架构代码样例

\`\`\`typescript
export interface DocxConversionOptions {
  inputPath: string
  outputPath?: string
  stylePath?: string
}

export async function convertSingleFile(opts: DocxConversionOptions): Promise<void> {
  console.log("Rendering DOCX with CSS stylesheet and pure TS engine...")
}
\`\`\`
`

    writeFileSync(testMdPath, sampleMd, "utf8")
    assert(existsSync(testMdPath), "Sample markdown fixture written")

    const result = await convertSingleFile(
      {
        inputPath: testMdPath,
        outputPath: testDocxPath,
        stylePath: testCssPath,
        tocDepth: 2,
      },
      testLogDir,
    )

    assert(existsSync(result.outputPath), "Output DOCX file was generated")
    assert(result.fileSizeBytes > 1000, `Output DOCX has valid content size (${result.fileSizeBytes} bytes)`)

    try {
      unlinkSync(testMdPath)
      unlinkSync(testDocxPath)
      unlinkSync(testCssPath)
    } catch {}
  } else {
    console.log("  ⚠️ Skipping E2E test: pandoc not found in test environment.")
  }

  section("Test Summary")
  console.log(`  Passed: ${passed}`)
  console.log(`  Failed: ${failed}`)

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered an error:", err)
  process.exit(1)
})
