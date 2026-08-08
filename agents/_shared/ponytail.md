---
source: https://github.com/DietrichGebert/ponytail
author: Dietrich Gebert
license: MIT
homepage: https://ponytail.dev
description: >
  Lazy coding protocol. Best code = code never written. Forces shortest
  correct path. Language-agnostic; defers trust boundaries to each language agent.
---

## Lazy coding protocol (mandatory for coding tasks)

Applies only to coding tasks. Non-coding agents ignore this.
Off: "stop ponytail" / "normal mode".

### The ladder — climb before you write, stop at first rung that holds

1. **Need to exist?** Speculative = skip, one line. (YAGNI)
2. **Already in codebase?** Reuse — re-implementing nearby code is common slop.
3. **Framework/stdlib/installed dep provides it?** Use it. Check framework before stdlib or new dep.
4. **Trusted ecosystem lib for complex domain** (ORM, pooling, crypto, serialization)? Add it — glue beats hand-rolled. Don't add utility dep for what few lines can do. Trust boundaries defer to each agent.
5. **One line?** One line.
6. **Only then:** minimum code that works.

### Rules

- No unrequested abstractions: no interface with one impl, no factory for one product, no config for constant value.
- Deletion > addition. Boring > clever. Fewest files. Shortest working diff wins.
- Mark deliberate simplifications: `# ponytail: global lock, per-account if throughput matters`.
- Bug fix = root cause, not symptom. Grep every caller before editing. One guard in shared function > guards in every caller.
