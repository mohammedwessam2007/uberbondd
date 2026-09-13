import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('24x7 smoke state machine accepts healthy runtime and rejects dead or stale runtime states',()=>{
  const raw=execFileSync(process.execPath,['scripts/uberlit-24x7-smoke.mjs','--simulate'],{encoding:'utf8'}).trim();
  const result=JSON.parse(raw);
  assert.equal(result.ok,true);
  assert.equal(result.status,'UBERLIT_24X7_STATE_MACHINE_SMOKE_PASSED');
  const byName=Object.fromEntries(result.cases.map(x=>[x.name,x]));
  assert.equal(byName.healthy.ok,true);
  assert.equal(byName['dead-child'].ok,false);
  assert.equal(byName['stale-heartbeat'].ok,false);
  assert.equal(byName['stale-wealth'].ok,false);
  assert.equal(result.externalEffectAuthority,'NONE');
});
