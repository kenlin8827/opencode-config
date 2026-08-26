import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { CliArgs, InstallOptions } from './types';
import {
  executeInstall,
  executeStatus,
  executeInit,
  executeUninstall,
  getDefaultTargetDir,
  getCurrentRepoVersion,
} from './installer';
import { registerShim } from './shim';
import { readJsoncFile } from './merger';
import { runTuiDashboard } from './dashboard';
import { loadLocale, getAvailableLocales, detectDefaultLocaleCode } from './i18n';

export interface DynamicOptionItem {
  key: string;
  value: boolean;
  hint: string;
}

export interface DynamicSchema {
  defaultAgent: {
    value: string;
    hint: string;
    choices: string[];
  };
  rtk: {
    value: boolean;
    hint: string;
  };
  mcpItems: DynamicOptionItem[];
  pluginItems: DynamicOptionItem[];
}

export function parseDynamicOptionsSchema(content: string, repoDir?: string): DynamicSchema {
  const schema: DynamicSchema = {
    defaultAgent: { value: 'code', hint: 'Default active agent', choices: [] },
    rtk: { value: true, hint: 'Rust Token Killer proxy & plugin' },
    mcpItems: [],
    pluginItems: [],
  };

  if (repoDir) {
    const agentsDir = path.join(repoDir, 'agents');
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
      schema.defaultAgent.choices = files.map((f) => path.basename(f, '.md'));
    }
  }

  const lines = content.split(/\r?\n/);
  let currentSection: 'root' | 'mcp' | 'plugin' | '' = 'root';
  let pendingComments: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('//')) {
      const commentText = trimmed.replace(/^\/\/\s*/, '').trim();
      if (commentText) {
        pendingComments.push(commentText);
      }
      continue;
    }

    if (!trimmed) {
      pendingComments = [];
      continue;
    }

    if (/"mcp"\s*:\s*\{/.test(trimmed)) {
      currentSection = 'mcp';
      pendingComments = [];
      continue;
    }
    if (/"plugin"\s*:\s*\{/.test(trimmed)) {
      currentSection = 'plugin';
      pendingComments = [];
      continue;
    }
    if (trimmed === '}' || trimmed === '},') {
      currentSection = 'root';
      pendingComments = [];
      continue;
    }

    const agentMatch = trimmed.match(/"default_agent"\s*:\s*"([^"]+)"/);
    if (agentMatch) {
      schema.defaultAgent.value = agentMatch[1];
      if (pendingComments.length > 0) {
        schema.defaultAgent.hint = pendingComments.join(' ');
      }
      pendingComments = [];
      continue;
    }

    const rtkMatch = trimmed.match(/"rtk"\s*:\s*(true|false)/);
    if (rtkMatch) {
      schema.rtk.value = rtkMatch[1] === 'true';
      if (pendingComments.length > 0) {
        schema.rtk.hint = pendingComments.join(' ');
      }
      pendingComments = [];
      continue;
    }

    const boolMatch = trimmed.match(/"([^"]+)"\s*:\s*(true|false)/);
    if (boolMatch) {
      const key = boolMatch[1];
      const val = boolMatch[2] === 'true';
      const hint = pendingComments.length > 0 ? pendingComments.join(' ') : '';

      if (currentSection === 'mcp') {
        schema.mcpItems.push({ key, value: val, hint });
      } else if (currentSection === 'plugin') {
        schema.pluginItems.push({ key, value: val, hint });
      }
      pendingComments = [];
      continue;
    }
  }

  return schema;
}

export function updateOptionsJsoncInPlace(
  filePath: string,
  updates: {
    defaultAgent?: string;
    rtk?: boolean;
    mcps?: Record<string, boolean>;
    plugins?: Record<string, boolean>;
  }
): void {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  if (updates.defaultAgent !== undefined) {
    content = content.replace(
      /("default_agent"\s*:\s*)"[^"]*"/,
      `$1"${updates.defaultAgent}"`
    );
  }

  if (updates.rtk !== undefined) {
    content = content.replace(
      /("rtk"\s*:\s*)(true|false)/,
      `$1${updates.rtk}`
    );
  }

  if (updates.mcps) {
    for (const [key, val] of Object.entries(updates.mcps)) {
      const escaped = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`("${escaped}"\\s*:\\s*)(true|false)`);
      content = content.replace(regex, `$1${val}`);
    }
  }

  if (updates.plugins) {
    for (const [key, val] of Object.entries(updates.plugins)) {
      const escaped = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`("${escaped}"\\s*:\\s*)(true|false)`);
      content = content.replace(regex, `$1${val}`);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

async function runCustomSetupFlow(repoDir: string, optionsPath: string, localeCode: string): Promise<void> {
  const t = loadLocale(repoDir, localeCode);
  const optionsContent = fs.existsSync(optionsPath) ? fs.readFileSync(optionsPath, 'utf8') : '{}';
  const schema = parseDynamicOptionsSchema(optionsContent, repoDir);
  const defaultTarget = getDefaultTargetDir();

  p.log.step(t.customInstallHint);

  // 1. Choose Default Primary Agent
  const agentChoices = schema.defaultAgent.choices.map((name) => ({
    value: name,
    label: name,
    hint: name === 'code' ? 'Direct developer' : name === 'build' ? 'Orchestrator' : 'Specialist',
  }));

  const pickedAgent = await p.select({
    message: t.stepAgentPrompt,
    initialValue: schema.defaultAgent.value,
    options: agentChoices,
  });
  if (p.isCancel(pickedAgent)) {
    p.cancel(t.customSetupCancelled);
    return;
  }

  // 2. Select MCP Servers
  const activeMcps = schema.mcpItems.filter((i) => i.value).map((i) => i.key);
  const mcpOptions = schema.mcpItems.map((item) => ({
    value: item.key,
    label: item.key,
    hint: item.hint,
  }));

  const selectedMcps = await p.multiselect({
    message: t.stepMcpPrompt,
    initialValues: activeMcps,
    options: mcpOptions,
  });
  if (p.isCancel(selectedMcps)) {
    p.cancel(t.customSetupCancelled);
    return;
  }

  // 3. Select Plugins
  const activePlugins = schema.pluginItems.filter((i) => i.value).map((i) => i.key);
  const pluginOptions = schema.pluginItems.map((item) => ({
    value: item.key,
    label: item.key,
    hint: item.hint,
  }));

  const selectedPlugins = await p.multiselect({
    message: t.stepPluginPrompt,
    initialValues: activePlugins,
    options: pluginOptions,
  });
  if (p.isCancel(selectedPlugins)) {
    p.cancel(t.customSetupCancelled);
    return;
  }

  // 4. Toggle RTK
  const enableRtk = await p.confirm({
    message: `${t.stepRtkPrompt}\n  (${schema.rtk.hint})`,
    initialValue: schema.rtk.value,
  });
  if (p.isCancel(enableRtk)) {
    p.cancel(t.customSetupCancelled);
    return;
  }

  // 5. Target Directory
  const targetInput = await p.text({
    message: t.stepTargetPrompt,
    initialValue: defaultTarget,
    placeholder: defaultTarget,
  });
  if (p.isCancel(targetInput)) {
    p.cancel(t.customSetupCancelled);
    return;
  }
  const targetDir = targetInput ? targetInput.trim() : defaultTarget;

  const newMcpRecord: Record<string, boolean> = {};
  for (const item of schema.mcpItems) {
    newMcpRecord[item.key] = (selectedMcps as string[]).includes(item.key);
  }

  const newPluginRecord: Record<string, boolean> = {};
  for (const item of schema.pluginItems) {
    newPluginRecord[item.key] = (selectedPlugins as string[]).includes(item.key);
  }

  const finalOptions: InstallOptions = {
    default_agent: pickedAgent as string,
    rtk: Boolean(enableRtk),
    mcp: newMcpRecord,
    plugin: newPluginRecord,
  };

  p.log.message(
    `\n${t.reviewTitle}\n` +
    `  • ${t.reviewPrimaryAgent}: ${finalOptions.default_agent}\n` +
    `  • ${t.reviewActiveMcps}   : ${(selectedMcps as string[]).join(', ') || 'None'}\n` +
    `  • ${t.reviewActivePlugins}: ${(selectedPlugins as string[]).join(', ') || 'None'}\n` +
    `  • ${t.reviewRtk}          : ${finalOptions.rtk ? t.enabled : t.disabled}\n` +
    `  • ${t.reviewTargetPath}   : ${targetDir}\n`
  );

  const confirmInstall = await p.confirm({
    message: t.readyToInstallPrompt,
    initialValue: true,
  });
  if (p.isCancel(confirmInstall) || !confirmInstall) {
    p.cancel(t.installCancelledNoChanges);
    return;
  }

  updateOptionsJsoncInPlace(optionsPath, {
    defaultAgent: finalOptions.default_agent,
    rtk: finalOptions.rtk,
    mcps: newMcpRecord,
    plugins: newPluginRecord,
  });
  p.log.success(t.saveOptionsSuccess);

  const s = p.spinner();
  s.start(t.installingSpinner);

  const args: CliArgs = {
    action: 'install',
    target: targetDir,
    force: true,
    noBackup: false,
    yes: true,
    isInteractive: true,
  };

  const res = executeInstall(repoDir, args, finalOptions);
  s.stop(t.installSuccessNote);

  p.note(
    `Target: ${res.targetDir}\nVersion: ${res.version}\nPrimary Agent: ${finalOptions.default_agent}\nRTK: ${
      finalOptions.rtk ? 'Enabled' : 'Disabled'
    }\nFiles Installed: ${res.filesInstalled}\nFiles Cleaned: ${res.filesRemoved}${
      res.backupPath ? `\nBackup: ${res.backupPath}` : ''
    }`,
    t.installSummaryTitle
  );
}

export async function runInteractiveWizard(repoDir: string): Promise<void> {
  const version = getCurrentRepoVersion(repoDir);
  const optionsPath = path.join(repoDir, 'install', 'options.jsonc');
  const availableLocales = getAvailableLocales(repoDir);
  let currentLocaleCode: string = detectDefaultLocaleCode();

  // 1. Language Prompt dynamically populated from locales directory
  const localeOptions = availableLocales.map((l) => ({
    value: l.code,
    label: l.name,
    hint: l.hint,
  }));

  const pickedLocale = await p.select({
    message: '🌐 Select Language / Language Picker:',
    initialValue: currentLocaleCode,
    options: localeOptions,
  });

  if (!p.isCancel(pickedLocale)) {
    currentLocaleCode = pickedLocale as string;
  }

  let t = loadLocale(repoDir, currentLocaleCode);
  p.intro(`${t.wizardTitle} (v${version})`);

  const status = executeStatus(repoDir);
  const statusNote = status.installedVersion
    ? t.installedNote.replace('{version}', status.installedVersion).replace('{target}', status.targetDir)
    : t.notInstalledNote.replace('{target}', status.targetDir);
  p.log.info(statusNote);

  while (true) {
    t = loadLocale(repoDir, currentLocaleCode);

    const action = await p.select({
      message: t.menuPrompt,
      options: [
        {
          value: 'dashboard',
          label: t.dashboardLabel,
          hint: t.dashboardHint,
        },
        {
          value: 'quick_install',
          label: t.quickInstallLabel,
          hint: t.quickInstallHint,
        },
        {
          value: 'custom_install',
          label: t.customInstallLabel,
          hint: t.customInstallHint,
        },
        {
          value: 'status',
          label: t.statusLabel,
          hint: t.statusHint,
        },
        {
          value: 'register',
          label: t.registerLabel,
          hint: t.registerHint,
        },
        {
          value: 'init',
          label: t.initLabel,
          hint: t.initHint,
        },
        {
          value: 'uninstall',
          label: t.uninstallLabel,
          hint: t.uninstallHint,
        },
        {
          value: 'switch_lang',
          label: t.switchLanguageLabel,
          hint: t.switchLanguageHint,
        },
        {
          value: 'exit',
          label: t.exitLabel,
          hint: t.exitHint,
        },
      ],
    });

    if (p.isCancel(action) || action === 'exit') {
      p.outro(t.thankYouOutro);
      process.exit(0);
    }

    const defaultTarget = getDefaultTargetDir();

    if (action === 'switch_lang') {
      const curIdx = availableLocales.findIndex((l) => l.code === currentLocaleCode);
      const nextIdx = (curIdx + 1) % availableLocales.length;
      currentLocaleCode = availableLocales[nextIdx].code;
      p.log.success(loadLocale(repoDir, currentLocaleCode).switchLangHint);
      continue;
    } else if (action === 'dashboard') {
      await runTuiDashboard(repoDir, currentLocaleCode);
      break;
    } else if (action === 'quick_install') {
      const options = readJsoncFile<InstallOptions>(optionsPath) || {};
      const targetInput = await p.text({
        message: t.targetDirPrompt,
        initialValue: defaultTarget,
        placeholder: defaultTarget,
      });

      if (p.isCancel(targetInput)) {
        continue;
      }

      const s = p.spinner();
      s.start(t.installingSpinner);

      const args: CliArgs = {
        action: 'install',
        target: targetInput || defaultTarget,
        force: true,
        noBackup: false,
        yes: true,
        isInteractive: true,
      };

      const res = executeInstall(repoDir, args, options);
      s.stop(t.installSuccessNote);

      p.note(
        `Target: ${res.targetDir}\nVersion: ${res.version}\nFiles Installed: ${res.filesInstalled}\nFiles Cleaned: ${res.filesRemoved}${
          res.backupPath ? `\nBackup saved at: ${res.backupPath}` : ''
        }`,
        t.installSummaryTitle
      );
      break;
    } else if (action === 'custom_install') {
      await runCustomSetupFlow(repoDir, optionsPath, currentLocaleCode);
      break;
    } else if (action === 'status') {
      const st = executeStatus(repoDir);
      p.note(
        `Repo Version: ${st.repoVersion}\nInstalled Version: ${st.installedVersion || 'None'}\nTarget Directory: ${
          st.targetDir
        }\nStatus: ${st.isUpToDate ? '✓ Up to date' : '⚠ Out of sync / Needs update'}\nTracked Files: ${
          st.shippedFilesCount
        }`,
        t.configStatusDetail
      );
    } else if (action === 'register') {
      const res = registerShim(repoDir);
      p.note(res.message, t.globalRegTitle);
    } else if (action === 'init') {
      const confirmInit = await p.confirm({
        message: t.confirmResetPrompt.replace('{target}', defaultTarget),
        initialValue: false,
      });
      if (confirmInit && !p.isCancel(confirmInit)) {
        const res = executeInit(repoDir, {
          action: 'init',
          force: true,
          noBackup: false,
          yes: true,
          isInteractive: true,
        });
        p.note(`Cleared ${res.targetDir}\nBackup saved: ${res.backupPath || 'None'}`, '🧹 Target Reset');
      }
    } else if (action === 'uninstall') {
      const confirmUninstall = await p.confirm({
        message: t.confirmUninstallPrompt.replace('{target}', defaultTarget),
        initialValue: false,
      });
      if (confirmUninstall && !p.isCancel(confirmUninstall)) {
        const res = executeUninstall(repoDir, {
          action: 'uninstall',
          force: true,
          noBackup: false,
          yes: true,
          isInteractive: true,
        });
        p.note(`Removed ${res.removedCount} files from ${res.targetDir}`, '❌ Uninstalled');
      }
    }
  }

  p.outro(t.thankYouOutro);
}
