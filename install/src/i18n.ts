import fs from 'node:fs';
import path from 'node:path';

export interface I18nMeta {
  code: string;
  name: string;
  hint: string;
}

export interface I18nText {
  _meta?: I18nMeta;
  wizardTitle: string;
  installedNote: string;
  notInstalledNote: string;
  menuPrompt: string;
  dashboardLabel: string;
  dashboardHint: string;
  quickInstallLabel: string;
  quickInstallHint: string;
  customInstallLabel: string;
  customInstallHint: string;
  statusLabel: string;
  statusHint: string;
  registerLabel: string;
  registerHint: string;
  initLabel: string;
  initHint: string;
  uninstallLabel: string;
  uninstallHint: string;
  exitLabel: string;
  exitHint: string;
  targetDirPrompt: string;
  installingSpinner: string;
  installSuccessNote: string;
  saveOptionsSuccess: string;
  installSummaryTitle: string;
  primaryAgentLabel: string;
  primaryAgentHint: string;
  rtkLabel: string;
  rtkHint: string;
  mcpSectionHeader: string;
  pluginSectionHeader: string;
  targetSectionHeader: string;
  targetHint: string;
  tiersSectionHeader: string;
  tiersHint: string;
  actionsSectionHeader: string;
  saveAndInstallBtn: string;
  saveAndInstallHint: string;
  saveOnlyBtn: string;
  saveOnlyHint: string;
  exitBtn: string;
  exitBtnHint: string;
  footerHelp: string;
  switchLangHint: string;
  enabled: string;
  disabled: string;
  on: string;
  off: string;
  stepAgentPrompt: string;
  stepMcpPrompt: string;
  stepPluginPrompt: string;
  stepRtkPrompt: string;
  stepTargetPrompt: string;
  reviewTitle: string;
  readyToInstallPrompt: string;
  customSetupCancelled: string;
  installCancelledNoChanges: string;
  selectLanguagePrompt: string;
  switchLanguageLabel: string;
  switchLanguageHint: string;
  thankYouOutro: string;
  configStatusDetail: string;
  globalRegTitle: string;
  confirmResetPrompt: string;
  confirmUninstallPrompt: string;
  itemDetailsTitle: string;
  exitedDashboard: string;
  targetDirectoryPrompt: string;
  targetModified: string;
  cycleTierHint: string;
  cycleAgentHint: string;
  agentSetMsg: string;
  rtkEnabledMsg: string;
  rtkDisabledMsg: string;
  tierSetMsg: string;
  installingTo: string;
  summaryVersion: string;
  summaryTarget: string;
  summaryInstalled: string;
  summaryCleaned: string;
  summaryBackup: string;
  reviewPrimaryAgent: string;
  reviewActiveMcps: string;
  reviewActivePlugins: string;
  reviewRtk: string;
  reviewTargetPath: string;
}

export const FALLBACK_EN: I18nText = {
  wizardTitle: '⚡ OpenCode Config — Interactive Setup Wizard',
  installedNote: 'Installed version: v{version} (Target: {target})',
  notInstalledNote: 'Target not yet initialized (Target: {target})',
  menuPrompt: 'Select an action to proceed:',
  dashboardLabel: '🎛️ Open Control Center (Single-Screen TUI Switch Matrix)',
  dashboardHint: 'Full overview of default agent, RTK, and all MCP/Plugin switches',
  quickInstallLabel: '⚡ Quick Install (Recommended defaults)',
  quickInstallHint: 'Apply options.jsonc directly to your config directory',
  customInstallLabel: '⚙️ Step-by-Step Custom Setup Flow',
  customInstallHint: 'Interactive step-by-step picker for agents, MCPs, and plugins',
  statusLabel: '📊 Check Status & Tracked Files',
  statusHint: 'Compare local repo with installed target version',
  registerLabel: '🌐 Register Global Command (opencode-config)',
  registerHint: 'Add global CLI wrapper to ~/.local/bin',
  initLabel: '🧹 Reset Target Directory (Backup + Fresh Start)',
  initHint: 'Wipe target directory and prepare fresh environment',
  uninstallLabel: '❌ Uninstall Managed Configs (Preserve user data)',
  uninstallHint: 'Safely remove only tracked open-code files',
  exitLabel: '🚪 Exit',
  exitHint: 'Quit without making further changes',
  targetDirPrompt: 'Target installation directory:',
  installingSpinner: 'Installing OpenCode configuration files...',
  installSuccessNote: 'Configuration successfully installed!',
  saveOptionsSuccess: 'Updated options saved to install/options.jsonc',
  installSummaryTitle: '📦 Installation Summary',
  primaryAgentLabel: 'Primary Agent',
  primaryAgentHint: 'Default agent loaded on session start (default_agent)',
  rtkLabel: 'RTK Tokenizer',
  rtkHint: 'Rust Token Killer proxy & plugin',
  mcpSectionHeader: '── 🔌 MCP Servers (Space to toggle) ──',
  pluginSectionHeader: '── 🧩 External Plugins (Space to toggle) ──',
  targetSectionHeader: '── 📁 Installation Target ──',
  targetHint: 'Press Enter or Space to edit target path',
  tiersSectionHeader: '── 🎯 Agent Tier Mappings (Space to cycle tier) ──',
  tiersHint: 'Model tier mapping (flash, standard, pro, max, vision) used by /profile wizard',
  actionsSectionHeader: '── ⚡ Execution Actions ──',
  saveAndInstallBtn: '🚀 SAVE & INSTALL NOW',
  saveAndInstallHint: 'Apply configuration and install all files to target',
  saveOnlyBtn: '💾 SAVE OPTIONS.JSONC ONLY',
  saveOnlyHint: 'Persist settings to options.jsonc without copying files',
  exitBtn: '🚪 EXIT',
  exitBtnHint: 'Close control center without saving',
  footerHelp: '[ ↑/↓/j/k: Move ]  [ Space: Toggle/Cycle ]  [ L: Switch Lang ]  [ Enter: Apply ]  [ Q: Exit ]',
  switchLangHint: 'Language switched to English',
  enabled: 'ENABLED',
  disabled: 'DISABLED',
  on: 'ON',
  off: 'OFF',
  stepAgentPrompt: '1/5. Select default primary agent (default_agent):',
  stepMcpPrompt: '2/5. Toggle MCP servers (Space to toggle, Enter to confirm):',
  stepPluginPrompt: '3/5. Toggle External Plugins (Space to toggle, Enter to confirm):',
  stepRtkPrompt: '4/5. Enable RTK (Rust Token Killer proxy & plugin)?',
  stepTargetPrompt: '5/5. Target installation directory:',
  reviewTitle: '📋 Configuration Review:',
  readyToInstallPrompt: 'Ready to save options to install/options.jsonc and install now?',
  customSetupCancelled: 'Custom setup cancelled.',
  installCancelledNoChanges: 'Installation cancelled. No changes were applied.',
  selectLanguagePrompt: '🌐 Select Language:',
  switchLanguageLabel: '🌐 Switch Language',
  switchLanguageHint: 'Change UI display language',
  thankYouOutro: 'Thank you for using OpenCode Config!',
  configStatusDetail: '📊 Config Status Details',
  globalRegTitle: '🌐 Global Command Registration',
  confirmResetPrompt: 'Are you sure you want to reset and clear {target}? (Backup created)',
  confirmUninstallPrompt: 'Safely uninstall all managed files from {target}?',
  itemDetailsTitle: '💡 Item Details',
  exitedDashboard: 'Exited OpenCode Setup Control Center.',
  targetDirectoryPrompt: 'Enter new target directory [{target}]: ',
  targetModified: 'Target directory changed to: {target}',
  cycleTierHint: 'Space/Enter to cycle tier',
  cycleAgentHint: 'Space/Enter to cycle',
  agentSetMsg: 'Primary agent set to "{agent}"',
  rtkEnabledMsg: 'RTK optimizer ENABLED',
  rtkDisabledMsg: 'RTK optimizer DISABLED',
  tierSetMsg: '@{agent} tier set to [{tier}]',
  installingTo: 'Installing configuration into {target}...',
  summaryVersion: 'Version',
  summaryTarget: 'Target Directory',
  summaryInstalled: 'Files Installed',
  summaryCleaned: 'Files Cleaned',
  summaryBackup: 'Backup Saved',
  reviewPrimaryAgent: 'Primary Agent',
  reviewActiveMcps: 'Active MCPs',
  reviewActivePlugins: 'Active Plugins',
  reviewRtk: 'RTK Tokenizer',
  reviewTargetPath: 'Target Path',
};

const localeCache: Record<string, I18nText> = {};

export function getLocalesDir(repoDir: string): string {
  return path.join(repoDir, 'install', 'locales');
}

export function getAvailableLocales(repoDir: string): I18nMeta[] {
  const localesDir = getLocalesDir(repoDir);
  if (!fs.existsSync(localesDir)) {
    return [{ code: 'en', name: 'US English', hint: 'Default English' }];
  }

  const files = fs.readdirSync(localesDir).filter((f) => f.endsWith('.json'));
  const metas: I18nMeta[] = [];

  for (const file of files) {
    const code = path.basename(file, '.json');
    const fullPath = path.join(localesDir, file);
    try {
      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (content._meta) {
        metas.push(content._meta);
      } else {
        metas.push({
          code,
          name: code,
          hint: `${code} locale`,
        });
      }
    } catch {
      metas.push({ code, name: code, hint: `${code} locale` });
    }
  }

  return metas.length > 0
    ? metas
    : [{ code: 'en', name: 'US English', hint: 'Default English' }];
}

export function loadLocale(repoDir: string, code: string): I18nText {
  const cacheKey = `${repoDir}:${code}`;
  if (localeCache[cacheKey]) {
    return localeCache[cacheKey];
  }

  const localesDir = getLocalesDir(repoDir);
  const localeFile = path.join(localesDir, `${code}.json`);

  if (!fs.existsSync(localeFile)) {
    const defaultEn = path.join(localesDir, 'en.json');
    if (fs.existsSync(defaultEn)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(defaultEn, 'utf8'));
        const merged = { ...FALLBACK_EN, ...loaded };
        localeCache[cacheKey] = merged;
        return merged;
      } catch { }
    }
    localeCache[cacheKey] = FALLBACK_EN;
    return FALLBACK_EN;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(localeFile, 'utf8'));
    const merged = { ...FALLBACK_EN, ...raw };
    localeCache[cacheKey] = merged;
    return merged;
  } catch {
    localeCache[cacheKey] = FALLBACK_EN;
    return FALLBACK_EN;
  }
}

export function detectDefaultLocaleCode(): string {
  const envLang = process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || '';
  if (/zh|cn|hans/i.test(envLang)) {
    return 'zh-CN';
  }
  try {
    const sysLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (/zh/i.test(sysLocale)) return 'zh-CN';
  } catch { }
  return 'en';
}
