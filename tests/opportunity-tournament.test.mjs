import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  rankCanonicalOpportunities,
  logOpportunityTournament,
  OPPORTUNITY_TOURNAMENT_POLICY_VERSION,
  TOURNAMENT_SHARED_CAPABILITIES
} from '../src/opportunity-tournament.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const referenceDate = new Date('2026-08-20T09:00:00.000Z');

test('the canonical 439-record registry is fully scored and returned as a bounded deterministic tournament', () => {
  const first = rankCanonicalOpportunities({ date: referenceDate, limit: 10 });
  const second = rankCanonicalOpportunities({ date: referenceDate, limit: 10 });

  assert.equal(first.ok, true);
  assert.equal(first.status, 'TOURNAMENT_COMPLETE');
  assert.equal(first.policyVersion, OPPORTUNITY_TOURNAMENT_POLICY_VERSION);
  assert.equal(first.registryCount, 439);
  assert.equal(first.scoredCount, 439);
  assert.equal(first.returnedCount, 10);
  assert.equal(first.top.length, 10);
  assert.equal(first.validatedRegistry.uniqueIdCount, 439);
  assert.deepEqual(first, second);
  assert.equal(first.externalEffectLedger.providerCalls, 0);
  assert.equal(first.externalEffectLedger.spendCents, 0);
});

test('tournament ordering is score-descending, confidence-descending, and id-stable', () => {
  const result = rankCanonicalOpportunities({ date: referenceDate, limit: 439 });
  for (let index = 1; index < result.top.length; index += 1) {
    const previous = result.top[index - 1];
    const current = result.top[index];
    const previousKey = [previous.compositeScore, previous.confidence, previous.opportunityId];
    const currentKey = [current.compositeScore, current.confidence, current.opportunityId];
    const ordered = previous.compositeScore > current.compositeScore
      || (previous.compositeScore === current.compositeScore && previous.confidence > current.confidence)
      || (previous.compositeScore === current.compositeScore
        && previous.confidence === current.confidence
        && previous.opportunityId.localeCompare(current.opportunityId) <= 0);
    assert.equal(ordered, true, `${JSON.stringify({ previousKey, currentKey })}`);
  }
  assert.equal(result.dataSufficiencyCounts.INSUFFICIENT > 0, true);
  assert.equal(result.evidenceClassCounts.BUYER_SIGNAL, 3);
  assert.equal(result.evidenceClassCounts.HYPOTHESIS, 436);
});

test('build distance is explicit and responds to a missing capability without changing the registry', () => {
  const result = rankCanonicalOpportunities({
    date: referenceDate,
    limit: 3,
    requiredCapabilities: [...TOURNAMENT_SHARED_CAPABILITIES, 'future-capability'],
    existingCapabilities: TOURNAMENT_SHARED_CAPABILITIES
  });
  assert.equal(result.ok, true);
  assert.equal(result.buildDistance.distance, 0.13);
  assert.deepEqual(result.buildDistance.missing, ['future-capability']);
  assert.equal(result.registryCount, 439);
  assert.equal(result.externalEffectLedger.messages, 0);
});

test('logging uses the existing auditLog writer and records only a compact receipt', async () => {
  const calls = [];
  const store = { log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-tournament-1' }; } };
  const result = rankCanonicalOpportunities({ date: referenceDate, limit: 3 });
  const receipt = await logOpportunityTournament(store, result);
  assert.deepEqual(receipt, { id: 'audit-tournament-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'commercial_opportunity_tournament');
  assert.equal(calls[0].detail.registryCount, 439);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'entries'), false);
  assert.equal(calls[0].detail.externalEffectLedger.providerCalls, 0);
});

test('the job handler runs the tournament and writes one durable receipt without external effects', async () => {
  const calls = [];
  const handlers = createJobHandlers({
    cfg: {},
    pipeline: {},
    revenue: {},
    discoveryRunner: {},
    store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-handler-1' }; } }
  });
  const result = await handlers['prometheus.commercial.tournament']({ date: referenceDate, limit: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.returnedCount, 5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'commercial_opportunity_tournament');
  assert.equal(result.externalEffectLedger.deployments, 0);
});

test('the tournament module is local-only by source inspection', async () => {
  const source = await fs.readFile(new URL('../src/opportunity-tournament.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
