import type { Plugin } from "@opencode-ai/plugin"

/**
 * Metrics Collector — records tool usage AND token economics for all agents.
 *
 * Records per-tool-call:
 *  - tool name, agent name, session ID
 *  - duration (ms), success/failure
 * Records per-step (message.part.updated step-finish):
 *  - tokens (input/output/reasoning/cache read/write), cost, model
 * Records compaction events (auto flag) — each compaction rebuilds the
 * history and resets the prompt-cache prefix.
 *
 * On session.idle, writes a summary (incl. cache hit rate) to the session
 * log. Metrics are stored in ~/.config/opencode/.metrics/ as JSONL files.
 *
 * No external dependencies. Uses Bun's built-in APIs.
 */

import { mkdirSync, appendFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const METRICS_DIR = join(homedir(), ".config", "opencode", ".metrics")

interface ToolCall {
  timestamp: string
  tool: string
  agent: string
  sessionId: string
  durationMs: number
  success: boolean
  error?: string
}

interface SessionMetrics {
  sessionId: string
  startTime: string
  endTime: string
  totalCalls: number
  successCount: number
  failureCount: number
  totalDurationMs: number
  callsByTool: Record<string, number>
  callsByAgent: Record<string, number>
  steps: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cacheRead: number
    cacheWrite: number
  }
  cost: number
  // cacheRead / (input + cacheRead) — share of fresh input served from the
  // provider's prompt cache. Low values mean the prefix keeps changing
  // (agent switches, compactions, dynamic injections).
  cacheHitRate: number
  compactions: number
  inputTokensByAgent: Record<string, number>
}

interface SessionTokenState {
  steps: number
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  compactions: number
  inputByAgent: Record<string, number>
}

const EMPTY_TOKEN_STATE: SessionTokenState = {
  steps: 0,
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  compactions: 0,
  inputByAgent: {},
}

// In-memory store for current session
const sessionCalls: Map<string, ToolCall[]> = new Map()
const sessionStartTimes: Map<string, string> = new Map()
const toolStartTimes: Map<string, number> = new Map()
// Current agent per session (from "agent" message parts).
const sessionAgents: Map<string, string> = new Map()
// provider/model per assistant message ID (from message.updated).
const sessionModels: Map<string, string> = new Map()
const sessionTokenState: Map<string, SessionTokenState> = new Map()

function tokenStateFor(sessionId: string): SessionTokenState {
  let state = sessionTokenState.get(sessionId)
  if (!state) {
    state = { ...EMPTY_TOKEN_STATE, inputByAgent: {} }
    sessionTokenState.set(sessionId, state)
  }
  return state
}

function ensureMetricsDir(): void {
  if (!existsSync(METRICS_DIR)) {
    mkdirSync(METRICS_DIR, { recursive: true })
  }
}

function appendMetric(record: Record<string, unknown>): void {
  ensureMetricsDir()
  const dateStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const filePath = join(METRICS_DIR, `metrics-${dateStr}.jsonl`)
  appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8")
}

function summarizeSession(sessionId: string): SessionMetrics | null {
  const calls = sessionCalls.get(sessionId)
  const tokenState = sessionTokenState.get(sessionId)
  if ((!calls || calls.length === 0) && !tokenState) return null

  const callsByTool: Record<string, number> = {}
  const callsByAgent: Record<string, number> = {}
  let successCount = 0
  let totalDurationMs = 0

  for (const call of calls ?? []) {
    callsByTool[call.tool] = (callsByTool[call.tool] || 0) + 1
    callsByAgent[call.agent] = (callsByAgent[call.agent] || 0) + 1
    if (call.success) successCount++
    totalDurationMs += call.durationMs
  }

  const t = tokenState || EMPTY_TOKEN_STATE
  const cacheDenominator = t.input + t.cacheRead

  return {
    sessionId,
    startTime: sessionStartTimes.get(sessionId) || calls?.[0]?.timestamp || new Date().toISOString(),
    endTime: calls?.[calls.length - 1]?.timestamp || new Date().toISOString(),
    totalCalls: calls?.length || 0,
    successCount,
    failureCount: (calls?.length || 0) - successCount,
    totalDurationMs,
    callsByTool,
    callsByAgent,
    steps: t.steps,
    tokens: {
      input: t.input,
      output: t.output,
      reasoning: t.reasoning,
      cacheRead: t.cacheRead,
      cacheWrite: t.cacheWrite,
    },
    cost: t.cost,
    cacheHitRate: cacheDenominator > 0 ? t.cacheRead / cacheDenominator : 0,
    compactions: t.compactions,
    inputTokensByAgent: t.inputByAgent,
  }
}

export const MetricsPlugin: Plugin = async ({ client }) => {
  return {
    "tool.execute.before": async (input: any, output: any) => {
      const key = `${output.sessionID || "default"}:${output.messageID || "0"}:${input.tool}`
      toolStartTimes.set(key, Date.now())

      // Track session start
      const sessionId = output.sessionID || "default"
      if (!sessionStartTimes.has(sessionId)) {
        sessionStartTimes.set(sessionId, new Date().toISOString())
      }
    },

    "tool.execute.after": async (input: any, output: any) => {
      const sessionId = output.sessionID || "default"
      const key = `${sessionId}:${output.messageID || "0"}:${input.tool}`
      const startTime = toolStartTimes.get(key)
      toolStartTimes.delete(key)

      const call: ToolCall = {
        timestamp: new Date().toISOString(),
        tool: input.tool,
        agent: (output as any).agent || sessionAgents.get(sessionId) || "unknown",
        sessionId,
        durationMs: startTime ? Date.now() - startTime : 0,
        success: !(output as any).error,
        error: (output as any).error?.message,
      }

      // Store in memory
      if (!sessionCalls.has(sessionId)) {
        sessionCalls.set(sessionId, [])
      }
      sessionCalls.get(sessionId)!.push(call)

      // Persist to JSONL
      appendMetric({ kind: "tool", ...call })
    },

    event: async ({ event }) => {
      const e = event as any

      // Per-step token economics + agent/compaction attribution. All three
      // arrive as message parts on message.part.updated.
      if (e.type === "message.part.updated") {
        const part = e.properties?.part
        if (!part?.type) return
        const sessionId = part.sessionID || "default"

        if (part.type === "agent") {
          sessionAgents.set(sessionId, part.name || "unknown")
          return
        }

        if (part.type === "compaction") {
          tokenStateFor(sessionId).compactions++
          appendMetric({
            kind: "compaction",
            timestamp: new Date().toISOString(),
            sessionId,
            auto: !!part.auto,
          })
          return
        }

        if (part.type === "step-finish") {
          const t = part.tokens || {}
          const cache = t.cache || {}
          const agent = sessionAgents.get(sessionId) || "unknown"
          const state = tokenStateFor(sessionId)
          state.steps++
          state.input += t.input || 0
          state.output += t.output || 0
          state.reasoning += t.reasoning || 0
          state.cacheRead += cache.read || 0
          state.cacheWrite += cache.write || 0
          state.cost += part.cost || 0
          state.inputByAgent[agent] = (state.inputByAgent[agent] || 0) + (t.input || 0)
          appendMetric({
            kind: "step",
            timestamp: new Date().toISOString(),
            sessionId,
            messageID: part.messageID,
            agent,
            model: sessionModels.get(part.messageID),
            cost: part.cost || 0,
            tokens: {
              input: t.input || 0,
              output: t.output || 0,
              reasoning: t.reasoning || 0,
              cacheRead: cache.read || 0,
              cacheWrite: cache.write || 0,
            },
          })
        }
        return
      }

      // Model attribution: assistant messages carry provider/model IDs.
      if (e.type === "message.updated") {
        const info = e.properties?.info
        if (info?.role === "assistant" && info.modelID) {
          sessionModels.set(info.id, `${info.providerID}/${info.modelID}`)
        }
        return
      }

      if (e.type !== "session.idle") return
      // SDK shape: properties.sessionID (older hosts nested properties.session.id).
      const sessionId = e.properties?.sessionID || e.properties?.session?.id || "default"
      const summary = summarizeSession(sessionId)
      if (!summary) return

      // Write summary file
      ensureMetricsDir()
      const summaryPath = join(METRICS_DIR, `session-${sessionId}.json`)
      writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8")

      // Log summary
      await client.app.log({
        body: {
          service: "metrics",
          level: "info",
          message: `Session ${sessionId} metrics: ${summary.totalCalls} calls, ${summary.steps} steps, in=${summary.tokens.input} out=${summary.tokens.output} cacheRead=${summary.tokens.cacheRead} hit=${(summary.cacheHitRate * 100).toFixed(1)}% cost=$${summary.cost.toFixed(4)} compactions=${summary.compactions} ${(summary.totalDurationMs / 1000).toFixed(1)}s total`,
          extra: summary as unknown as Record<string, unknown>,
        },
      })

      // Clean up memory
      sessionCalls.delete(sessionId)
      sessionStartTimes.delete(sessionId)
      sessionTokenState.delete(sessionId)
    },
  }
}
