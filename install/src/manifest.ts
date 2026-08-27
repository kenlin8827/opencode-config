import fs from 'node:fs';
import path from 'node:path';

// Directories and standalone files that belong to the installed config.
// `scripts/` is intentionally NOT in SHIPPED_DIRS — only the runtime scripts
// listed in SHIPPED_FILES below are installed (the rest of scripts/ contains
// release tooling like pack.sh/verify.sh that must stay repo-side).
const SHIPPED_DIRS = ['agents', 'instructions', 'plugins', 'profiles', 'providers'];
const SHIPPED_FILES = [
  'opencode.jsonc', //  core config — merged by installer/merger.ts
  'tiers.json',     //  agent→tier map — merged by installer/merger.ts
  'tui.json',       //  TUI config + plugin registration, read by opencode at runtime
  // Runtime script referenced by opencode.jsonc MCP config (serena command):
  //   node -e "import(... .config/opencode/scripts/serena-workspace-daemon.mjs)"
  'scripts/serena-workspace-daemon.mjs',
];

export function collectShippedFiles(repoDir: string): string[] {
  const files: string[] = [];

  for (const dirName of SHIPPED_DIRS) {
    const dirPath = path.join(repoDir, dirName);
    if (!fs.existsSync(dirPath)) continue;

    const walk = (curDir: string) => {
      const entries = fs.readdirSync(curDir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(curDir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.isFile()) {
          const rel = path.relative(repoDir, full).replace(/\\/g, '/');
          files.push(rel);
        }
      }
    };
    walk(dirPath);
  }

  for (const fileName of SHIPPED_FILES) {
    const full = path.join(repoDir, fileName);
    if (fs.existsSync(full)) {
      files.push(fileName);
    }
  }

  return files.sort();
}

export function getManifestPath(repoDir: string, version: string): string {
  return path.join(repoDir, 'install', 'versions', `${version}.manifest.txt`);
}

export function readManifest(manifestPath: string): string[] | null {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return null;
  }
}

export function generateManifest(repoDir: string, version: string): { path: string; count: number } {
  const files = collectShippedFiles(repoDir);
  const versionsDir = path.join(repoDir, 'install', 'versions');
  if (!fs.existsSync(versionsDir)) {
    fs.mkdirSync(versionsDir, { recursive: true });
  }

  const manifestPath = getManifestPath(repoDir, version);
  fs.writeFileSync(manifestPath, files.join('\n') + '\n', 'utf8');
  return { path: manifestPath, count: files.length };
}

export function computeFilesToRemove(
  repoDir: string,
  prevVersion: string,
  curVersion: string
): string[] {
  const prevManifest = readManifest(getManifestPath(repoDir, prevVersion));
  if (!prevManifest) return [];

  const curManifest = readManifest(getManifestPath(repoDir, curVersion)) || collectShippedFiles(repoDir);
  const curSet = new Set(curManifest);

  return prevManifest.filter((f) => !curSet.has(f));
}
