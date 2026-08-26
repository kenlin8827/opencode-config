# Clients & UI Options

OpenCode features an open, modular frontend ecosystem. Whether you prefer a lightweight terminal environment or a graphical dual-column diff review experience, you can seamlessly switch based on your workflow.

---

## Supported Interfaces

| Interface | Best for | Key Advantages | How to Launch |
|---|---|---|---|
| **Terminal TUI (Default)** | Command-line power users, SSH remote development | Ultra-lightweight, sub-millisecond response, native keyboard flow | Run `opencode` directly in terminal |
| **OpenChamber Desktop** | Visual review, side-by-side comparison | **Visual Side-by-Side Diff**, multi-model parallel Fusion & comparison, session timeline | Download [OpenChamber](https://openchamber.dev) app or VS Code extension |
| **Built-in Web UI** | LAN access, lightweight browser experience | Zero local desktop installation, instant web access | Run `opencode serve` in terminal and open browser |

---

## Seamless Configuration Sharing

No matter which client interface you choose, all engineering capabilities installed in `~/.config/opencode` are automatically active and 100% shared:

- **21 Specialist Agents**: `@java-dev`, `@security`, `@dba`, etc. are available across all clients;
- **MCP Code Intelligence**: Serena LSP, CodeGraph knowledge graph, and DBHub database gateway work out-of-the-box;
- **Model Profiles**: Tier assignments configured via `/profile` apply uniformly;
- **Project Guardrails**: ADR enforcement, secret guarding, and commit discipline apply consistently.

You can switch between Terminal, Desktop GUI, and Web UI at any time with zero re-configuration!

---

## Next Steps

- Return to the Quick Start guide: **[Quick Install & Dashboard](/getting-started/)**
- Check project initialization: **[Project Initialization & Guardrails](/getting-started/project-init)**
- Check system prerequisites: **[Prerequisites & Source Install](/getting-started/prerequisites)**
