import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, parseCanonicalBoolean } from '../src/config.mjs';
import * as gmailInbound from '../src/gmail-inbound.mjs';
import { createGmailInboundReader, INBOUND_SCOPES, GmailInboundError, boundMessageLimit } from '../src/gmail-inbound.mjs';
import * as autonomyCycle from '../src/autonomy-cycle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const gmailInboundSource = await fs.readFile(path.join(here, '../src/gmail-inbound.mjs'), 'utf8');
const autonomyCycleSource = await fs.readFile(path.join(here, '../src/autonomy-cycle.mjs'), 'utf8');
const importLines = autonomyCycleSource.split('\n').filter(line => /^\s*import\b/.test(line));

test('CFG-08: only the exact canonical string "true" enables a safety gate', () => {
  assert.equal(parseCanonicalBoolean('true'), true);
  assert.equal(parseCanonicalBoolean('TRUE'), false);
  assert.equal(parseCanonicalBoolean('True'), false);
  assert.equal(parseCanonicalBoolean('1'), false);
  assert.equal(parseCanonicalBoolean('yes'), false);
  assert.equal(parseCanonicalBoolean(' true '), false);
  assert.equal(parseCanonicalBoolean('false'), false);
  assert.equal(parseCanonicalBoolean(undefined), false);
  assert.equal(parseCanonicalBoolean(''), false);
});

test('inbound config is independent of outbound and off by default', () => {
  assert.equal(config.inbound.provider, 'test');
  assert.equal(config.inbound.enabled, false);
  assert.equal(config.inbound.gmailReadEnabled, false);
  assert.equal(config.outbound.enabled, false);
  assert.equal(config.outbound.dryRun, true);
});

test('CAP-01: inbound OAuth scope is readonly only, never send', () => {
  assert.deepEqual(INBOUND_SCOPES, ['https://www.googleapis.com/auth/gmail.readonly']);
  assert.ok(!INBOUND_SCOPES.some(scope => scope.includes('gmail.send') || scope.includes('gmail.modify')));
});

test('CAP-02: inbound module exports no send-capable function', () => {
  const exportNames = Object.keys(gmailInbound);
  const forbidden = ['sendEmail', 'buildRawMessage', 'createDraft', 'reply', 'forward', 'modify', 'trash', 'labelMessage'];
  for (const name of forbidden) assert.ok(!exportNames.includes(name), `unexpected export: ${name}`);
});

test('CAP-03: no messages/send or write-endpoint literal anywhere in the inbound module source', () => {
  assert.ok(!gmailInboundSource.includes('messages/send'));
  assert.ok(!gmailInboundSource.includes('/drafts'));
  assert.ok(!gmailInboundSource.includes('/modify'));
  assert.ok(!gmailInboundSource.includes('gmail.send'));
});

test('CAP-07: inbound module never imports the mixed read/write gmail.mjs', () => {
  assert.ok(!gmailInboundSource.includes("from './gmail.mjs'"));
  assert.ok(!gmailInboundSource.includes('from "./gmail.mjs"'));
});

test('CAP-02/CAP-17: the reader object has no sendEmail key and cannot be mutated to add one', () => {
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb' });
  assert.equal('sendEmail' in reader, false);
  assert.equal(Object.isFrozen(reader), true);
  assert.throws(() => { reader.sendEmail = async () => {}; }, TypeError);
  assert.equal('sendEmail' in reader, false);
});

test('reader methods fail closed without an explicit network permission', async () => {
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb' });
  const account = { tokens: { data: '', iv: '', tag: '' } };
  await assert.rejects(() => reader.getProfile(account, 'key'), GmailInboundError);
  await assert.rejects(() => reader.listMessages(account, 'key', 'is:unread'), GmailInboundError);
  await assert.rejects(() => reader.getMessage(account, 'key', 'abc123'), GmailInboundError);
});

test('reader methods stay blocked in NODE_ENV=test even with allowNetwork explicitly true', async () => {
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true });
  const account = { tokens: { data: '', iv: '', tag: '' } };
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    await assert.rejects(() => reader.getProfile(account, 'key'), GmailInboundError);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('BND-05: message page size clamps huge, zero, negative, and non-numeric limits into a safe range', () => {
  assert.equal(boundMessageLimit(999999), 500);
  assert.equal(boundMessageLimit(Number.MAX_SAFE_INTEGER), 500);
  assert.equal(boundMessageLimit(Infinity), 50);
  assert.equal(boundMessageLimit(0), 1);
  assert.equal(boundMessageLimit(-5), 1);
  assert.equal(boundMessageLimit(NaN), 50);
  assert.equal(boundMessageLimit(undefined), 50);
  assert.equal(boundMessageLimit('20'), 20);
  assert.equal(boundMessageLimit('not-a-number'), 50);
});

test('CAP-01/F-01: autonomy-cycle.mjs imports nothing from the send-capable/general-handler graph', () => {
  const forbidden = ["'./gmail.mjs'", '"./gmail.mjs"', "'./pipeline.mjs'", '"./pipeline.mjs"', "'./revenue.mjs'", '"./revenue.mjs"', "'./job-handlers.mjs'", '"./job-handlers.mjs"'];
  for (const needle of forbidden) assert.ok(!autonomyCycleSource.includes(needle), `must not import ${needle}`);
});

test('F-03: autonomy-cycle.mjs never imports the shared job queue, so it cannot claim an unrelated queued job', () => {
  assert.ok(!autonomyCycleSource.includes("'./queue.mjs'") && !autonomyCycleSource.includes('"./queue.mjs"'));
  assert.ok(!autonomyCycleSource.includes('claimJobs'));
});

test('full import list of autonomy-cycle.mjs contains only reviewed, send-incapable modules', () => {
  const allowed = ["'./store.mjs'", "'./inbound-classify.mjs'", "'./verified-payments.mjs'", "'./crypto.mjs'", 'node:crypto'];
  for (const line of importLines) {
    assert.ok(allowed.some(ok => line.includes(ok)), `unexpected import: ${line.trim()}`);
  }
});

test('P1-10: verified-payments.mjs itself is read-only -- no provider calls, no order/offer/delivery mutation', async () => {
  const source = await fs.readFile(path.join(here, '../src/verified-payments.mjs'), 'utf8');
  const importLines2 = source.split('\n').filter(line => /^\s*import\b/.test(line));
  assert.equal(importLines2.length, 0, 'must have zero imports -- no network client, no other domain module');
  assert.ok(!source.includes('fetch('), 'must never call a payment provider over the network');
  for (const mutator of ['store.add(', 'store.upsert(', 'store.patch(', 'store.remove(', 'transitionOfferRecord', 'applyOfferPayment']) {
    assert.ok(!source.includes(mutator), `must never call ${mutator} -- this module is read-only`);
  }
  assert.ok(source.includes('store.list('), 'must actually read through the store, not just claim to');
});

test('P1-11: crypto.mjs has zero network capability and only the expected exports', async () => {
  const source = await fs.readFile(path.join(here, '../src/crypto.mjs'), 'utf8');
  const importLines2 = source.split('\n').filter(line => /^\s*import\b/.test(line));
  assert.deepEqual(importLines2.map(line => line.trim()), ["import crypto from 'node:crypto';"]);
  assert.ok(!source.includes('fetch('));
  for (const exportName of ['encryptJson', 'decryptJson', 'keyedHash']) {
    assert.ok(source.includes(`export function ${exportName}`), `must export ${exportName}`);
  }
});

test('F-02: the stage list never runs outbound or follow-up processing', () => {
  assert.deepEqual(autonomyCycle.STAGES, ['poll-inbound', 'classify-and-suppress', 'write-digest']);
  assert.ok(!autonomyCycleSource.includes('outbound.process'));
  assert.ok(!autonomyCycleSource.includes('followups.process'));
  assert.ok(!autonomyCycleSource.includes('processOutboundQueue'));
  assert.ok(!autonomyCycleSource.includes('processFollowups'));
});

test('autonomy-cycle.mjs exports no send-capable function', () => {
  const exportNames = Object.keys(autonomyCycle);
  const forbidden = ['sendEmail', 'buildRawMessage', 'processOutboundQueue', 'processFollowups', 'createJobHandlers'];
  for (const name of forbidden) assert.ok(!exportNames.includes(name), `unexpected export: ${name}`);
});

test('STORE-03: no generic remove/delete capability exists anywhere in the Store, so a protected collection cannot be removed via a generic path', async () => {
  // The scenario as written ("generic remove rejects cycle runs") presupposes a generic
  // remove()/delete() method exists that PROTECTED_COLLECTIONS must guard. It does not: this
  // codebase never implements one at all -- add/upsert/patch are the only generic mutators, and
  // every actual delete-shaped operation (deleteExpiredInboundWorkItems, the stale-dispatch/stale-
  // job recovery sweeps) is a narrow, dedicated, named method scoped to exactly one collection and
  // one retention/recovery purpose, not a caller-suppliable "remove this record" primitive. The
  // invariant the row is actually protecting -- a protected collection's rows cannot be erased by
  // any caller-directed generic path -- therefore holds by construction, proven here two ways:
  // (1) the store source has no generic remove/delete method definition; (2) every export name on
  // both the JSON-store transaction wrapper class and PostgresStore is enumerated and none is a
  // bare "remove"/"delete" (only the specific, already-reviewed deleteExpiredInboundWorkItems).
  const storeSource = await fs.readFile(path.join(here, '../src/store.mjs'), 'utf8');
  assert.ok(!/\bremove\s*\(/.test(storeSource.replace(/deleteExpiredInboundWorkItems|_deleteExpiredInboundWorkItemsDirect/g, '')), 'no remove( symbol anywhere outside the one named retention-sweep method');
  const methodNames = [...storeSource.matchAll(/^\s{2}async ([a-zA-Z_]+)\(/gm)].map(m => m[1]);
  const genericMutators = methodNames.filter(name => /^(remove|delete)$/i.test(name));
  assert.deepEqual(genericMutators, [], `found a generic remove/delete method that PROTECTED_COLLECTIONS would need to guard: ${genericMutators.join(', ')}`);
  const deleteShapedMethods = [...new Set(methodNames.filter(name => /delete/i.test(name)))].sort();
  // Both are named, single-collection, single-purpose retention sweeps (never take a caller-
  // supplied id/filter) -- not a general-purpose remove that PROTECTED_COLLECTIONS would need to
  // additionally guard.
  assert.deepEqual(deleteShapedMethods, ['deleteExpiredArtifacts', 'deleteExpiredInboundWorkItems']);
});
