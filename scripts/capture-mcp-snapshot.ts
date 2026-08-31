/**
 * One-shot capture (dev-only): perform a real MCP initialize handshake with
 * each enabled template server and snapshot `instructions` + tool names.
 * Output feeds scripts/measure-prompts.ts as the mcp_instructions cost basis.
 *
 * Usage: bun run scripts/capture-mcp-snapshot.ts
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const repoDir = path.resolve(__dirname, '..');
const servers: Record<string, { command: string[] }> = {
  serena: {
    command: ['node', path.join(repoDir, 'scripts', 'serena-workspace-daemon.mjs')],
  },
  codegraph: { command: ['codegraph', 'serve', '--mcp'] },
};

async function capture(name: string, command: string[]): Promise<any> {
  // shell:true so Windows .cmd shims (codegraph.cmd) resolve from PATH
  const child = spawn(command[0], command.slice(1), { cwd: repoDir, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: child.stdout });
  const responses = new Map<number, any>();
  rl.on('line', (line) => {
    const t = line.trim();
    if (!t.startsWith('{')) return;
    try {
      const msg = JSON.parse(t);
      if (msg.id !== undefined) responses.set(msg.id, msg);
    } catch {}
  });
  const send = (obj: any) => child.stdin.write(JSON.stringify(obj) + '\n');
  const waitFor = async (id: number, timeoutMs = 45000): Promise<any> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (responses.has(id)) return responses.get(id);
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`${name}: timeout waiting for response id=${id}`);
  };

  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ocp-measure', version: '1.0.0' },
    },
  });
  const init = await waitFor(1);
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const toolsResp = await waitFor(2).catch(() => null);
  child.kill();
  const tools = toolsResp?.result?.tools ?? [];
  return {
    serverInfo: init.result?.serverInfo ?? null,
    instructions: init.result?.instructions ?? '',
    tools: tools.map((t: any) => t.name),
    // The tool definitions (name + description + JSON schema) are what actually
    // cost tokens per step — typically far larger than `instructions`.
    toolSchemaChars: JSON.stringify(tools).length,
  };
}

const snapshot: Record<string, any> = {
  capturedAt: new Date().toISOString(),
  note: 'Real MCP initialize handshake against the shipped template commands. Consumed by scripts/measure-prompts.ts.',
  servers: {},
};
for (const [name, def] of Object.entries(servers)) {
  try {
    snapshot.servers[name] = await capture(name, def.command);
    const s = snapshot.servers[name];
    console.log(`${name}: ${s.tools.length} tools, instructions ${s.instructions.length} chars, tool schemas ${s.toolSchemaChars} chars`);
  } catch (e: any) {
    console.log(`${name}: FAILED - ${e.message}`);
    snapshot.servers[name] = { error: e.message };
  }
}
const out = path.join(repoDir, 'scripts', 'mcp-instructions.snapshot.json');
fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
console.log(`written: ${out}`);
process.exit(0);
