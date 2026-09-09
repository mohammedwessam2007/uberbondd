import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const auditScript = fs.readFileSync(new URL('../scripts/composed-effect-authority-audit.mjs', import.meta.url), 'utf8');
const recoverySource = fs.readFileSync(new URL('../src/omnia-v9/integrations/external-effect-recovery.mjs', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../src/frontier-worker-compiler.mjs', import.meta.url), 'utf8');

const requiredRecoveryMarkers = [
  'calls adapter.dispatch() -- the only network-mutating call this module',
  'WITHOUT ever calling adapter.dispatch() again'
];

test('composed-effect recovery markers bind to exact current source text', () => {
  for (const marker of requiredRecoveryMarkers) {
    assert.ok(recoverySource.includes(marker), `recovery source must contain marker: ${marker}`);
    assert.ok(auditScript.includes(marker), `audit declaration must bind marker: ${marker}`);
  }
  assert.doesNotMatch(auditScript, /Never\\n \* calls adapter\.dispatch\(\)/);
});

test('recovery safety text still states uncertainty never redispatches', () => {
  assert.match(recoverySource, /Never redispatch\./);
  assert.match(recoverySource, /RESULT_UNCERTAIN/);
  assert.match(recoverySource, /adapter\.reconcile\(\)/);
});

test('planner audit treats forbidden money movement as a safety rail, not authority', () => {
  assert.match(workerSource, /forbiddenEffects = list\(input\.forbiddenEffects \|\| \['MESSAGE', 'DEPLOYMENT', 'MONEY_MOVEMENT', 'PRODUCTION_MUTATION'\]/);
  assert.match(auditScript, /forbiddenEffects = list\(input\.forbiddenEffects \|\| \['MESSAGE', 'DEPLOYMENT', 'MONEY_MOVEMENT', 'PRODUCTION_MUTATION'\]/);
  assert.doesNotMatch(auditScript, /mustNotContain:\['MESSAGE_SEND','PRODUCTION_DEPLOY','MONEY_MOVEMENT'\]/);
  assert.match(auditScript, /mustNotContain:\['MESSAGE_SEND','PRODUCTION_DEPLOY'\]/);
});
