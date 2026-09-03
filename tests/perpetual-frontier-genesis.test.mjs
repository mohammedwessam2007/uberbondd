import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildFrontierLatencyReceipt,
  buildFrontierShockwave,
  buildGenesisCycle,
  buildResurrectionQueue,
  buildUnknownUnknownAgenda,
  validateGenesisIdeaRegistry
} from '../src/perpetual-frontier-genesis.mjs';

const docUrl = new URL('../docs/PERPETUAL_FRONTIER_GENESIS_CANON.md', import.meta.url);

test('GENESIS registry preserves exactly 275 sequential unique ideas', async () => {
  const markdown = await readFile(docUrl, 'utf8');
  const result = validateGenesisIdeaRegistry(markdown);
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(result.status, 'GENESIS_REGISTRY_HEALTHY');
  assert.equal(result.observedCount, 275);
  assert.equal(result.ideas[0].id, 1);
  assert.equal(result.ideas[0].name, 'Unknown-Unknown Engine');
  assert.equal(result.ideas.at(-1).id, 275);
  assert.equal(result.ideas.at(-1).name, 'UBERBOND ONTOGENESIS');
});

test('frontier shockwave fails closed without evidence and never grants business authority', () => {
  const invalid = buildFrontierShockwave({
    signal: { id: 'new-model', summary: 'claimed change', evidenceRefs: [] },
    changedPrimitives: ['lower inference cost']
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.businessEffectAuthority, 'NONE');
  assert.equal(invalid.externalEffectAuthority, 'NONE');

  const valid = buildFrontierShockwave({
    signal: { id: 'new-model', summary: 'claimed change', evidenceRefs: ['evidence://model-card'] },
    changedPrimitives: ['lower inference cost'],
    affectedDomains: ['fulfilment'],
    opportunityIds: ['opp-1']
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.businessEffectAuthority, 'NONE');
  assert.match(valid.claimBoundary, /NOT_TECHNOLOGY_OR_MARKET_PROOF/);
});

test('resurrection scan produces review candidates instead of silently reactivating businesses', () => {
  const result = buildResurrectionQueue({
    dormantOpportunities: [
      { id: 'browser-agent-a', blockers: ['browser-reliability', 'unit-economics'] },
      { id: 'unrelated-b', blockers: ['regulation'] }
    ],
    changedConditions: ['browser-reliability']
  });
  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].id, 'browser-agent-a');
  assert.equal(result.candidates[0].status, 'REVIEW_CANDIDATE');
  assert.match(result.claimBoundary, /DOES_NOT_MEAN_OPPORTUNITY_IS_VIABLE/);
});

test('unknown-unknown agenda preserves anomalies, contradictions, blind spots and disagreement as questions', () => {
  const result = buildUnknownUnknownAgenda({
    anomalies: ['conversion unexpectedly quadrupled'],
    contradictions: ['source A and source B disagree'],
    blindSpots: ['no visibility into downstream acceptance'],
    disagreements: ['two independent models predict opposite margin direction']
  });
  assert.equal(result.ok, true);
  assert.equal(result.agenda.length, 4);
  assert.deepEqual(result.agenda.map(item => item.kind), ['ANOMALY', 'CONTRADICTION', 'BLIND_SPOT', 'DISAGREEMENT']);
  assert.match(result.claimBoundary, /RESEARCH_QUESTIONS_NOT_FACTS/);
});

test('frontier latency rejects time travel and reports only observed stages', () => {
  const invalid = buildFrontierLatencyReceipt({
    t0: '2026-09-03T10:00:00Z',
    t1: '2026-09-03T09:00:00Z'
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.reasonCodes.includes('non-monotonic-t1'));

  const valid = buildFrontierLatencyReceipt({
    t0: '2026-09-03T10:00:00Z',
    t1: '2026-09-03T10:05:00Z',
    t2: '2026-09-03T10:20:00Z'
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.metrics.awarenessLagMs, 5 * 60 * 1000);
  assert.equal(valid.metrics.understandingLagMs, 15 * 60 * 1000);
  assert.equal(valid.metrics.totalDiscoveryToCaptureMs, null);
});

test('GENESIS cycle remains an internal proposal even when all planning lanes are populated', () => {
  const result = buildGenesisCycle({
    signal: { id: 'signal-x', summary: 'public capability change', evidenceRefs: ['evidence://x'] },
    changedPrimitives: ['reliable-long-horizon-tool-use'],
    affectedDomains: ['browser-fulfilment'],
    opportunityIds: ['opp-dormant'],
    dormantOpportunities: [{ id: 'opp-dormant', blockers: ['reliable-long-horizon-tool-use'] }],
    changedConditions: ['reliable-long-horizon-tool-use'],
    anomalies: ['old benchmark ceiling broken'],
    contradictions: [],
    blindSpots: ['real buyer willingness unknown'],
    disagreements: ['economic upside disputed'],
    timestamps: {
      t0: '2026-09-03T10:00:00Z',
      t1: '2026-09-03T10:02:00Z'
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'GENESIS_CYCLE_PLAN_READY');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.match(result.executionRule, /INTERNAL_RESEARCH_AND_PROPOSAL_ONLY/);
});
