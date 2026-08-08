import type { Plugin } from "@opencode-ai/plugin"

/**
 * Metrics Collector — automatically records tool usage metrics for all agents.
 *
 * Records per-tool-call:
 *  - tool name, agent name, session ID
 *  - duration (ms), success/failure
 *
 * On session.idle, writes a summary to the session log.
 * Metrics are stored in ~/.config/opencode/.metrics/ as JSONL files.
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
}

// In-memory store for current session
const sessionCalls: Map<string, ToolCall[]> = new Map()
const sessionStartTimes: Map<string, string> = new Map()
const toolStartTimes: Map<string, number> = new Map()

function ensureMetricsDir(): void {
  if (!existsSync(METRICS_DIR)) {
    mkdirSync(METRICS_DIR, { recursive: true })
  }
}

function appendMetric(call: ToolCall): void {
  ensureMetricsDir()
  const dateStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const filePath = join(METRICS_DIR, `metrics-${dateStr}.jsonl`)
  appendFileSync(filePath, JSON.stringify(call) + "\n", "utf-8")
}

function summarizeSession(sessionId: string): SessionMetrics | null {
  const calls = sessionCalls.get(sessionId)
  if (!calls || calls.length === 0) return null

  const callsByTool: Record<string, number> = {}
  const callsByAgent: Record<string, number> = {}
  let successCount = 0
  let totalDurationMs = 0

  for (const call of calls) {
    callsByTool[call.tool] = (callsByTool[call.tool] || 0) + 1
    callsByAgent[call.agent] = (callsByAgent[call.agent] || 0) + 1
    if (call.success) successCount++
    totalDurationMs += call.durationMs
  }

  return {
    sessionId,
    startTime: sessionStartTimes.get(sessionId) || calls[0].timestamp,
    endTime: calls[calls.length - 1].timestamp,
    totalCalls: calls.length,
    successCount,
    failureCount: calls.length - successCount,
    totalDurationMs,
    callsByTool,
    callsByAgent,
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
        agent: (output as any).agent || "unknown",
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
      appendMetric(call)
    },

    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      const sessionId = (event as any).properties?.session?.id || (event as any).session?.id || "default"
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
          message: `Session ${sessionId} metrics: ${summary.totalCalls} calls, ${summary.successCount} success, ${summary.failureCount} failed, ${(summary.totalDurationMs / 1000).toFixed(1)}s total`,
          extra: summary as unknown as Record<string, unknown>,
        },
      })

      // Clean up memory
      sessionCalls.delete(sessionId)
      sessionStartTimes.delete(sessionId)
    },
  }
}
