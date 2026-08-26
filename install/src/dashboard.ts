import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  executeInstall,
  executeStatus,
  getDefaultTargetDir,
  getCurrentRepoVersion,
  getInstalledVersion,
} from './installer';
import {
  parseDynamicOptionsSchema,
  updateOptionsJsoncInPlace,
} from './wizard';
import { readTierMap } from './merger';
import { CliArgs, InstallOptions } from './types';
import { loadLocale, getAvailableLocales, detectDefaultLocaleCode } from './i18n';

// ANSI color and formatting helpers
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
  bgDark: '\x1b[48;5;236m',
  inverse: '\x1b[7m',
  clear: '\x1b[2J\x1b[3J\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
};

const AVAILABLE_TIERS = ['flash', 'standard', 'pro', 'max', 'vision'];

const LEGACY_TIER_MIGRATION: Record<string, string> = {
  default: 'standard',
  code: 'pro',
  advisor: 'max',
  explorer: 'flash',
  vision: 'vision',
};

interface RowItem {
  id: string;
  type: 'agent' | 'rtk' | 'mcp' | 'plugin' | 'tier' | 'target' | 'action_install' | 'action_save' | 'action_exit';
  key?: string;
  label: string;
  hint?: string;
}

/**
 * Truncates a string safely to prevent terminal line wrapping
 */
function truncateText(str: string, maxLen: number): string {
  if (!str) return '';
  if (maxLen <= 3) return str.slice(0, Math.max(0, maxLen));
  const single = str.replace(/[\r\n]+/g, ' ').replace(/\s*\|\s*/g, ' — ').trim();
  return single.length > maxLen ? single.slice(0, maxLen - 3) + '...' : single;
}

export async function runTuiDashboard(repoDir: string, initialLocale?: string): Promise<void> {
  const version = getCurrentRepoVersion(repoDir);
  const optionsPath = path.join(repoDir, 'install', 'options.jsonc');
  const availableLocales = getAvailableLocales(repoDir);
  let currentLocaleCode: string = initialLocale || detectDefaultLocaleCode();
  let targetDir = getDefaultTargetDir();

  // Load dynamic schema from options.jsonc
  const optionsContent = fs.existsSync(optionsPath) ? fs.readFileSync(optionsPath, 'utf8') : '{}';
  const schema = parseDynamicOptionsSchema(optionsContent, repoDir);

  // Mutable state
  let currentAgent = schema.defaultAgent.value;
  let currentRtk = schema.rtk.value;
  const mcpState: Record<string, boolean> = {};
  for (const item of schema.mcpItems) {
    mcpState[item.key] = item.value;
  }
  const pluginState: Record<string, boolean> = {};
  for (const item of schema.pluginItems) {
    pluginState[item.key] = item.value;
  }

  // Load effective tiers map from repo (source of truth) and migrate/override with valid user tiers
  const defaultTiers = readTierMap(repoDir);
  const userTiers = readTierMap(targetDir);
  const migratedUserTiers: Record<string, string> = {};
  for (const [agent, tier] of Object.entries(userTiers)) {
    if (AVAILABLE_TIERS.includes(tier)) {
      migratedUserTiers[agent] = tier;
    } else if (LEGACY_TIER_MIGRATION[tier]) {
      migratedUserTiers[agent] = LEGACY_TIER_MIGRATION[tier];
    }
  }

  const tiersState: Record<string, string> = {
    ...defaultTiers,
    ...migratedUserTiers,
  };

  // Available agent candidates
  const availableAgents = schema.defaultAgent.choices.length > 0
    ? schema.defaultAgent.choices
    : ['code', 'build', 'plan'];

  // Build selectable rows
  const buildRows = (): RowItem[] => {
    const t = loadLocale(repoDir, currentLocaleCode);
    const r: RowItem[] = [];

    // 1. Agent
    r.push({
      id: 'agent',
      type: 'agent',
      label: t.primaryAgentLabel,
      hint: t.primaryAgentHint,
    });

    // 2. RTK
    r.push({
      id: 'rtk',
      type: 'rtk',
      label: t.rtkLabel,
      hint: t.rtkHint,
    });

    // 3. MCP Servers
    for (const item of schema.mcpItems) {
      r.push({
        id: `mcp:${item.key}`,
        type: 'mcp',
        key: item.key,
        label: item.key,
        hint: item.hint,
      });
    }

    // 4. External Plugins
    for (const item of schema.pluginItems) {
      r.push({
        id: `plugin:${item.key}`,
        type: 'plugin',
        key: item.key,
        label: item.key,
        hint: item.hint,
      });
    }

    // 5. Agent Tier Mappings (Focusing on core agents)
    const featuredAgents = [
      'code',
      'advisor',
      'build',
      'plan',
      'fast-coder',
      'explorer',
      'architect',
      'code-review',
      'qa',
      'devops',
      'vision',
    ];
    for (const agentName of featuredAgents) {
      if (tiersState[agentName]) {
        r.push({
          id: `tier:${agentName}`,
          type: 'tier',
          key: agentName,
          label: `@${agentName}`,
          hint: `${agentName} -> tier: ${tiersState[agentName]} (${t.tiersHint})`,
        });
      }
    }

    // 6. Target Directory
    r.push({
      id: 'target',
      type: 'target',
      label: t.targetSectionHeader.replace(/─/g, '').trim(),
      hint: t.targetHint,
    });

    // 7. Actions
    r.push({
      id: 'action_install',
      type: 'action_install',
      label: t.saveAndInstallBtn,
      hint: t.saveAndInstallHint,
    });
    r.push({
      id: 'action_save',
      type: 'action_save',
      label: t.saveOnlyBtn,
      hint: t.saveOnlyHint,
    });
    r.push({
      id: 'action_exit',
      type: 'action_exit',
      label: t.exitBtn,
      hint: t.exitBtnHint,
    });

    return r;
  };

  let rows = buildRows();
  let selectedIndex = 0;
  let statusMessage = '';

  const render = () => {
    const t = loadLocale(repoDir, currentLocaleCode);
    const termWidth = process.stdout.columns || 100;
    const width = Math.max(76, Math.min(termWidth, 110));
    const line = '─'.repeat(width - 2);

    let buf = C.clear + C.hideCursor;

    // Header Box with Version Flow Detection
    const installedVer = getInstalledVersion(targetDir);
    let versionText = '';
    if (installedVer) {
      if (installedVer !== version) {
        versionText = `v${installedVer} ➔ v${version}`;
      } else {
        versionText = `v${version}`;
      }
    } else {
      versionText = `v${version} (${t.versionFreshPrompt || 'Fresh'})`;
    }

    const title = `${t.wizardTitle} [${versionText}] [Lang: ${currentLocaleCode}]`;
    buf += `${C.cyan}┌${line}┐${C.reset}\n`;
    buf += `${C.cyan}│${C.bold}  ${title}  ${C.reset}${' '.repeat(Math.max(0, width - title.length - 6))}${C.cyan}│${C.reset}\n`;
    buf += `${C.cyan}└${line}┘\n`;

    // Render Rows grouped by section in clean, compact layout
    let lastType = '';

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const isSelected = i === selectedIndex;
      const cursor = isSelected ? `${C.bold}${C.cyan} ▶ ${C.reset}` : '   ';

      // Section Dividers with concise 1-line margin
      if (row.type === 'mcp' && lastType !== 'mcp') {
        buf += `\n${C.bold}${C.cyan}  ${t.mcpSectionHeader}${C.reset}\n`;
      } else if (row.type === 'plugin' && lastType !== 'plugin') {
        buf += `\n${C.bold}${C.cyan}  ${t.pluginSectionHeader}${C.reset}\n`;
      } else if (row.type === 'tier' && lastType !== 'tier') {
        buf += `\n${C.bold}${C.cyan}  ${t.tiersSectionHeader}${C.reset}\n`;
      } else if (row.type === 'target' && lastType !== 'target') {
        buf += `\n${C.bold}${C.cyan}  ${t.targetSectionHeader}${C.reset}\n`;
      } else if (row.type.startsWith('action_') && !lastType.startsWith('action_')) {
        buf += `\n${C.bold}${C.cyan}  ${t.actionsSectionHeader}${C.reset}\n`;
      }
      lastType = row.type;

      let valueDisplay = '';

      if (row.type === 'agent') {
        valueDisplay = ` [ ${C.bold}${C.yellow}${currentAgent}${C.reset} ]   ${C.dim}(${t.cycleAgentHint})${C.reset}`;
        buf += `  ${cursor}${row.label.padEnd(20)}: ${valueDisplay}\n`;
      } else if (row.type === 'rtk') {
        valueDisplay = currentRtk
          ? ` [ ${C.green}${C.bold}✓ ${t.enabled}${C.reset} ]`
          : ` [ ${C.dim}  ${t.disabled}${C.reset} ]`;
        buf += `  ${cursor}${row.label.padEnd(20)}: ${valueDisplay}\n`;
      } else if (row.type === 'mcp' && row.key) {
        const active = mcpState[row.key];
        const switchBadge = active
          ? `[ ${C.green}${C.bold}✓ ${t.on}${C.reset} ]`
          : `[ ${C.dim}  ${t.off}${C.reset} ]`;
        const nameBadge = isSelected ? `${C.bold}${C.yellow}${row.label.padEnd(16)}${C.reset}` : `${C.bold}${row.label.padEnd(16)}${C.reset}`;
        const maxHintLen = Math.max(10, width - 38);
        const safeHint = truncateText(row.hint || '', maxHintLen);
        buf += `  ${cursor}${switchBadge}  ${nameBadge}  ${C.dim}${safeHint}${C.reset}\n`;
      } else if (row.type === 'plugin' && row.key) {
        const active = pluginState[row.key];
        const switchBadge = active
          ? `[ ${C.green}${C.bold}✓ ${t.on}${C.reset} ]`
          : `[ ${C.dim}  ${t.off}${C.reset} ]`;
        const nameBadge = isSelected ? `${C.bold}${C.yellow}${row.label.padEnd(36)}${C.reset}` : `${C.bold}${row.label.padEnd(36)}${C.reset}`;
        const maxHintLen = Math.max(10, width - 58);
        const safeHint = truncateText(row.hint || '', maxHintLen);
        buf += `  ${cursor}${switchBadge}  ${nameBadge}  ${C.dim}${safeHint}${C.reset}\n`;
      } else if (row.type === 'tier' && row.key) {
        const curTier = tiersState[row.key] || 'standard';
        const tierColor = curTier === 'max' ? C.magenta : curTier === 'pro' ? C.green : curTier === 'flash' ? C.yellow : curTier === 'vision' ? C.blue : C.cyan;
        const tierBadge = `[ ${tierColor}${C.bold}${curTier.padEnd(8)}${C.reset} ]`;
        const nameBadge = isSelected ? `${C.bold}${C.yellow}${row.label.padEnd(18)}${C.reset}` : `${C.bold}${row.label.padEnd(18)}${C.reset}`;
        buf += `  ${cursor}${nameBadge} : ${tierBadge}  ${C.dim}(${t.cycleTierHint})${C.reset}\n`;
      } else if (row.type === 'target') {
        valueDisplay = `${C.yellow}${C.bold}${targetDir}${C.reset}`;
        buf += `  ${cursor}${row.label.padEnd(18)}: ${valueDisplay}\n`;
      } else if (row.type === 'action_install') {
        const btn = isSelected ? `${C.bgCyan}${C.bold}  ${row.label}  ${C.reset}` : `${C.bold}${C.green}  ${row.label}${C.reset}`;
        buf += `  ${cursor}${btn}\n`;
      } else if (row.type === 'action_save') {
        const btn = isSelected ? `${C.bgBlue}${C.bold}  ${row.label}  ${C.reset}` : `${C.cyan}  ${row.label}${C.reset}`;
        buf += `  ${cursor}${btn}\n`;
      } else if (row.type === 'action_exit') {
        const btn = isSelected ? `${C.red}${C.bold}  ▶ ${row.label}${C.reset}` : `${C.dim}  ${row.label}${C.reset}`;
        buf += `  ${cursor}${btn}\n`;
      }
    }

    // Status Message / Notification
    if (statusMessage) {
      buf += `\n  ${C.bold}${C.yellow}ℹ ${statusMessage}${C.reset}\n`;
    }

    // Selected Row Active Card
    const selectedRow = rows[selectedIndex];
    buf += `${C.cyan}┌${line}┐${C.reset}\n`;
    const hintTitle = t.itemDetailsTitle;
    const activeHint = selectedRow?.hint || 'Use arrows to navigate, Space to toggle switch';
    const safeActiveHint = truncateText(activeHint, width - 20);
    buf += `${C.cyan}│${C.reset}  ${C.bold}${hintTitle}${C.reset}: ${C.yellow}${safeActiveHint}${C.reset}${' '.repeat(Math.max(0, width - hintTitle.length - safeActiveHint.length - 8))}${C.cyan}│${C.reset}\n`;
    buf += `${C.cyan}└${line}┘${C.reset}\n`;
    buf += `  ${C.dim}${t.footerHelp}${C.reset}\n`;

    process.stdout.write(buf);
  };

  return new Promise<void>((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(process.stdin);
    process.stdin.resume();

    const cleanup = () => {
      process.stdout.write(C.showCursor);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };

    const saveOptions = () => {
      updateOptionsJsoncInPlace(optionsPath, {
        defaultAgent: currentAgent,
        rtk: currentRtk,
        mcps: mcpState,
        plugins: pluginState,
      });
    };

    const executeAndExit = (doInstall: boolean) => {
      const t = loadLocale(repoDir, currentLocaleCode);
      cleanup();
      process.stdout.write(C.clear);

      saveOptions();
      console.log(`${C.green}✓ ${t.saveOptionsSuccess}${C.reset}\n`);

      if (doInstall) {
        console.log(`🚀 ${t.installingTo.replace('{target}', targetDir)}`);
        const latestOptions: InstallOptions = {
          default_agent: currentAgent,
          rtk: currentRtk,
          mcp: mcpState,
          plugin: pluginState,
          tiers: tiersState,
        };

        const args: CliArgs = {
          action: 'install',
          target: targetDir,
          force: true,
          noBackup: false,
          yes: true,
          isInteractive: true,
        };

        const res = executeInstall(repoDir, args, latestOptions);
        console.log(`\n${C.bold}${C.green}${t.installSummaryTitle}${C.reset}`);
        console.log(`  • ${t.summaryVersion.padEnd(16)}: ${res.version}`);
        console.log(`  • ${t.summaryTarget.padEnd(16)}: ${res.targetDir}`);
        console.log(`  • ${t.summaryInstalled.padEnd(16)}: ${res.filesInstalled}`);
        console.log(`  • ${t.summaryCleaned.padEnd(16)}: ${res.filesRemoved}`);
        if (res.backupPath) {
          console.log(`  • ${t.summaryBackup.padEnd(16)}: ${res.backupPath}`);
        }
      }

      resolve();
    };

    const handleKey = (str: string, key: readline.Key) => {
      if (!key) return;

      // Toggle Language: cycle available locales
      if ((str === 'l' || str === 'L') && rows[selectedIndex].type !== 'target') {
        const curIdx = availableLocales.findIndex((l) => l.code === currentLocaleCode);
        const nextIdx = (curIdx + 1) % availableLocales.length;
        currentLocaleCode = availableLocales[nextIdx].code;
        rows = buildRows();
        statusMessage = loadLocale(repoDir, currentLocaleCode).switchLangHint;
        render();
        return;
      }

      // Exit shortcuts
      if ((key.ctrl && key.name === 'c') || key.name === 'escape' || (str === 'q' && rows[selectedIndex].type !== 'target')) {
        const t = loadLocale(repoDir, currentLocaleCode);
        cleanup();
        process.stdout.write(C.clear);
        console.log(t.exitedDashboard);
        resolve();
        return;
      }

      // Navigation
      if (key.name === 'up' || str === 'k') {
        selectedIndex = (selectedIndex - 1 + rows.length) % rows.length;
        statusMessage = '';
        render();
        return;
      }

      if (key.name === 'down' || str === 'j') {
        selectedIndex = (selectedIndex + 1) % rows.length;
        statusMessage = '';
        render();
        return;
      }

      // Actions on Space or Enter
      const currentRow = rows[selectedIndex];
      const t = loadLocale(repoDir, currentLocaleCode);

      if (key.name === 'space' || key.name === 'return') {
        if (currentRow.type === 'agent') {
          const curIdx = availableAgents.indexOf(currentAgent);
          const nextIdx = (curIdx + 1) % availableAgents.length;
          currentAgent = availableAgents[nextIdx];
          statusMessage = t.agentSetMsg.replace('{agent}', currentAgent);
        } else if (currentRow.type === 'rtk') {
          currentRtk = !currentRtk;
          statusMessage = currentRtk ? t.rtkEnabledMsg : t.rtkDisabledMsg;
        } else if (currentRow.type === 'mcp' && currentRow.key) {
          mcpState[currentRow.key] = !mcpState[currentRow.key];
          statusMessage = `MCP "${currentRow.key}" ${mcpState[currentRow.key] ? t.enabled : t.disabled}`;
        } else if (currentRow.type === 'plugin' && currentRow.key) {
          pluginState[currentRow.key] = !pluginState[currentRow.key];
          statusMessage = `Plugin "${currentRow.key}" ${pluginState[currentRow.key] ? t.enabled : t.disabled}`;
        } else if (currentRow.type === 'tier' && currentRow.key) {
          const curTier = tiersState[currentRow.key] || 'default';
          const curIdx = AVAILABLE_TIERS.indexOf(curTier);
          const nextIdx = (curIdx + 1) % AVAILABLE_TIERS.length;
          tiersState[currentRow.key] = AVAILABLE_TIERS[nextIdx];
          statusMessage = t.tierSetMsg.replace('{agent}', currentRow.key).replace('{tier}', tiersState[currentRow.key]);
        } else if (currentRow.type === 'target') {
          cleanup();
          process.stdout.write('\n');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const prompt = t.targetDirectoryPrompt.replace('{target}', targetDir);
          rl.question(prompt, (answer) => {
            if (answer && answer.trim()) {
              targetDir = answer.trim();
            }
            rl.close();
            if (process.stdin.isTTY) process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('keypress', handleKey);
            statusMessage = t.targetModified.replace('{target}', targetDir);
            render();
          });
          return;
        } else if (currentRow.type === 'action_install') {
          executeAndExit(true);
          return;
        } else if (currentRow.type === 'action_save') {
          executeAndExit(false);
          return;
        } else if (currentRow.type === 'action_exit') {
          cleanup();
          process.stdout.write(C.clear);
          console.log(t.exitedDashboard);
          resolve();
          return;
        }

        render();
      }
    };

    process.stdin.on('keypress', handleKey);
    render();
  });
}
