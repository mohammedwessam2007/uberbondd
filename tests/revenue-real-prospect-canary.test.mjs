import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileRelaiCanaryProspect,
  runRevenueRealProspectCanary,
  REVENUE_REAL_PROSPECT_CANARY_RECORD,
  REVENUE_REAL_PROSPECT_CANARY_SOURCE
} from '../src/revenue-real-prospect-canary.mjs';

const PAGE = `
<html><body>
<h1>Help us build the learning engine for AI agents.</h1>
<p>One of the hardest problems in AI today — reliability in production.</p>
<h2>AI Research Engineer</h2>
<p>creation, simulation, evaluation, and optimization of AI agents</p>
<p>careers@relai.ai</p>
</body></html>`;

test('RELAI canary requires current first-party evidence and imports contact as unverified', () => {
  const result = compileRelaiCanaryProspect(PAGE, { observedAt: '2026-10-04T10:15:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.prospect.source, 'public_website');
  assert.equal(result.prospect.contact.source, 'public_website');
  assert.equal(result.prospect.contact.verified, 'unverified');
  assert.equal(result.prospect.issue.safeForOutreach, false);
  assert.equal(result.demandSignal.kind, 'explicit_demand_hiring');
  assert.equal(result.outboundAuthority, 'NONE');
});

test('RELAI canary refuses if first-party evidence no longer supports the route or need', () => {
  const result = compileRelaiCanaryProspect('<p>generic careers page</p>');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REAL_PROSPECT_CANARY_SOURCE_REFUSED');
  assert.ok(result.reasonCodes.includes('production-reliability-evidence-missing'));
  assert.ok(result.reasonCodes.includes('public-careers-route-evidence-missing'));
});

test('production canary uses canonical importer/signal path and returns only sanitized queue evidence', async () => {
  const rows = [];
  const logs = [];
  const store = {
    async list(key) { assert.equal(key, 'prospects'); return rows; },
    async log(type, detail) { logs.push({ type, detail }); }
  };
  const config = { maxBatch: 10 };
  const importFn = async (_store, _config, items) => {
    assert.equal(items.length, 1);
    assert.equal(items[0].contact.verified, 'unverified');
    const prospect = { id: 'pros-real-1', domain: 'relai.ai', sourceRecordId: REVENUE_REAL_PROSPECT_CANARY_RECORD };
    rows.push(prospect);
    return { added: [prospect], skipped: [] };
  };
  const signalFn = async (_store, input) => {
    assert.equal(input.prospectId, 'pros-real-1');
    assert.equal(input.kind, 'explicit_demand_hiring');
    assert.equal(input.evidenceRef, REVENUE_REAL_PROSPECT_CANARY_SOURCE);
    return { ok: true, signal: input };
  };
  const snapshotFn = async () => ({ marker: 'live-snapshot' });
  const moneyQueueFn = () => ({
    items: [],
    excluded: [{ prospectId: 'pros-real-1', reasons: ['NOT_QUALIFIED', 'no-verified-contact-route'] }]
  });
  const messages = [];
  const result = await runRevenueRealProspectCanary({
    store, config,
    fetchFn: async () => ({ ok: true, status: 200, async text() { return PAGE; } }),
    importFn, signalFn, snapshotFn, moneyQueueFn,
    now: () => Date.parse('2026-10-04T10:15:00.000Z'),
    logger: { log(value) { messages.push(value); } }
  });
  assert.equal(result.ok, true);
  assert.equal(result.queueState, 'EXCLUDED');
  assert.deepEqual(result.exclusionReasons, ['NOT_QUALIFIED', 'no-verified-contact-route']);
  assert.equal(result.outboundAuthority, 'NONE');
  const serialized = JSON.stringify({ result, logs, messages });
  assert.equal(serialized.includes('careers@relai.ai'), false);
  assert.equal(serialized.includes('reliability in production'), false);
});

test('canary refuses to mutate an existing RELAI prospect owned by another lineage', async () => {
  const result = await runRevenueRealProspectCanary({
    store: {
      async list() { return [{ id: 'pros-existing', domain: 'relai.ai', sourceRecordId: 'other-lineage' }]; }
    },
    config: { maxBatch: 10 },
    fetchFn: async () => ({ ok: true, status: 200, async text() { return PAGE; } }),
    now: () => Date.parse('2026-10-04T10:15:00.000Z')
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REAL_PROSPECT_CANARY_COLLISION');
  assert.equal(result.existingProspectId, 'pros-existing');
});
