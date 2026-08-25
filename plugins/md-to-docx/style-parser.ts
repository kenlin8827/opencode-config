import { existsSync, readFileSync } from "node:fs"

export interface DocxTheme {
  // 1. 页面与版心
  pageContentWidthTwips: number
  pageMarginTop: string
  pageMarginBottom: string
  pageMarginLeft: string
  pageMarginRight: string

  // 2. 色彩体系
  primaryColor: string         // e.g. "1E3A8A" (Royal Deep Navy)
  headerTextColor: string      // e.g. "FFFFFF"
  textMainColor: string        // e.g. "1E293B"
  textMutedColor: string       // e.g. "64748B"
  h1Color: string              // e.g. "0F172A"
  h2Color: string              // e.g. "1E3A8A"
  h3Color: string              // e.g. "334155"

  tableBorderColor: string     // e.g. "CBD5E1"
  tableStripeBg: string        // e.g. "F8FAFC"
  codeBg: string               // e.g. "F8FAFC"
  codeBorderColor: string      // e.g. "E2E8F0"
  codeTextColor: string        // e.g. "0F172A"
  blockquoteBorderColor: string// e.g. "3B82F6"
  blockquoteBg: string         // e.g. "F0F7FF"

  // 3. 中英文双字体体系
  fontBodyAscii: string        // e.g. "Segoe UI"
  fontBodyEastAsia: string     // e.g. "Microsoft YaHei"
  fontBodySizeHalfPt: string   // e.g. "21" (10.5pt)

  fontHeadingAscii: string     // e.g. "Segoe UI Semibold"
  fontHeadingEastAsia: string  // e.g. "Microsoft YaHei"
  fontH1SizeHalfPt: string     // e.g. "44" (22pt)
  fontH2SizeHalfPt: string     // e.g. "30" (15pt)
  fontH3SizeHalfPt: string     // e.g. "25" (12.5pt)

  fontCodeAscii: string        // e.g. "Cascadia Code"
  fontCodeEastAsia: string     // e.g. "Microsoft YaHei"
  codeFontSizeHalfPt: string   // e.g. "19" (9.5pt)

  // 4. 表格排版度量
  tableWidthPct: string        // e.g. "5000" (100%)
  tableAlign: "center" | "left" | "right"
  tableHeaderHeight: string    // e.g. "620"
  tableRowHeight: string       // e.g. "480"
  tableBorderSize: string      // e.g. "4" (0.5pt)
  tableCellVAlign: "center" | "top" | "bottom"
  tableMinColWidth: number     // e.g. 1000

  // 5. 代码块卡片度量
  codeBorderSize: string       // e.g. "4" (0.5pt)
  codeBorderSpace: string      // e.g. "4"
  codeLineSpacing: string      // e.g. "240"

  // 6. 目录、封面与分页
  tocTitle: string             // e.g. "目录"
  tocAlign: "center" | "left" | "right"
  h1Align: "center" | "left" | "right"
  heading1PageBreak: boolean   // 正文中每个 H1 之前是否换页
  heading2PageBreak: boolean   // H2 之前是否换页
  metaSpacingBefore: string    // e.g. "400"
  cleanUnderlines: boolean     // 是否清洗下划线
}

export const DEFAULT_DOCX_THEME: DocxTheme = {
  pageContentWidthTwips: 8296,
  pageMarginTop: "1440",
  pageMarginBottom: "1440",
  pageMarginLeft: "1805",
  pageMarginRight: "1805",

  primaryColor: "1E3A8A",
  headerTextColor: "FFFFFF",
  textMainColor: "1E293B",
  textMutedColor: "64748B",
  h1Color: "0F172A",
  h2Color: "1E3A8A",
  h3Color: "334155",

  tableBorderColor: "CBD5E1",
  tableStripeBg: "F8FAFC",
  codeBg: "F8FAFC",
  codeBorderColor: "E2E8F0",
  codeTextColor: "0F172A",
  blockquoteBorderColor: "3B82F6",
  blockquoteBg: "F0F7FF",

  fontBodyAscii: "Times New Roman",
  fontBodyEastAsia: "SimSun",
  fontBodySizeHalfPt: "21",

  fontHeadingAscii: "Segoe UI Semibold",
  fontHeadingEastAsia: "SimHei",
  fontH1SizeHalfPt: "44",
  fontH2SizeHalfPt: "30",
  fontH3SizeHalfPt: "25",

  fontCodeAscii: "Cascadia Code",
  fontCodeEastAsia: "Microsoft YaHei",
  codeFontSizeHalfPt: "19",

  tableWidthPct: "5000",
  tableAlign: "center",
  tableHeaderHeight: "420",
  tableRowHeight: "380",
  tableBorderSize: "4",
  tableCellVAlign: "center",
  tableMinColWidth: 1000,

  codeBorderSize: "4",
  codeBorderSpace: "4",
  codeLineSpacing: "240",

  tocTitle: "目录",
  tocAlign: "center",
  h1Align: "center",
  heading1PageBreak: true,
  heading2PageBreak: false,
  metaSpacingBefore: "400",
  cleanUnderlines: true,
}

const KNOWN_CHINESE_FONTS = new Set([
  "simsun", "songti sc", "source han serif sc", "noto serif cjk sc", "songti", "stsong", "宋体", "新宋体",
  "simhei", "heiti sc", "pingfang sc", "source han sans sc", "noto sans cjk sc", "heiti", "stheiti", "黑体",
  "microsoft yahei", "microsoft yahei ui", "yahei", "微软雅黑",
  "dengxian", "等线", "kaiti", "楷体", "fangsong", "仿宋",
])

export function extractAsciiAndEastAsiaFonts(
  fontListStr: string,
  defaultAscii: string,
  defaultEastAsia: string,
): { ascii: string; eastAsia: string } {
  if (!fontListStr) return { ascii: defaultAscii, eastAsia: defaultEastAsia }

  const families = fontListStr
    .split(",")
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)

  let ascii = defaultAscii
  let eastAsia = defaultEastAsia
  let foundAscii = false
  let foundEastAsia = false

  for (const f of families) {
    const lower = f.toLowerCase()
    if (lower === "serif" || lower === "sans-serif" || lower === "monospace") {
      continue
    }

    if (KNOWN_CHINESE_FONTS.has(lower) || /[\u4e00-\u9fa5]/.test(f)) {
      if (!foundEastAsia) {
        eastAsia = f
        foundEastAsia = true
      }
    } else {
      if (!foundAscii) {
        ascii = f
        foundAscii = true
      }
    }
  }

  return { ascii, eastAsia }
}

/**
 * Normalize CSS color strings to Word 6-character hex uppercase.
 */
export function normalizeHexColor(rawColor: string, fallback: string = "000000"): string {
  if (!rawColor) return fallback
  let clean = rawColor.trim().replace(/^['"]|['"]$/g, "")

  if (clean.startsWith("#")) {
    clean = clean.slice(1)
    if (clean.length === 3) {
      clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
    }
    if (/^[0-9A-Fa-f]{6}$/.test(clean)) {
      return clean.toUpperCase()
    }
  }

  const rgbMatch = clean.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i)
  if (rgbMatch) {
    const r = Math.min(255, parseInt(rgbMatch[1], 10)).toString(16).padStart(2, "0")
    const g = Math.min(255, parseInt(rgbMatch[2], 10)).toString(16).padStart(2, "0")
    const b = Math.min(255, parseInt(rgbMatch[3], 10)).toString(16).padStart(2, "0")
    return (r + g + b).toUpperCase()
  }

  const namedColors: Record<string, string> = {
    white: "FFFFFF",
    black: "000000",
    red: "FF0000",
    blue: "0000FF",
    green: "008000",
    gray: "808080",
    grey: "808080",
    lightgray: "D3D3D3",
  }
  const named = namedColors[clean.toLowerCase()]
  if (named) return named

  return fallback
}

/**
 * Convert CSS font size (9pt, 12pt, 14px) to Word half-points string (9pt -> 18).
 */
export function parseFontSizeToHalfPoints(rawSize: string, fallback: string = "18"): string {
  if (!rawSize) return fallback
  const clean = rawSize.trim().toLowerCase()

  const ptMatch = clean.match(/^([\d.]+)\s*pt$/)
  if (ptMatch) {
    const pt = parseFloat(ptMatch[1])
    return String(Math.round(pt * 2))
  }

  const pxMatch = clean.match(/^([\d.]+)\s*px$/)
  if (pxMatch) {
    const px = parseFloat(pxMatch[1])
    return String(Math.round(px * 1.5))
  }

  if (/^\d+$/.test(clean)) {
    return clean
  }

  return fallback
}

/**
 * Convert border size (0.5pt, 1pt, 4) to Word 1/8 pt integer string (0.5pt -> 4, 1pt -> 8).
 */
export function parseBorderSize(rawSize: string, fallback: string = "4"): string {
  if (!rawSize) return fallback
  const clean = rawSize.trim().toLowerCase()

  const ptMatch = clean.match(/^([\d.]+)\s*pt$/)
  if (ptMatch) {
    const pt = parseFloat(ptMatch[1])
    return String(Math.round(pt * 8))
  }

  if (/^\d+$/.test(clean)) {
    return clean
  }

  return fallback
}

/**
 * Parse CSS string or file content into a typed DocxTheme object.
 */
export function parseCssToTheme(cssContent: string, baseTheme: DocxTheme = DEFAULT_DOCX_THEME): DocxTheme {
  const theme: DocxTheme = { ...baseTheme }

  // 1. Extract CSS variables in :root or anywhere
  const varRegex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g
  let vMatch: RegExpExecArray | null
  const vars: Record<string, string> = {}

  while ((vMatch = varRegex.exec(cssContent)) !== null) {
    const name = vMatch[1].trim().toLowerCase()
    const val = vMatch[2].trim()
    vars[name] = val
  }

  function resolveVar(val: string): string {
    const m = val.match(/var\s*\(\s*--([a-zA-Z0-9_-]+)\s*\)/i)
    if (m && vars[m[1].toLowerCase()]) {
      return vars[m[1].toLowerCase()]
    }
    return val
  }

  // 1. 页面与版心
  if (vars["page-content-width"]) theme.pageContentWidthTwips = parseInt(vars["page-content-width"], 10) || theme.pageContentWidthTwips
  if (vars["page-margin-top"]) theme.pageMarginTop = vars["page-margin-top"].trim()
  if (vars["page-margin-bottom"]) theme.pageMarginBottom = vars["page-margin-bottom"].trim()
  if (vars["page-margin-left"]) theme.pageMarginLeft = vars["page-margin-left"].trim()
  if (vars["page-margin-right"]) theme.pageMarginRight = vars["page-margin-right"].trim()

  // 2. 色彩
  if (vars["primary-color"]) theme.primaryColor = normalizeHexColor(vars["primary-color"], theme.primaryColor)
  if (vars["header-text-color"]) theme.headerTextColor = normalizeHexColor(vars["header-text-color"], theme.headerTextColor)
  if (vars["text-main-color"]) theme.textMainColor = normalizeHexColor(vars["text-main-color"], theme.textMainColor)
  if (vars["text-muted-color"]) theme.textMutedColor = normalizeHexColor(vars["text-muted-color"], theme.textMutedColor)
  if (vars["h1-color"]) theme.h1Color = normalizeHexColor(vars["h1-color"], theme.h1Color)
  if (vars["h2-color"]) theme.h2Color = normalizeHexColor(vars["h2-color"], theme.h2Color)
  if (vars["h3-color"]) theme.h3Color = normalizeHexColor(vars["h3-color"], theme.h3Color)

  if (vars["table-border-color"]) theme.tableBorderColor = normalizeHexColor(vars["table-border-color"], theme.tableBorderColor)
  if (vars["table-stripe-bg"]) theme.tableStripeBg = normalizeHexColor(vars["table-stripe-bg"], theme.tableStripeBg)
  if (vars["code-bg"]) theme.codeBg = normalizeHexColor(vars["code-bg"], theme.codeBg)
  if (vars["code-border-color"]) theme.codeBorderColor = normalizeHexColor(vars["code-border-color"], theme.codeBorderColor)
  if (vars["code-text-color"]) theme.codeTextColor = normalizeHexColor(vars["code-text-color"], theme.codeTextColor)
  if (vars["blockquote-border-color"]) theme.blockquoteBorderColor = normalizeHexColor(vars["blockquote-border-color"], theme.blockquoteBorderColor)
  if (vars["blockquote-bg"]) theme.blockquoteBg = normalizeHexColor(vars["blockquote-bg"], theme.blockquoteBg)

  // 3. 双字体体系与字号
  if (vars["font-body-ascii"]) theme.fontBodyAscii = vars["font-body-ascii"].replace(/['"]/g, "").trim()
  if (vars["font-body-eastasia"]) theme.fontBodyEastAsia = vars["font-body-eastasia"].replace(/['"]/g, "").trim()
  if (vars["font-heading-ascii"]) theme.fontHeadingAscii = vars["font-heading-ascii"].replace(/['"]/g, "").trim()
  if (vars["font-heading-eastasia"]) theme.fontHeadingEastAsia = vars["font-heading-eastasia"].replace(/['"]/g, "").trim()
  if (vars["font-code-ascii"]) theme.fontCodeAscii = vars["font-code-ascii"].replace(/['"]/g, "").trim()
  if (vars["font-code-eastasia"]) theme.fontCodeEastAsia = vars["font-code-eastasia"].replace(/['"]/g, "").trim()

  if (vars["font-body"]) {
    const pair = extractAsciiAndEastAsiaFonts(vars["font-body"], theme.fontBodyAscii, theme.fontBodyEastAsia)
    theme.fontBodyAscii = pair.ascii
    theme.fontBodyEastAsia = pair.eastAsia
  }
  if (vars["font-heading"]) {
    const pair = extractAsciiAndEastAsiaFonts(vars["font-heading"], theme.fontHeadingAscii, theme.fontHeadingEastAsia)
    theme.fontHeadingAscii = pair.ascii
    theme.fontHeadingEastAsia = pair.eastAsia
  }
  if (vars["font-code"] || vars["code-font-family"]) {
    const val = vars["font-code"] || vars["code-font-family"]
    const pair = extractAsciiAndEastAsiaFonts(val, theme.fontCodeAscii, theme.fontCodeEastAsia)
    theme.fontCodeAscii = pair.ascii
    theme.fontCodeEastAsia = pair.eastAsia
  }

  if (vars["font-body-size"]) theme.fontBodySizeHalfPt = parseFontSizeToHalfPoints(vars["font-body-size"], theme.fontBodySizeHalfPt)
  if (vars["font-h1-size"]) theme.fontH1SizeHalfPt = parseFontSizeToHalfPoints(vars["font-h1-size"], theme.fontH1SizeHalfPt)
  if (vars["font-h2-size"]) theme.fontH2SizeHalfPt = parseFontSizeToHalfPoints(vars["font-h2-size"], theme.fontH2SizeHalfPt)
  if (vars["font-h3-size"]) theme.fontH3SizeHalfPt = parseFontSizeToHalfPoints(vars["font-h3-size"], theme.fontH3SizeHalfPt)
  if (vars["code-font-size"]) theme.codeFontSizeHalfPt = parseFontSizeToHalfPoints(vars["code-font-size"], theme.codeFontSizeHalfPt)

  // 4. 表格排版度量
  if (vars["table-width-pct"]) theme.tableWidthPct = vars["table-width-pct"].trim()
  if (vars["table-align"]) {
    const a = vars["table-align"].toLowerCase().trim()
    if (a === "center" || a === "left" || a === "right") theme.tableAlign = a
  }
  if (vars["table-header-height"] || vars["header-height"] || vars["header-row-height"]) {
    theme.tableHeaderHeight = (vars["table-header-height"] || vars["header-height"] || vars["header-row-height"]).trim()
  }
  if (vars["table-row-height"] || vars["data-row-height"]) {
    theme.tableRowHeight = (vars["table-row-height"] || vars["data-row-height"]).trim()
  }
  if (vars["table-border-size"]) theme.tableBorderSize = parseBorderSize(vars["table-border-size"], theme.tableBorderSize)
  if (vars["table-cell-v-align"]) {
    const va = vars["table-cell-v-align"].toLowerCase().trim()
    if (va === "center" || va === "top" || va === "bottom") theme.tableCellVAlign = va
  }
  if (vars["table-min-col-width"]) theme.tableMinColWidth = parseInt(vars["table-min-col-width"], 10) || theme.tableMinColWidth

  // 5. 代码块卡片度量
  if (vars["code-border-size"]) theme.codeBorderSize = parseBorderSize(vars["code-border-size"], theme.codeBorderSize)
  if (vars["code-border-space"]) theme.codeBorderSpace = vars["code-border-space"].trim()
  if (vars["code-line-spacing"]) theme.codeLineSpacing = vars["code-line-spacing"].trim()

  // 6. 目录、封面与分页
  if (vars["toc-title"]) theme.tocTitle = vars["toc-title"].replace(/['"]/g, "").trim()
  if (vars["toc-align"]) {
    const a = vars["toc-align"].toLowerCase().trim()
    if (a === "center" || a === "left" || a === "right") theme.tocAlign = a
  }
  if (vars["h1-align"] || vars["heading1-align"]) {
    const a = (vars["h1-align"] || vars["heading1-align"]).toLowerCase().trim()
    if (a === "center" || a === "left" || a === "right") theme.h1Align = a
  }
  if (vars["heading1-pagebreak"]) theme.heading1PageBreak = vars["heading1-pagebreak"].trim().toLowerCase() === "true"
  if (vars["heading2-pagebreak"]) theme.heading2PageBreak = vars["heading2-pagebreak"].trim().toLowerCase() === "true"
  if (vars["meta-spacing-before"]) theme.metaSpacingBefore = vars["meta-spacing-before"].trim()
  if (vars["clean-underlines"]) theme.cleanUnderlines = vars["clean-underlines"].trim().toLowerCase() === "true"

  // 2. Extract block rules
  const blockRegex = /([^{]+)\{([^}]+)\}/g
  let bMatch: RegExpExecArray | null

  while ((bMatch = blockRegex.exec(cssContent)) !== null) {
    const selector = bMatch[1].trim().toLowerCase()
    const declarations = bMatch[2].trim()

    const decls: Record<string, string> = {}
    declarations.split(";").forEach((d) => {
      const idx = d.indexOf(":")
      if (idx !== -1) {
        const prop = d.slice(0, idx).trim().toLowerCase()
        const val = resolveVar(d.slice(idx + 1).trim())
        if (prop && val) decls[prop] = val
      }
    })

    if (selector.includes("table th") || selector === "th") {
      if (decls["background-color"] || decls["background"]) {
        theme.primaryColor = normalizeHexColor(decls["background-color"] || decls["background"], theme.primaryColor)
      }
      if (decls["color"]) {
        theme.headerTextColor = normalizeHexColor(decls["color"], theme.headerTextColor)
      }
      if (decls["border-color"]) {
        theme.tableBorderColor = normalizeHexColor(decls["border-color"], theme.tableBorderColor)
      }
    }

    if (selector.includes("pre") || selector.includes("code")) {
      if (decls["background-color"] || decls["background"]) {
        theme.codeBg = normalizeHexColor(decls["background-color"] || decls["background"], theme.codeBg)
      }
      if (decls["border-color"]) {
        theme.codeBorderColor = normalizeHexColor(decls["border-color"], theme.codeBorderColor)
      }
      if (decls["font-family"]) {
        const pair = extractAsciiAndEastAsiaFonts(decls["font-family"], theme.fontCodeAscii, theme.fontCodeEastAsia)
        theme.fontCodeAscii = pair.ascii
        theme.fontCodeEastAsia = pair.eastAsia
      }
      if (decls["font-size"]) {
        theme.codeFontSizeHalfPt = parseFontSizeToHalfPoints(decls["font-size"], theme.codeFontSizeHalfPt)
      }
    }

    if (selector === "h1") {
      if (decls["color"]) {
        theme.h1Color = normalizeHexColor(decls["color"], theme.h1Color)
      }
      if (decls["text-align"]) {
        const align = decls["text-align"].toLowerCase()
        if (align === "center" || align === "left" || align === "right") {
          theme.h1Align = align
        }
      }
    }
  }

  return theme
}

/**
 * Load theme from CSS file path (if not existing, fallback to default theme).
 */
export function loadThemeFromCssFile(filePath?: string): DocxTheme {
  if (filePath && existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, "utf8")
      return parseCssToTheme(content)
    } catch (err) {
      console.warn("[DocxTheme] Failed to parse custom CSS theme:", (err as Error).message)
    }
  }
  return DEFAULT_DOCX_THEME
}
