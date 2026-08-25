/**
 * Hook: command.execute.before — handle `/adr-guard <state>` and `/adr <subcommand>`.
 *
 * Supported commands:
 *   /adr-guard on | off | reset | status
 *   /adr new [layer|scope] <title>
 *   /adr supersede <old-id> <new-title>
 *   /adr tree | map
 *   /adr check | lint
 *   /adr help
 */

import type { PluginInput } from "@opencode-ai/plugin"
import {
  analyzeAdrComplexity,
  checkAdrIntegrity,
  createAdr,
  executeAdrMigration,
  generateDecisionMap,
  planAdrMigration,
  supersedeAdr,
  type AdrLayer,
} from "./adr-engine"
import { announce, announceStatus, announceSwitch } from "./adr-guard-announce"
import {
  ADR_COMMAND,
  clearAdrMode,
  clearState,
  COMMAND_NAME,
  getAdrMode,
  getProjectDir,
  normalizeAdrMode,
  parseResetArg,
  parseStateArg,
  setAdrMode,
  setState,
} from "./adr-guard-config"
import { makeLogger } from "./adr-guard-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeCommandHook(client: PluginInput["client"], handled: () => never) {
  const log: Log = makeLogger(client, "adr-guard")

  return async (input: { command?: string; arguments?: string; sessionID?: string }) => {
    if (input.command === COMMAND_NAME) {
      if (parseResetArg(input.arguments)) {
        const cleared = clearState()
        await log(
          cleared ? "info" : "warn",
          cleared
            ? "adrGuard field removed — reverted to default off"
            : "reset failed — project config not writable",
        )
        await announceStatus(client, input.sessionID)
      } else {
        const state = parseStateArg(input.arguments)
        if (state) {
          const written = setState(state)
          await log(
            written ? "info" : "warn",
            written
              ? `state=${state.toUpperCase()} — project opencode.jsonc written`
              : `state=${state.toUpperCase()} — project config write failed (not writable)`,
          )
          await announceSwitch(client, state, input.sessionID)
        } else {
          await announceStatus(client, input.sessionID)
        }
      }
      return handled()
    }

    if (input.command === ADR_COMMAND) {
      const res = await handleAdrCommand(client, input.arguments || "", input.sessionID, log)
      if (res?.handled) {
        return handled()
      }
      return
    }
  }
}

async function handleAdrCommand(
  client: PluginInput["client"],
  rawArgs: string,
  sessionID: string | undefined,
  log: Log,
): Promise<{ handled: boolean }> {
  const projectDir = getProjectDir()
  const trimmed = rawArgs.trim()
  if (!trimmed || trimmed === "help") {
    const mode = getAdrMode()
    const helpText =
      `### 🏛️ Architecture Decision Records (/adr)\n\n` +
      `Current Mode: **\`${mode}\`**\n\n` +
      `Commands:\n` +
      `- \`/adr [new] [layer/scope] <title> [--empty]\` — Create and auto-draft a new ADR (use --empty for template only)\n` +
      `- \`/adr supersede <old-id> <new-title> [--empty]\` — Supersede an old decision & auto-draft replacement\n` +
      `- \`/adr tree\` — Visualize hierarchical decision tree & Mermaid DAG\n` +
      `- \`/adr check\` — Verify ADR integrity, links, and complexity advice\n` +
      `- \`/adr mode [auto|flat|hierarchical]\` — Configure ADR hierarchy mode\n` +
      `- \`/adr migrate [flat|hierarchical] [--confirm]\` — Plan and restructure ADR architecture\n` +
      `- \`/adr-guard on|off|status\` — Toggle commit guard enforcement\n`
    await announce(client, helpText, "info", sessionID)
    return { handled: true }
  }

  const parts = trimmed.split(/\s+/)
  const sub = parts[0].toLowerCase()
  const rest = trimmed.slice(parts[0].length).trim()

  if (sub === "mode") {
    if (!rest) {
      const mode = getAdrMode()
      await announce(
        client,
        `🏛️ ADR Mode is currently set to: **\`${mode}\`** (in project opencode.jsonc)\nOptions: \`/adr mode auto\`, \`/adr mode flat\`, \`/adr mode hierarchical\``,
        "info",
        sessionID,
      )
      return { handled: true }
    }
    const targetMode = normalizeAdrMode(rest)
    if (!targetMode) {
      await announce(
        client,
        `❌ Invalid ADR mode \`${rest}\`. Valid modes are: \`auto\`, \`flat\`, \`hierarchical\`.`,
        "warning",
        sessionID,
      )
      return { handled: true }
    }
    const written = setAdrMode(targetMode)
    await log(
      written ? "info" : "warn",
      written
        ? `adrMode=${targetMode} written to project config`
        : `failed to write adrMode=${targetMode} to project config`,
    )
    
    // Check if migration is available
    const migrationPlan = planAdrMigration(projectDir, targetMode)
    let extraNotice = ""
    if (migrationPlan.moves.length > 0) {
      extraNotice = `\n\n💡 **Restructuring Available**: ${migrationPlan.moves.length} file(s) can be automatically reorganized to match \`${targetMode}\` mode.\nRun \`/adr migrate ${targetMode}\` to preview and apply.`
    }

    await announce(
      client,
      `✅ ADR Mode updated to: **\`${targetMode}\`** (saved in project opencode.jsonc).${extraNotice}`,
      "info",
      sessionID,
    )
    return { handled: true }
  }

  if (sub === "migrate" || sub === "refactor") {
    const isConfirm = rest.includes("--confirm") || rest.includes("-y")
    const cleanRest = rest.replace(/--confirm|-y|--dry-run/g, "").trim()
    const targetMode = normalizeAdrMode(cleanRest) || (getAdrMode() === "flat" ? "hierarchical" : "flat")

    const plan = planAdrMigration(projectDir, targetMode)

    if (plan.moves.length === 0) {
      await announce(
        client,
        `ℹ️ **ADR Migration Plan (${plan.currentMode} $\\to$ ${plan.targetMode})**:\nAll ADR files are already in optimal locations. No file moves required.`,
        "info",
        sessionID,
      )
      return { handled: true }
    }

    if (isConfirm) {
      const result = executeAdrMigration(projectDir, plan)
      await log("info", `executed ADR migration: ${result.executedCount} files moved`)
      let msg = `🎉 **ADR Migration Completed (${plan.currentMode} $\\to$ ${plan.targetMode})**\n\n`
      msg += `Successfully relocated **${result.executedCount}** file(s) and synchronized indexes:\n\n`
      for (const m of plan.moves) {
        msg += `- \`${m.fromRelPath}\` $\\to$ \`${m.toRelPath}\`\n`
      }
      await announce(client, msg, "info", sessionID)
    } else {
      let preview = `📋 **ADR Migration Preview (${plan.currentMode} $\\to$ ${plan.targetMode})**\n\n`
      preview += `Proposed Restructuring Plan (**${plan.moves.length}** moves):\n\n`
      preview += `| Source Path | Target Path | Title | Layer |\n`
      preview += `| :--- | :--- | :--- | :--- |\n`
      for (const m of plan.moves) {
        preview += `| \`${m.fromRelPath}\` | \`${m.toRelPath}\` | ${m.title} | \`${m.targetLayer}\` |\n`
      }
      preview += `\n⚠️ *No files have been modified yet.* To execute this migration, run:\n`
      preview += `\`\`\`bash\n/adr migrate ${targetMode} --confirm\n\`\`\``
      await announce(client, preview, "info", sessionID)
    }
    return { handled: true }
  }

  if (sub === "tree" || sub === "map") {
    const map = generateDecisionMap(projectDir)
    await announce(client, map, "info", sessionID)
    return { handled: true }
  }

  if (sub === "check" || sub === "lint") {
    const issues = checkAdrIntegrity(projectDir)
    const complexity = analyzeAdrComplexity(projectDir)

    let report = ""
    if (issues.length === 0) {
      report += `✅ **ADR Integrity Check Passed**: All ADRs, links, and indexes are consistent.\n\n`
    } else {
      report += `⚠️ **ADR Integrity Issues Found (${issues.length})**:\n\n`
      for (const iss of issues) {
        const icon = iss.severity === "error" ? "❌" : "⚠️"
        report += `- ${icon} \`[${iss.type}]\` **${iss.file}**: ${iss.message}\n`
      }
      report += `\n`
    }

    if (complexity.recommendation) {
      report += `💡 **Architecture Complexity Advisory**:\n`
      report += `${complexity.recommendation.reason}\n`
      report += `👉 Run \`/adr migrate ${complexity.recommendation.suggestedMode}\` to preview the recommended restructuring.`
    }

    await announce(client, report, issues.length > 0 ? "warning" : "info", sessionID)
    return { handled: true }
  }


  if (sub === "new" || !["mode", "migrate", "refactor", "tree", "map", "check", "lint", "supersede"].includes(sub)) {
    const rawDecisionText = sub === "new" ? rest : trimmed
    const emptyFlagRegex = /(?:^|\s)(--empty|--scaffold|--no-draft)(?:\s|$)/i
    const isEmptyOnly = emptyFlagRegex.test(rawDecisionText)
    const cleanRest = rawDecisionText.replace(/(?:^|\s)(--empty|--scaffold|--no-draft)(?:\s|$)/gi, " ").trim()

    if (!cleanRest) {
      await announce(
        client,
        `❌ Usage: \`/adr [new] [system|domain|component|scope] <title> [--empty]\`\nExample: \`/adr "Core Event Architecture"\` or \`/adr new system "Core Event Architecture"\``,
        "warning",
        sessionID,
      )
      return { handled: true }
    }

    let layer: AdrLayer = "system"
    let scope: string | undefined
    let targetDir: string | undefined
    let title = cleanRest

    const firstWord = cleanRest.split(/\s+/)[0].toLowerCase()
    if (firstWord === "system" || firstWord === "domain" || firstWord === "component") {
      layer = firstWord as AdrLayer
      title = cleanRest.slice(firstWord.length).trim().replace(/^["']|["']$/g, "")
    } else if (firstWord.includes("/")) {
      // e.g. domain/order or packages/api
      const segs = firstWord.split("/")
      if (segs[0] === "domain" || segs[0] === "apps" || segs[0] === "packages") {
        layer = "domain"
        scope = segs[1]
      }
      title = cleanRest.slice(firstWord.length).trim().replace(/^["']|["']$/g, "")
    } else {
      title = cleanRest.replace(/^["']|["']$/g, "")
    }

    try {
      const created = createAdr({
        projectDir,
        title,
        layer,
        scope,
        targetDir,
      })
      await log("info", `scaffolded ADR: ${created.relPath}`)

      if (isEmptyOnly) {
        const successMsg =
          `✅ **Created ADR [${created.id}] (${layer}) [Scaffold Only]**\n\n` +
          `- File: \`${created.relPath}\`\n` +
          `- Empty template ready. Edit file and commit alongside your code.`
        await announce(client, successMsg, "info", sessionID)
        return { handled: true }
      } else {
        const successMsg =
          `✅ **Created ADR [${created.id}] (${layer})**\n\n` +
          `- File: \`${created.relPath}\`\n` +
          `- 🤖 *Agent is analyzing codebase context and auto-drafting decision document...*\n` +
          `- 💡 *SDD Lifecycle: After drafting this ADR, proceed to \`/plan\` or jump directly to \`/impl\`.*`
        await announce(client, successMsg, "info", sessionID)
        // Return handled: false so OpenCode dispatches the prompt to LLM!
        return { handled: false }
      }
    } catch (err) {
      await announce(client, `❌ Failed to create ADR: ${String(err)}`, "warning", sessionID)
      return { handled: true }
    }
  }

  if (sub === "supersede") {
    const emptyFlagRegex = /(?:^|\s)(--empty|--scaffold|--no-draft)(?:\s|$)/i
    const isEmptyOnly = emptyFlagRegex.test(rest)
    const cleanRest = rest.replace(/(?:^|\s)(--empty|--scaffold|--no-draft)(?:\s|$)/gi, " ").trim()
    const spaceIdx = cleanRest.indexOf(" ")
    if (spaceIdx === -1) {
      await announce(
        client,
        `❌ Usage: \`/adr supersede <old-id-or-path> <new-title> [--empty]\`\nExample: \`/adr supersede 0001 "NATS Streaming Standard"\``,
        "warning",
        sessionID,
      )
      return { handled: true }
    }

    const oldRef = cleanRest.slice(0, spaceIdx).trim().replace(/^["']|["']$/g, "")
    const newTitle = cleanRest.slice(spaceIdx + 1).trim().replace(/^["']|["']$/g, "")

    if (!newTitle) {
      await announce(
        client,
        `❌ Missing new ADR title.\nUsage: \`/adr supersede <old-id-or-path> <new-title> [--empty]\``,
        "warning",
        sessionID,
      )
      return { handled: true }
    }

    try {
      const { newAdr, oldAdr } = supersedeAdr(projectDir, oldRef, newTitle)
      await log("info", `superseded ADR: ${oldAdr.id} -> ${newAdr.id}`)

      if (isEmptyOnly) {
        const successMsg =
          `🔄 **Superseded ADR [${oldAdr.id}] $\\to$ [${newAdr.id}] [Scaffold Only]**\n\n` +
          `- Old ADR: \`${oldAdr.relPath}\` (marked as superseded)\n` +
          `- New ADR: \`${newAdr.relPath}\` (accepted)\n` +
          `- Indexes updated.`
        await announce(client, successMsg, "info", sessionID)
        return { handled: true }
      } else {
        const successMsg =
          `🔄 **Superseded ADR [${oldAdr.id}] $\\to$ [${newAdr.id}]**\n\n` +
          `- Old ADR: \`${oldAdr.relPath}\` (marked as superseded)\n` +
          `- New ADR: \`${newAdr.relPath}\` (accepted)\n` +
          `- 🤖 *Agent is analyzing codebase context and auto-drafting replacement decision...*\n` +
          `- 💡 *SDD Lifecycle: After drafting this ADR, proceed to \`/plan\` or jump directly to \`/impl\`.*`
        await announce(client, successMsg, "info", sessionID)
        // Return handled: false so OpenCode dispatches the prompt to LLM!
        return { handled: false }
      }
    } catch (err) {
      await announce(client, `❌ Failed to supersede ADR: ${String(err)}`, "warning", sessionID)
      return { handled: true }
    }
  }

  await announce(
    client,
    `Unknown subcommand \`${sub}\`. Run \`/adr help\` for available commands.`,
    "warning",
    sessionID,
  )
  return { handled: true }
}

