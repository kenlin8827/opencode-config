"""
Batch rename dev-flow slash commands from `[X]-dev` to `dev-[X]`.

Mapping:
  /quick-dev   -> /dev-quick
  /flash-dev   -> /dev-flash   (alias of /dev-quick)
  /plan-dev    -> /dev-plan
  /review-dev  -> /dev-review
  /prud-dev    -> /dev-prud
  /ultra-dev   -> /dev-ultra

Strategy:
  * Phase 1: three-pass rename in every relevant file (most specific first):
      Pass 1: `/<old>.md` -> `/<new>.md`
      Pass 2: `/<old>`    -> `/<new>`
      Pass 3: `\b<old>\b` -> `<new>`     (bare tokens, e.g. "quick-dev preset")
  * Phase 2: rename docs/workflows/* files (no compat concerns)
  * Phase 3: convert commands/<old>.md to DEPRECATED aliases (preserves
    backward-compat), then create commands/<new>.md as the canonical entries.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

RENAMES: list[tuple[str, str]] = [
    ("quick-dev", "dev-quick"),
    ("flash-dev", "dev-flash"),
    ("plan-dev", "dev-plan"),
    ("review-dev", "dev-review"),
    ("prud-dev", "dev-prud"),
    ("ultra-dev", "dev-ultra"),
]

# Files whose *content* is rewritten in place (Phase 1)
CONTENT_FILES: list[str] = [
    ".tmp-sync.ps1",
    "DEVELOPING.md",
    "README.md",
    "README.zh-CN.md",
    # commands/ — all 7 dev/*.md touched, content becomes the deprecated alias form
    "commands/dev.md",
    "commands/quick-dev.md",
    "commands/flash-dev.md",
    "commands/plan-dev.md",
    "commands/prud-dev.md",
    "commands/review-dev.md",
    "commands/ultra-dev.md",
    # docs/
    "docs/SUMMARY.md",
    "docs/index.md",
    "docs/getting-started/index.md",
    "docs/workflows/commands.md",
    "docs/workflows/dev-loops.md",
    "docs/workflows/dev.md",
    "docs/workflows/plan-dev.md",
    "docs/workflows/plugins.md",
    "docs/workflows/prud-dev.md",
    "docs/workflows/review-dev.md",
    # docs/zh/
    "docs/zh/index.md",
    "docs/zh/getting-started/index.md",
    "docs/zh/workflows/commands.md",
    "docs/zh/workflows/dev-loops.md",
    "docs/zh/workflows/dev.md",
    "docs/zh/workflows/plan-dev.md",
    "docs/zh/workflows/plugins.md",
    "docs/zh/workflows/prud-dev.md",
    "docs/zh/workflows/review-dev.md",
    # misc
    "opencode.template.jsonc",
    "prompts/build.md",
    "prompts/plan.md",
    "skills/dev/SKILL.md",
    "skills/prud-dev/SKILL.md",
    "skills/ultra-dev/SKILL.md",
    "tests/test-all.ps1",
]

# docs/workflows/* files rename (Phase 2) — docs have no compat concerns
DOC_RENAMES: list[tuple[str, str]] = [
    ("docs/workflows/plan-dev.md", "docs/workflows/dev-plan.md"),
    ("docs/workflows/prud-dev.md", "docs/workflows/dev-prud.md"),
    ("docs/workflows/review-dev.md", "docs/workflows/dev-review.md"),
    ("docs/zh/workflows/plan-dev.md", "docs/zh/workflows/dev-plan.md"),
    ("docs/zh/workflows/prud-dev.md", "docs/zh/workflows/dev-prud.md"),
    ("docs/zh/workflows/review-dev.md", "docs/zh/workflows/dev-review.md"),
]


def replace_in_text(text: str) -> tuple[str, int]:
    """Apply three-pass rename to a string. Returns (new_text, changed_passes)."""
    changed_passes = 0
    # Pass 1: file path references
    for old, new in RENAMES:
        before = text
        text = text.replace(f"/{old}.md", f"/{new}.md")
        if before != text:
            changed_passes += 1
    # Pass 2: slash commands
    for old, new in RENAMES:
        before = text
        text = text.replace(f"/{old}", f"/{new}")
        if before != text:
            changed_passes += 1
    # Pass 3: bare tokens (word boundary)
    for old, new in RENAMES:
        before = text
        text = re.sub(rf"\b{re.escape(old)}\b", new, text)
        if before != text:
            changed_passes += 1
    return text, changed_passes


def mutate_file(rel: str) -> bool:
    path = ROOT / rel
    if not path.exists():
        print(f"  [skip] {rel} (not found)")
        return False
    original = path.read_text(encoding="utf-8")
    updated, passes = replace_in_text(original)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        print(f"  [ok]   {rel} ({passes} passes)")
        return True
    print(f"  [noop] {rel}")
    return False


def rename_file(old_rel: str, new_rel: str) -> None:
    old_p = ROOT / old_rel
    new_p = ROOT / new_rel
    if not old_p.exists():
        print(f"  [skip] {old_rel} (missing)")
        return
    if new_p.exists():
        print(f"  [skip] {new_rel} already exists")
        return
    new_p.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(old_p), str(new_p))
    print(f"  [mv]    {old_rel}  ->  {new_rel}")


# ---------- Phase 3: deprecated alias + new canonical command files ----------

# Per-command spec for both the deprecated alias stub and the new canonical entry.
# `description_long` is the "philosophy/usage" line used in the new file's front matter.
COMMAND_SPECS: dict[str, dict[str, str]] = {
    "quick-dev": {
        "new": "dev-quick",
        "description_long": (
            "Dev-Quick - zero-review fast track: flash-tier @fast-coder coding + "
            "instant delivery, cheapest path for low-stakes tasks "
            "(optional --review for single audit). "
            "Usage: /dev-quick <requirements> [--review] [--max-rounds=N]"
        ),
        "preset_action": "no depth flags (--review → --code-review=1; --max-rounds default 3)",
        "preset_label": "dev-quick preset",
    },
    "flash-dev": {
        "new": "dev-flash",
        "description_long": (
            "Dev-Flash (alias of /dev-quick) - zero-review fast track: flash-tier "
            "@fast-coder coding + instant delivery. "
            "Usage: /dev-flash <requirements>"
        ),
        "preset_action": "no depth flags (--review → --code-review=1; --max-rounds default 3)",
        "preset_label": "dev-quick preset",
    },
    "plan-dev": {
        "new": "dev-plan",
        "description_long": (
            "Dev-Plan - plan-first development: @advisor clarification + @architect plan + "
            "domain-routed implementation, with optional single review on demand. "
            "Usage: /dev-plan <requirement> [--review] [--max-rounds=N]"
        ),
        "preset_action": "--plan (--review → --code-review=1; --max-rounds default 5)",
        "preset_label": "dev-plan preset",
    },
    "review-dev": {
        "new": "dev-review",
        "description_long": (
            "Dev-Review - mission-critical dual-review consensus loop: domain-routed coding "
            "+ dual review + Advisor arbitration (default max 10 rounds). "
            "Usage: /dev-review <task> [--max-rounds=N]"
        ),
        "preset_action": "--code-review=2 (--max-rounds default 10)",
        "preset_label": "dev-review preset",
    },
    "prud-dev": {
        "new": "dev-prud",
        "description_long": (
            "Dev-Prud - FMEA-front-loaded development - Socratic clarification plus a "
            "pre-implementation risk register (SEVxPROB ranked, top-N) that drives "
            "planning, implementation, and register-audited verification. "
            "Usage: /dev-prud <requirement> [--top=N] [--max-rounds=N]"
        ),
        "preset_action": "prud-dev standalone protocol (FMEA-register driven)",
        "preset_label": "prud-dev protocol",
    },
    "ultra-dev": {
        "new": "dev-ultra",
        "description_long": (
            "Dev-Ultra - autonomous goal-driven multi-phase development: "
            "objective decomposition + domain-routed coding + dual review + Advisor "
            "arbitration per phase (default 10 rounds/phase, 6 phases). "
            "Usage: /dev-ultra <objective> [--max-rounds=N] [--max-phases=N] [--resume]"
        ),
        "preset_action": "ultra-dev standalone protocol (multi-phase + compaction + --resume)",
        "preset_label": "ultra-dev protocol",
    },
}


def write_new_command_file(old_key: str) -> None:
    """Write the canonical commands/dev-<new>.md."""
    spec = COMMAND_SPECS[old_key]
    new_slug = spec["new"]
    new_path = ROOT / f"commands/dev-{new_slug.split('-', 1)[1]}.md"

    # Determine if it's a sub-skill-load or a /dev preset shortcut.
    if old_key in ("prud-dev", "ultra-dev"):
        skill_key = old_key  # loads skills/<old_key>/SKILL.md
        body = (
            f"Load the {skill_key} skill and follow it strictly.\n\n"
            f"User request: $ARGUMENTS\n"
        )
    else:
        body = (
            f"Load the dev skill and execute it with the **{spec['preset_label']}**: "
            f"{spec['preset_action']}.\n\n"
            f"User request: $ARGUMENTS\n"
        )

    front_matter = (
        "---\n"
        f"description: {spec['description_long']}\n"
        "agent: build\n"
        "---\n\n"
    )
    new_path.write_text(front_matter + body, encoding="utf-8")
    print(f"  [new]  commands/dev-{new_slug.split('-', 1)[1]}.md")


def rewrite_alias_stub(old_key: str) -> None:
    """Rewrite commands/<old>.md into a DEPRECATED alias stub."""
    spec = COMMAND_SPECS[old_key]
    old_path = ROOT / f"commands/{old_key}.md"

    desc = (
        f"DEPRECATED alias — use /{spec['new']}. "
        f"Equivalent to /{spec['new']} (loads dev skill, {spec['preset_label']}). "
        f"Kept for backward-compat with existing scripts/macros that call /{old_key}."
    )

    # We re-derive the new slug relative to the file: e.g. quick-dev -> dev-quick
    new_slug = spec["new"]
    body_lines = [
        "---",
        f"description: {desc}",
        "agent: build",
        "---",
        "",
        "This command is **deprecated**. Use **`/" + new_slug + "`** instead.",
        "",
        f"Loading the dev skill with the **{spec['preset_label']}**: {spec['preset_action']}.",
        "",
        "User request: $ARGUMENTS",
        "",
    ]
    old_path.write_text("\n".join(body_lines), encoding="utf-8")
    print(f"  [alias] commands/{old_key}.md  (stub -> /{new_slug})")


def main() -> None:
    print("== Phase 1: in-place content rewrite ==")
    touched = 0
    for rel in CONTENT_FILES:
        if mutate_file(rel):
            touched += 1
    print(f"\n{touched} files mutated.\n")

    print("== Phase 2: docs/workflows file rename ==")
    for old_rel, new_rel in DOC_RENAMES:
        rename_file(old_rel, new_rel)
    print()

    print("== Phase 3: commands/<old>.md -> deprecated alias; create dev-*.md ==")
    for old_key in COMMAND_SPECS.keys():
        rewrite_alias_stub(old_key)
        write_new_command_file(old_key)
    print()


if __name__ == "__main__":
    main()
