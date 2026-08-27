# OpenCode Agent & Development Guidelines (AGENTS.md)

This repo is **OpenCode Prime (OCP)** — a multi-agent configuration suite for [OpenCode](https://opencode.ai). It ships agent prompts, plugins, profiles, and an installer into `~/.config/opencode`. See `DEVELOPING.md` for architecture and contribution details.

---

## 1. Language Standards

All source code, agent prompts, instructions, plugin protocols, and contributor guidelines (`AGENTS.md`, `DEVELOPING.md`) must be **100% English**.

User docs are strictly bilingual: `README.md` + `docs/**` (outside `docs/zh/`) = English; `README.zh-CN.md` + `docs/zh/**` = Chinese. Never mix.

---

## 2. Release, Manifest & Packaging

The manifest (`install/versions/<VERSION>.manifest.txt`) is auto-generated from `install/src/manifest.ts` (`SHIPPED_DIRS` + `SHIPPED_FILES`). **Never hand-edit it.**

### Version Bump Steps

1. Bump `install/VERSION` (e.g. `0.7.0`). Sync `package.json` `version` + `install/README.md` title.
2. Run `bun run install/src/index.ts generate` (or `ocp generate`) to regenerate the manifest.
3. Pre-release gate: `pwsh scripts/pack.ps1 && pwsh scripts/verify.ps1` (or `.sh` variants).

### What Ships

- **Auto-discovered** (`SHIPPED_DIRS`): `agents/`, `instructions/`, `plugins/`, `profiles/`, `providers/` — all files in these dirs ship automatically.
- **Explicit** (`SHIPPED_FILES` in `manifest.ts`): `opencode.jsonc`, `tiers.json`, `tui.json`, `scripts/serena-workspace-daemon.mjs`.
- `scripts/` is NOT in `SHIPPED_DIRS` — only the one runtime script above is installed; the rest (`pack.*`, `verify.*`, `capture-*.ts`) stays repo-side. New standalone ship files must be added to `SHIPPED_FILES`.
- `install/` and `bin/` are auto-mirrored during packaging.
