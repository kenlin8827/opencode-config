export interface InstallOptions {
  rtk?: boolean;
  default_agent?: string;
  mcp?: Record<string, boolean>;
  plugin?: Record<string, boolean>;
  tiers?: Record<string, string>;
  // true (default) = register global command shims (ocp / opencode-prime)
  // into ~/.local/bin and ensure that directory is on the
  // user's PATH; false = skip global command registration entirely.
  global_commands?: boolean;
  // true (default) = install the OpenChamber web UI CLI (`openchamber`)
  // globally via the detected package manager when missing — it powers
  // `ocp web`; the native desktop app behind `ocp desktop` / `ocp ui` is a
  // separate download; false = skip provisioning.
  openchamber?: boolean;
}

export type CommandAction =
  | 'install'
  | 'update'
  | 'upgrade'
  | 'status'
  | 'generate'
  | 'init'
  | 'uninstall'
  | 'register'
  | 'unregister'
  | 'wizard'
  | 'dashboard'
  | 'tui'
  | 'serve'
  | 'web'
  | 'desktop';

export interface CliArgs {
  action: CommandAction;
  target?: string;
  force: boolean;
  noBackup: boolean;
  // Max backup directories kept beside the target after each run.
  // Unset = OCP_MAX_BACKUPS env, else 5 (see installer.getMaxBackups).
  keepBackups?: number;
  yes: boolean;
  binDir?: string;
  optionsFile?: string;
  isInteractive: boolean;
  // Arguments forwarded verbatim to the launched binary (`tui` / `desktop`).
  passthrough?: string[];
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
