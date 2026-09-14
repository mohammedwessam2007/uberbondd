import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s=readFileSync(new URL('../scripts/ubercel-economic-deploy.mjs',import.meta.url),'utf8');
test('economic deploy requires Ubercel, founder bootstrap, heartbeat and doctor',()=>{
  assert.match(s,/runUbercelOperator/);
  assert.match(s,/bootstrap-economic-founder-node\.sh/);
  assert.match(s,/uberbond-founder-outcome-mission\.timer/);
  assert.match(s,/bootstrap-doctor\.json/);
  assert.match(s,/UBERCEL_ECONOMIC_DEPLOYMENT_OBSERVED/);
});
