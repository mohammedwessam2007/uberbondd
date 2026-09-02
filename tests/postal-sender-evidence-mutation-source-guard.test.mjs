import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const consumer=fs.readFileSync(new URL('../src/omnia-v9/integrations/providers/postal-sender-evidence-consumer.mjs',import.meta.url),'utf8');
const route=fs.readFileSync(new URL('../api/webhooks/postal.mjs',import.meta.url),'utf8');

test('mutation guard: Postal DNS evidence remains one-way pause-only',()=>{
  assert.match(consumer,/eligibleForSenderEvidence !== true/);
  assert.match(consumer,/eligibleForReconciliation === true/);
  assert.match(consumer,/event\.lifecycle !== 'DNS_ERROR'/);
  assert.match(consumer,/setSenderPaused\(inbox, true, 'postal-domain-dns-error'\)/);
  assert.doesNotMatch(consumer,/setSenderPaused\([^\n]+false/);
});

test('mutation guard: route consumes only fresh persisted sender evidence',()=>{
  assert.match(route,/event\.eligibleForSenderEvidence === true && persisted\.duplicate !== true/);
  assert.match(route,/postal-sender-evidence-not-applied/);
  assert.match(route,/businessEffectAuthority: 'NONE'/);
  assert.doesNotMatch(route,/senderEvidenceAvailable[^\n]+businessEffectAuthority:\s*'ALLOW'/);
});
