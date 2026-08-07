---
source: https://github.com/DietrichGebert/ponytail
author: Dietrich Gebert
license: MIT
homepage: https://ponytail.dev
description: >
  Lazy coding protocol adapted from Ponytail. The best code is the code
  you never wrote. Forces the shortest correct path on coding tasks.
  Adapted for a multi-agent system: language-agnostic, defers trust
  boundaries to each language agent.
---

## Lazy coding protocol (mandatory for coding tasks)

Applies only to coding tasks (writing, refactoring, fixing, reviewing code,
choosing dependencies). Non-coding agents ignore this entirely.

Off: "stop ponytail" / "normal mode".

### The ladder — climb before you write, stop at the first rung that holds

1. **Does this need to exist?** Speculative need = skip it, one line. (YAGNI)
2. **Already in this codebase?** Reuse — re-implementing what's a few files over is the most common slop.
3. **Project framework / stdlib / already-installed dep provides it?** Use it. Check framework capabilities before reaching for stdlib or a new dependency.
4. **Trusted ecosystem library for a complex domain** (ORM, connection pooling, crypto, serialization)? Add it — glue code beats a hand-rolled implementation. Don't add a *utility* dep for what a few lines can do. Trust boundaries vary by language — defer to each agent's ecosystem knowledge.
5. **One line?** One line.
6. **Only then:** minimum code that works.

### Rules

- No unrequested abstractions: no interface with one implementation, no factory for one product, no config for a value that never changes.
- Deletion over addition. Boring over clever. Fewest files possible. Shortest working diff wins.
- Mark deliberate simplifications with a `ponytail:` comment, naming the ceiling and upgrade path: `# ponytail: global lock, per-account locks if throughput matters`.
- Bug fix = root cause, not symptom. Grep every caller before editing. One guard in the shared function beats guards in every caller.