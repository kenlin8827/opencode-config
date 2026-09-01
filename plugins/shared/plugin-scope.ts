/**
 * Plugin scope gate — runtime half of plugin-scope.json (repo root;
 * installed to the config root, hence the ../../ relative import).
 *
 * opencode has no native plugin-to-agent scoping: every
 * `experimental.chat.system.transform` hook fires for every session, and the
 * hook carries NO agent identifier. Two detection channels:
 *
 *   1. detectAgent(system) — synchronous text identification: matches the
 *      system text against the `identifiers` rules (pure data, no match text
 *      hardcoded here):
 *        { "contains": "<str>" }   — ANY system entry contains <str>
 *        { "startsWith": "<str>" } — the FIRST system entry starts with it
 *      Yields a scope name (identity or state: lite, utility) or null.
 *   2. parentID ground truth — a session with a parent session IS a subagent
 *      step (state "subagent"); resolved via the opencode client, cached per
 *      sessionID. Checked only when text identification finds nothing.
 *
 * Policy lookup: plugins[<pluginId>] ?? plugins["*"], each { deny?, allow? }.
 * Scope entry grammar: "x" matches identity or state x; "x:*" matches state
 * x; "x:y" matches state x with identity y. deny = blacklist; allow =
 * whitelist (presence means only listed entries pass); deny wins. Protocol
 * injectors call:
 *   `if (!await scoped(input, output.system, "<plugin-id>", client)) return`.
 *
 * Fail-open on any error: broken policy degrades to pre-gate behavior, never
 * to lost functionality.
 *
 * Public surface is exactly the gate API (detectAgent, scoped); identifier
 * match texts stay encapsulated in plugin-scope.json. This file lives in
 * plugins/shared/ and is NOT loaded as a plugin itself (only root-level .ts
 * files are), so it may export non-functions.
 */

import scopeFile from "../../plugin-scope.json"

type IdentifierRule = { contains?: unknown; startsWith?: unknown }
type Policy = { deny?: unknown; allow?: unknown }
type ScopeFile = {
  identifiers?: Record<string, IdentifierRule>
  plugins?: Record<string, Policy>
}
type Context = { identity: string | null; state: string | null }

const config: ScopeFile = (scopeFile && typeof scopeFile === "object" ? scopeFile : {}) as ScopeFile

/* ---- text identification (sync) ---- */

function matchesRule(system: Array<unknown> | undefined | null, rule: IdentifierRule): boolean {
  if (!Array.isArray(system)) return false
  if (typeof rule.contains === "string") {
    const needle = rule.contains
    return system.some((s) => typeof s === "string" && s.includes(needle))
  }
  if (typeof rule.startsWith === "string") {
    const first = system[0]
    return typeof first === "string" && first.startsWith(rule.startsWith)
  }
  return false
}

/**
 * Identify the context serving this transform from the system text, or null
 * for ordinary steps (first matching rule wins; rules are mutually exclusive
 * by construction). Returns a scope name (identity or state).
 */
export function detectAgent(system: Array<unknown> | undefined | null): string | null {
  for (const [name, rule] of Object.entries(config.identifiers ?? {})) {
    if (rule && typeof rule === "object" && matchesRule(system, rule)) return name
  }
  return null
}

/* ---- subagent state via session parentID (ground truth, cached) ---- */

type SessionClient = { session?: { get?: (args: any) => Promise<any> } }

const subagentBySession = new Map<string, boolean>()

async function isSubagentSession(sessionID: string | undefined, client: SessionClient | undefined): Promise<boolean> {
  if (!sessionID || !client?.session?.get) return false
  const cached = subagentBySession.get(sessionID)
  if (cached !== undefined) return cached
  let result = false
  try {
    const res = (await client.session.get({ path: { id: sessionID } })) as { data?: { parentID?: unknown } } | undefined
    result = typeof res?.data?.parentID === "string" && res.data.parentID.length > 0
  } catch {
    result = false
  }
  if (subagentBySession.size >= 512) subagentBySession.clear()
  subagentBySession.set(sessionID, result)
  return result
}

/* ---- policy evaluation ---- */

function entryMatches(entry: unknown, ctx: Context): boolean {
  if (typeof entry !== "string" || entry === "") return false
  const sep = entry.indexOf(":")
  if (sep === -1) return ctx.identity === entry || ctx.state === entry
  const state = entry.slice(0, sep)
  const identity = entry.slice(sep + 1)
  if (identity === "*") return ctx.state === state
  return ctx.state === state && ctx.identity === identity
}

/** True when the policy blocks this context (deny wins over allow). */
function policyBlocks(policy: Policy, ctx: Context): boolean {
  const deny = Array.isArray(policy.deny) ? policy.deny : []
  if (deny.some((e) => entryMatches(e, ctx))) return true
  if (Array.isArray(policy.allow)) return !policy.allow.some((e) => entryMatches(e, ctx))
  return false
}

/**
 * True when `pluginId` may inject protocol text for this transform. No
 * detected context, or no applicable policy, means allowed (fail-open).
 */
export async function scoped(
  input: { sessionID?: unknown } | undefined | null,
  system: Array<unknown> | undefined | null,
  pluginId: string,
  client?: SessionClient
): Promise<boolean> {
  try {
    const identity = detectAgent(system)
    let state: string | null = null
    if (identity === null) {
      const sessionID = typeof input?.sessionID === "string" ? input.sessionID : undefined
      if (await isSubagentSession(sessionID, client)) state = "subagent"
    }
    if (identity === null && state === null) return true
    const policy = config.plugins?.[pluginId] ?? config.plugins?.["*"]
    if (!policy || typeof policy !== "object") return true
    return !policyBlocks(policy, { identity, state })
  } catch {
    return true
  }
}
