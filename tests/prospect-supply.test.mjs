import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProspectCandidate, replenishProspectQueue, nextSupplyMilestone } from '../src/prospect-supply.mjs';
import { JsonStore } from '../src/store.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canon-prospect-supply-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

const now = new Date('2026-08-01T12:00:00.000Z');

function candidate(overrides = {}) {
  return {
    domain: 'acme.com', organization: 'Acme', triggerSignal: 'Official hiring signal',
    evidenceUrl: 'https://acme.com/careers', evidenceDate: '2026-07-30T00:00:00.000Z',
    contact: { email: 'partnerships@acme.com', publishedOfficially: true },
    contactProvenance: 'Official partnerships address published by company',
    serviceLane: 'ai-workflow', ...overrides
  };
}

test('P1-001 acceptance: an official partner-form route can be research-validated but is never email-sendable', () => {
  const { ok, reasons, prospect } = validateProspectCandidate(candidate({
    contact: { type: 'form', sourceUrl: 'https://acme.com/partners', publishedOfficially: true }
  }), { now });
  assert.equal(ok, true, JSON.stringify(reasons));
  assert.equal(prospect.contactRoute.type, 'form');
  assert.deepEqual(prospect.contact, {});
});

test('a reserved (.example) domain is rejected outside simulation', () => {
  const { ok, reasons } = validateProspectCandidate(candidate({ domain: 'company-01.example' }), { now, simulation: false });
  assert.equal(ok, false);
  assert.ok(reasons.includes('reserved-domain-outside-simulation'));
});

test('a reserved (.example) domain is accepted in simulation', () => {
  const { ok, reasons } = validateProspectCandidate(candidate({
    domain: 'company-01.example', evidenceUrl: 'https://company-01.example/careers',
    contact: { email: 'partnerships@company-01.example', publishedOfficially: true }
  }), { now, simulation: true });
  assert.equal(ok, true, JSON.stringify(reasons));
});

test('stale evidence is rejected', () => {
  const { ok, reasons } = validateProspectCandidate(candidate({ evidenceDate: '2026-01-01T00:00:00.000Z' }), { now });
  assert.equal(ok, false);
  assert.ok(reasons.includes('stale-or-missing-evidence-date'));
});

test('a generic mailbox without a provider route is rejected', () => {
  const { ok, reasons } = validateProspectCandidate(candidate({
    contact: { email: 'info@acme.com', source: 'website', verified: 'valid' }, contactProvenance: 'Listed on contact page'
  }), { now });
  assert.equal(ok, false);
  assert.ok(reasons.includes('generic-mailbox-without-provider-route'));
});

test('replenishProspectQueue uses the durable prospects.domain unique constraint as the authoritative dedup guard', async () => {
  const store = await makeStore();
  const result = await replenishProspectQueue(store, {
    candidates: [candidate(), candidate({ organization: 'Acme Again' })], targetBacklog: 1000, now
  });
  assert.equal(result.additions.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.ok(['duplicate-domain-in-batch', 'duplicate-recipient-in-batch'].includes(result.rejected[0].reasons[0]));
  const stored = await store.list('prospects');
  assert.equal(stored.length, 1);
});

test('replenishProspectQueue stops once targetBacklog is reached', async () => {
  const store = await makeStore();
  const candidates = ['a.com', 'b.com', 'c.com'].map(domain => candidate({ domain, contact: { email: `partnerships@${domain}`, publishedOfficially: true }, evidenceUrl: `https://${domain}/careers` }));
  const result = await replenishProspectQueue(store, { candidates, targetBacklog: 2, now });
  assert.equal(result.additions.length, 2);
});

test('nextSupplyMilestone reports the next unmet milestone', () => {
  assert.equal(nextSupplyMilestone(0), 100);
  assert.equal(nextSupplyMilestone(150), 1000);
  assert.equal(nextSupplyMilestone(30000), null);
});
