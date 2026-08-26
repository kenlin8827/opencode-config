export interface InstallOptions {
  rtk?: boolean;
  default_agent?: string;
  mcp?: Record<string, boolean>;
  plugin?: Record<string, boolean>;
  tiers?: Record<string, string>;
}

export type CommandAction =
  | 'install'
  | 'status'
  | 'generate'
  | 'init'
  | 'uninstall'
  | 'register'
  | 'unregister'
  | 'wizard'
  | 'dashboard';

export interface CliArgs {
  action: CommandAction;
  target?: string;
  force: boolean;
  noBackup: boolean;
  yes: boolean;
  binDir?: string;
  optionsFile?: string;
  isInteractive: boolean;
}

export interface ManifestData {
  version: string;
  files: string[];
}

export interface PreserveBag {
  profiles: Record<string, string>;
  userAgents: Record<string, any>;
  userModels: Record<string, any>;
  userEnv: Record<string, string>;
  userTiers: Record<string, string>;
}
