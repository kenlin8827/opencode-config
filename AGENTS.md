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

### Full Release & Deploy Flow

After version bump, manifest regeneration, and pre-release gate pass:

1. **Merge to main** — `git checkout main && git merge dev-<VERSION>.x --no-ff`
2. **Tag** — `git tag v<VERSION>` (e.g. `v0.7.0`)
3. **Push** — `git push origin main` then `git push origin v<VERSION>` (tag push triggers the Release workflow automatically; `--follow-tags` may not push annotated tags reliably)
4. **GitHub Actions auto-run**:
   - `Release` workflow (triggered by `v*` tag): runs `pack.sh` + `verify.sh`, creates GitHub Release with `tar.gz`/`zip` + `latest` aliases.
   - `Deploy Docs` workflow (triggered by push to `main` with `docs/**` changes): builds VitePress and deploys to GitHub Pages.
5. **Verify** — `gh run list --workflow=release.yml --limit 1` and `gh run list --workflow=deploy-docs.yml --limit 1`; both must show `success`.

> **Pitfall**: `git push origin main --follow-tags` does NOT reliably push lightweight tags. Always push the tag explicitly: `git push origin v<VERSION>`.

### What Ships

- **Auto-discovered** (`SHIPPED_DIRS`): `agents/`, `instructions/`, `plugins/`, `profiles/`, `providers/` — all files in these dirs ship automatically.
- **Explicit** (`SHIPPED_FILES` in `manifest.ts`): `opencode.jsonc`, `tiers.json`, `tui.json`, `scripts/serena-workspace-daemon.mjs`.
- `scripts/` is NOT in `SHIPPED_DIRS` — only the one runtime script above is installed; the rest (`pack.*`, `verify.*`, `capture-*.ts`) stays repo-side. New standalone ship files must be added to `SHIPPED_FILES`.
- `install/` and `bin/` are auto-mirrored during packaging.
