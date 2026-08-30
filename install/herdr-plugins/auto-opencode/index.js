#!/usr/bin/env node
// Auto-start OpenCode in every new tab/pane.
//
// Triggered by herdr's `tab.created` / `pane.created` plugin events.
// Reads the new pane ID from HERDR_PLUGIN_CONTEXT_JSON (pane.created gives
// pane.id directly; tab.created gives tab.id — we fetch its root pane).
// Skips the pane if opencode is already running there, and uses a unique
// agent name per pane so herdr's per-pane name uniqueness rule is satisfied.

const { execFileSync } = require('node:child_process');

const herdr = process.env.HERDR_BIN_PATH || 'herdr';
const event = process.env.HERDR_PLUGIN_EVENT || '';
const ctx = JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}');

// 1. Resolve the target pane ID for this event.
function resolvePaneId() {
  // pane.created: herdr sets focused_pane_id directly on the context.
  // (The actual PaneInfo fields are exposed via focused_pane_* but the ID
  // itself is the most reliable — see src/app/api/plugins/context.rs.)
  if (ctx.focused_pane_id) return ctx.focused_pane_id;
  // tab.created: herdr gives tab_id + workspace_id. We have to ask for
  // the tab's root pane via the CLI.
  if (ctx.tab_id) {
    try {
      const out = execFileSync(herdr, ['tab', 'get', ctx.tab_id], { encoding: 'utf8' });
      const j = JSON.parse(out);
      return j.result.tab.root_pane.pane_id;
    } catch { return null; }
  }
  return null;
}

const paneId = resolvePaneId();
if (!paneId) process.exit(0);

// 2. Skip if opencode is already running in this pane (manual start, etc.)
try {
  const out = execFileSync(herdr, ['agent', 'list'], { encoding: 'utf8' });
  const j = JSON.parse(out);
  const agents = (j.result && j.result.agents) || [];
  if (agents.some((a) => a.pane_id === paneId && (a.kind === 'opencode' || a.agent === 'opencode'))) {
    process.exit(0);
  }
} catch { /* agent list failed — proceed and let agent start fail informatively */ }

// 3. Generate a unique agent name (herdr requires `[a-z][a-z0-9_-]{0,31}`).
const safe = paneId.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(-12);
const name = `oc-${safe}`.slice(0, 32);

// 4. Start opencode in the pane. Herdr's agent start waits (default 30s)
//    for the agent to reach `idle`, which is what we want — the next tab
//    only finishes booting once opencode is actually ready.
try {
  execFileSync(
    herdr,
    ['agent', 'start', name, '--kind', 'opencode', '--pane', paneId],
    { stdio: 'ignore' }
  );
} catch {
  // Don't fail noisily — the user might have started another agent, or the
  // pane might already be busy. Silent failure is the right UX here.
}