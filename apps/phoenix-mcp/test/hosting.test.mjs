import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startHttp } from '../server.mjs';

const listen = (opts) => startHttp({ port: 0, token: randomBytes(32).toString('hex'), ...opts });
test('HTTP deployment host defaults to loopback', async () => {
  const before = process.env.PHOENIX_MCP_HOST;
  delete process.env.PHOENIX_MCP_HOST;
  const server = await listen();
  try { assert.equal(server.address().address, '127.0.0.1'); }
  finally { await new Promise(resolve=>server.close(resolve)); if (before === undefined) delete process.env.PHOENIX_MCP_HOST; else process.env.PHOENIX_MCP_HOST=before; }
});
test('explicit Railway-style host permits binding to all interfaces', async () => {
  const before = process.env.PHOENIX_MCP_HOST;
  process.env.PHOENIX_MCP_HOST='0.0.0.0';
  const server = await listen();
  try { assert.equal(server.address().address, '0.0.0.0'); }
  finally { await new Promise(resolve=>server.close(resolve)); if (before === undefined) delete process.env.PHOENIX_MCP_HOST; else process.env.PHOENIX_MCP_HOST=before; }
});
test('unexpected public bind option falls back to loopback', async () => {
  const before = process.env.PHOENIX_MCP_HOST;
  process.env.PHOENIX_MCP_HOST='::';
  const server = await listen();
  try { assert.equal(server.address().address, '127.0.0.1'); }
  finally { await new Promise(resolve=>server.close(resolve)); if (before === undefined) delete process.env.PHOENIX_MCP_HOST; else process.env.PHOENIX_MCP_HOST=before; }
});
