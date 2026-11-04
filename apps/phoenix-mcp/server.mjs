#!/usr/bin/env node
// Standalone PHOENIX MCP connector. No shell argument forwarding, model calls,
// repository writes, supplier installs or unapproved production actions.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { runPhoenixCosCommand } from '../../scripts/phoenix-cos-operator.mjs';

const ZERO_EFFECT = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const publish = (result) => ({
  isError: result?.ok !== true,
  structuredContent: result,
  content: [{ type: 'text', text: JSON.stringify(result) }]
});

export function createPhoenixMcpServer(run = runPhoenixCosCommand) {
  const server = new McpServer({ name: 'uberbond-phoenix', version: '0.1.0' }, { capabilities: { tools: {} } });
  const add = (name, description, inputSchema, makeArgs) => {
    server.registerTool(name, { title: name.replaceAll('_', ' '), description,
      inputSchema, annotations: ZERO_EFFECT },
      async (args) => publish(run(makeArgs(args))));
  };
  add('phoenix_status', 'Live health and separation of native runnable atoms, external registry and 1,560 research-only designs.', {}, () => ['status']);
  add('phoenix_waves', 'Verify the pinned eight PHOENIX research genomes; report unrecovered original Waves 1 and 2.', {}, () => ['waves']);
  add('phoenix_catalog', 'List the 15 verified locally executable, zero-effect native atom IDs and source hashes.', {}, () => ['catalog']);
  add('phoenix_search', 'Search all 1,560 source-pinned PHOENIX designs. Results are research, NOT installed tools.',
      { query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(20).default(5) },
      ({ query, limit }) => ['research', query, String(limit)]);
  add('phoenix_wave_page', 'Browse a given recovered source wave (3–10) by stable original proposal IDs, with evidence pointers.',
      { wave: z.number().int().min(3).max(10), offset: z.number().int().min(0).max(1560).default(0), limit: z.number().int().min(1).max(50).default(10) },
      ({ wave, offset, limit }) => ['wave', String(wave), String(offset), String(limit)]);
  add('phoenix_mission_contract', 'Compile one exact research design into a source-backed test-first contract, WITHOUT running or approving it.',
      { id: z.string().regex(/^phoenix-(?:capability|wave(?:[3-9]|10))-[0-9]{4}$/) },
      ({ id }) => ['mission', id]);
  add('phoenix_route', 'Route a mission to existing verified local native atoms, without granting execution authority.',
      { mission: z.string().trim().min(1).max(200) }, ({ mission }) => ['route', mission]);
  add('phoenix_invoke_native', 'Call one already-allowlisted deterministic zero-effect native atom, with bounded JSON input. Never invokes research suppliers or arbitrary code.',
      { atomId: z.enum([
        'proof.compile','proof.route-missing','founder.exception-prioritize','institution.compile-cell',
        'strategy.minimax-regret','authority.revoke-subtree','world.simulate-counterfactual',
        'theory.form-evidence-bound','causal.assess-witness','evaluator.coevolve',
        'architecture.generate-rivals','policy.evolve-generations','ontology.invent-language',
        'economy.compile-dsl','company.compile-genome'
      ]), input: z.record(z.unknown()) },
      ({ atomId, input }) => ['invoke', atomId, JSON.stringify(input)]);
  return server;
}

function authorized(got, expected) {
  if (typeof got !== 'string' || typeof expected !== 'string' || expected.length < 32) return false;
  const a = Buffer.from(got); const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function startHttp({ port = Number(process.env.PHOENIX_MCP_PORT || '3887'),
  host = '127.0.0.1', token = process.env.PHOENIX_MCP_BEARER_TOKEN } = {}) {
  if (!token || token.length < 32) throw new Error('PHOENIX_MCP_BEARER_TOKEN_REQUIRED_MIN_32_CHAR');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('INVALID_LISTEN_PORT');
  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json','cache-control':'no-store' });
      res.end(JSON.stringify({ ok: true, service: 'phoenix-mcp', authentication: 'required' }));
      return;
    }
    if (req.url !== '/mcp') { res.writeHead(404); res.end(); return; }
    if (!authorized(req.headers.authorization, token)) { res.writeHead(401, { 'www-authenticate': 'Bearer', 'cache-control': 'no-store' }); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); res.end(); return; }
    const length = Number(req.headers['content-length'] || 0);
    if (!Number.isFinite(length) || length < 0 || length > 65536) { res.writeHead(413); res.end(); return; }
    const chunks = []; let bytes = 0; let oversized = false;
    req.on('data', chunk => { bytes += chunk.length; if (bytes > 65536) { oversized = true; req.destroy(); } else chunks.push(chunk); });
    req.on('end', async () => {
      if (oversized) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { res.writeHead(400); res.end(); return; }
      const mcp = createPhoenixMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      try {
        await mcp.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch {
        if (!res.headersSent) { res.writeHead(500); res.end(); }
      } finally { await mcp.close().catch(() => {}); }
    });
  });
  await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(port, host, resolve); });
  return httpServer;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (process.argv.length === 3 && process.argv[2] === '--stdio') {
    await createPhoenixMcpServer().connect(new StdioServerTransport());
  } else if (process.argv.length === 3 && process.argv[2] === '--http') {
    await startHttp();
    process.stderr.write('PHOENIX_MCP_LISTENING_LOOPBACK\n');
  } else {
    process.stderr.write('USE --stdio OR --http\n');
    process.exitCode = 2;
  }
}
