import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createPhoenixMcpServer, startHttp } from '../server.mjs';

function assertZero(r) {
  const o = r.structuredContent;
  assert.ok(o);
  assert.equal(o.externalEffectAuthority, 'NONE');
  assert.equal(o.businessEffectAuthority, 'NONE');
  assert.equal(o.externalEffectLedger.providerCalls, 0);
  assert.equal(o.externalEffectLedger.spendCents, 0);
}

test('real MCP client: discover, source-query, execute authorized native function and deny unknown tools', async () => {
  const mcp = createPhoenixMcpServer();
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'phoenix-integration-test', version: '1.0.0' });
  await mcp.connect(b);
  try {
    await client.connect(a);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 8);
    assert.ok(tools.some(x => x.name === 'phoenix_invoke_native'));
    assert.ok(tools.every(x => x.annotations?.readOnlyHint === true));
    const status = await client.callTool({ name: 'phoenix_status', arguments: {} });
    assert.equal(status.structuredContent.ok, true);
    assert.equal(status.structuredContent.native.active, 15);
    assert.equal(status.structuredContent.research.count, 1560);
    assertZero(status);
    const lookup = await client.callTool({ name: 'phoenix_search', arguments: { query: 'proof evidence', limit: 2 } });
    assert.equal(lookup.structuredContent.research.count, 2);
    assertZero(lookup);
    const mission = await client.callTool({ name: 'phoenix_mission_contract', arguments: { id: 'phoenix-wave4-0001' } });
    assert.equal(mission.structuredContent.proposal.canExecuteNow, false);
    assertZero(mission);
    const invoked = await client.callTool({ name: 'phoenix_invoke_native', arguments: { atomId: 'founder.exception-prioritize', input: { exceptions: [] } } });
    assert.equal(invoked.structuredContent.status, 'COS_NATIVE_ATOM_EXECUTED');
    assert.equal(invoked.structuredContent.result.ok, true);
    assertZero(invoked);
    const unknown = await client.callTool({ name: 'shell_exec', arguments: { cmd: 'whoami' } });
    assert.equal(unknown.isError, true);
    const forbidden = await client.callTool({ name: 'phoenix_invoke_native', arguments: { atomId: 'anything', input: {} } });
    assert.equal(forbidden.isError, true);
  } finally { await client.close(); await mcp.close(); }
});

test('HTTP: bearer token required, real MCP handshake and stateless tool invocation', async () => {
  const token = randomBytes(32).toString('hex');
  const server = await startHttp({ port: 0, token });
  try {
    const url = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
    const denied = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
    assert.equal(denied.status, 401);
    const client = new Client({ name: 'phoenix-http-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
    try {
      await client.connect(transport);
      const list = await client.listTools();
      assert.equal(list.tools.length, 8);
      const out = await client.callTool({ name: 'phoenix_waves', arguments: {} });
      assert.equal(out.structuredContent.recoveredProposals, 1560);
      assertZero(out);
    } finally { await client.close(); }
  } finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
});

test('HTTP refuses starting without a protected bearer token', async () => {
  await assert.rejects(() => startHttp({ port: 0, token: 'short' }), /PHOENIX_MCP_BEARER_TOKEN_REQUIRED/);
});

test('real subprocess MCP stdio transport exposes PHOENIX tools', async () => {
  const client = new Client({ name: 'phoenix-stdio-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['server.mjs', '--stdio'], cwd: new URL('..', import.meta.url).pathname });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 8);
    const result = await client.callTool({ name: 'phoenix_status', arguments: {} });
    assert.equal(result.structuredContent.native.active, 15);
    assertZero(result);
  } finally { await client.close(); }
});


test('HTTP rejects wrong bearer, malformed JSON, methods and oversized bodies', async () => {
 const token = randomBytes(32).toString('hex'); const server = await startHttp({port:0,token});
 try {
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer wrong'},body:'{}'})).status,401);
  const headers={Authorization:`Bearer ${token}`,'content-type':'application/json'};
  assert.equal((await fetch(url,{method:'GET',headers})).status,405);
  assert.equal((await fetch(url,{method:'POST',headers,body:'{broken'})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers,body:'a'.repeat(65537)})).status,413);
  assert.equal((await fetch(url+'-unknown',{method:'POST',headers,body:'{}'})).status,404);
 } finally { await new Promise(resolve=>server.close(resolve)); }
});
