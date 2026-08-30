# OpenCode Agent & Development Guidelines (AGENTS.md)

This repo is **OpenCode Prime (OCP)** — a multi-agent configuration suite for [OpenCode](https://opencode.ai). It ships agent prompts, plugins, profiles, and an installer into `~/.config/opencode`. See `DEVELOPING.md` for architecture and contribution details.

---

## Ships vs. Dev-Only

- **Ships** (injected into OpenCode agent system prompts): `instructions/*.md`, `agents/*.md`, plus all files under `plugins/`, `profiles/`, `providers/`. These are the actual prompts users consume — every line costs tokens on every session, forever.
- **Dev-only** (repo tooling, never shipped): `AGENTS.md`, `DEVELOPING.md`, `scripts/`, `docs/`, `install/`, `bin/`. These guide contributors working on this repository and are never injected into a user's OpenCode session.

All rules in this document (token budget, cross-references, release flow) exist to serve the shipped prompts. When you edit `instructions/` or `agents/`, you are editing what every OpenCode session will load.

---

## 1. Language Standards

All source code, agent prompts, instructions, plugin protocols, and contributor guidelines (`AGENTS.md`, `DEVELOPING.md`) must be **100% English**.

User docs are strictly bilingual: `README.md` + `docs/**` (outside `docs/zh/`) = English; `README.zh-CN.md` + `docs/zh/**` = Chinese. Never mix.

---

## 2. Token Budget — Prompt Compression

Every file under `instructions/` and `agents/` is injected into agent system prompts at session start. A single session opens with all instructions + agent prompt + context — often tens of thousands of tokens before the user's first message. **Token cost is real money.** Bloated prompts violate the project's core philosophy of efficiency.

### Rules

1. **Instruction files** (`instructions/*.md`) — **MUST** stay under **60 lines**. If a rule needs more, split it into a separate file or compress. Tables over prose, rules over explanations.
2. **Agent prompts** (`agents/*.md`) — **SHOULD** stay under **120 lines**. Competency lists, hard rules, output format. Cut prose, keep structure.
3. **No redundant explanations** — if a rule says "prefer X over Y", don't follow with 3 sentences explaining why Y is bad. The rule itself is the explanation. RFC 2119 keywords carry weight; trust them.
4. **Examples** — max 1 concise example per rule. If the rule is clear without an example, omit it.
5. **Cross-reference, don't duplicate** — in shipped prompt files (`instructions/*.md`, `agents/*.md`), if a rule exists in another shipped file, reference it by shorthand (`cp#3` = `coding-principles.md` row 3) instead of restating it. The LLM resolves these at runtime because all instruction/agent files are injected into the system prompt together. Never use such shorthand in dev-only files (`AGENTS.md`, `DEVELOPING.md`) — token economy only matters for shipped prompts.
6. **Review before merge** — any new instruction or agent file **SHOULD** be reviewed for token economy. If a section can be cut without losing normative power, cut it.

> **Principle**: Every line in a prompt file costs money on every single session, forever. A 200-line instruction file that could be 50 lines wastes 150 tokens × every session × every user. Compress ruthlessly.

---

## 3. Release, Manifest & Packaging

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
- **Explicit** (`SHIPPED_FILES` in `manifest.ts`): `opencode.template.jsonc`, `tiers.json`, `tui.template.jsonc`, `scripts/serena-workspace-daemon.mjs`.
- `scripts/` is NOT in `SHIPPED_DIRS` — only the one runtime script above is installed; the rest (`pack.*`, `verify.*`, `capture-*.ts`) stays repo-side. New standalone ship files must be added to `SHIPPED_FILES`.
- `install/` and `bin/` are auto-mirrored during packaging.
