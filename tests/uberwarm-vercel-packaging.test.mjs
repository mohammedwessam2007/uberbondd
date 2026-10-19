import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
const root=new URL('../',import.meta.url);
const cfg=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
for(const route of ['api/unsubscribe.mjs','api/webhooks/winnr.mjs']){
 test(`production packaging of ${route} includes Vercel's runtime-trace missing source and dedicated entrypoints`,()=>{
  const f=cfg.functions[route];
  assert.ok(f);
  assert.equal(f.maxDuration,30);
  const items=f.includeFiles.match(/^\{(.+)\}$/)?.[1].split(',');
  assert.ok(items);
  assert.ok(items.includes('src/provider-receipt-redaction.mjs'));
  for(const path of items){
   assert.match(path,/^src\/[a-z0-9-]+\.mjs$/);
   assert.ok(statSync(new URL('../'+path,import.meta.url)).isFile());
  }
 });
}
test('webhook remains signature verified and provider effect remains absent on failed inputs',()=>{
 const w=readFileSync(new URL('../api/webhooks/winnr.mjs',import.meta.url),'utf8');
 assert.match(w,/verifyWinnrWebhookSignature/);
 assert.match(w,/bodyParser:false/);
 assert.doesNotMatch(w,/sendOwnerSeedViaHttps|sendEmail\(/);
});
