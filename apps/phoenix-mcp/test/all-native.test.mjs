import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fixtures } from './native-fixtures.mjs';
const cwd = new URL('..', import.meta.url).pathname;
async function connect() {
 const client = new Client({name:'phoenix-all-native-verification',version:'1.0.0'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:['server.mjs','--stdio'],cwd}));
 return client;
}
test('all fifteen native atoms through real subprocess MCP, denial and restart', async () => {
 let client=await connect(); const receipts=[];
 try {
  const tools=(await client.listTools()).tools;
  assert.equal(tools.length,8);
  assert.ok(tools.every(t=>t.annotations.readOnlyHint && !t.annotations.destructiveHint));
  const status=await client.callTool({name:'phoenix_status',arguments:{}});
  const catalog=await client.callTool({name:'phoenix_catalog',arguments:{}});
  assert.equal(status.structuredContent.native.active,15);
  assert.deepEqual(catalog.structuredContent.capabilities.map(c=>c.atomId).sort(),fixtures.map(f=>f[0]).sort());
  for(const [atomId,input] of fixtures) {
   const call={name:'phoenix_invoke_native',arguments:{atomId,input}};
   const receipt=await client.callTool(call); const out=receipt.structuredContent;
   assert.equal(receipt.isError,false,atomId+JSON.stringify(receipt));
   assert.equal(out.status,'COS_NATIVE_ATOM_EXECUTED'); assert.equal(out.result.ok,true);
   assert.equal(out.externalEffectAuthority,'NONE'); assert.equal(out.businessEffectAuthority,'NONE');
   assert.ok(Object.values(out.externalEffectLedger).every(v=>v===0));
   assert.match(out.sourceHash,/^[a-f0-9]{64}$/);
   const repeated=await client.callTool(call); assert.deepEqual(repeated,receipt);
   receipts.push({atomId,input,receipt,receiptDigest:createHash('sha256').update(JSON.stringify(receipt)).digest('hex')});
  }
  for(const args of [{atomId:'shell.exec',input:{}},{atomId:'founder.exception-prioritize',input:[]},{atomId:'founder.exception-prioritize',input:{x:'a'.repeat(13000)}},{atomId:'world.simulate-counterfactual',input:{steps:13}}]) {
   assert.equal((await client.callTool({name:'phoenix_invoke_native',arguments:args})).isError,true);
  }
  assert.equal((await client.callTool({name:'shell_exec',arguments:{}})).isError,true);
  await client.close(); client=await connect();
  const restart=await client.callTool({name:'phoenix_invoke_native',arguments:{atomId:'founder.exception-prioritize',input:{exceptions:[]}}});
  assert.deepEqual(restart,receipts.find(r=>r.atomId==='founder.exception-prioritize').receipt);
  if(process.env.PHOENIX_WRITE_TEST_RECEIPTS==='1') {
   const dir=new URL('../../../artifacts/phoenix-activation-verification/',import.meta.url); mkdirSync(dir,{recursive:true});
   writeFileSync(new URL('native-mcp-receipts.json',dir),JSON.stringify({observedAt:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim(),transport:'REAL_SUBPROCESS_STDIO_MCP',chatgptIndependentConnector:false,tools:tools.map(t=>t.name),status,catalog,receipts,restart},null,2)+'\n');
  }
 } finally { await client.close(); }
});
