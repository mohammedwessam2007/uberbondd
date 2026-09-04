import assert from 'node:assert/strict';
import test from 'node:test';
import { proveFreshFrontierReplacement } from '../src/frontier-replacement-tournament-proof.mjs';

const NOW = new Date('2026-09-03T09:00:00Z');
const blocked = { ok:false, status:'ROUTING_BLOCKED', routingAuthority:'NONE', selectedKey:'p:a@sha256:old' };
const trigger = { reason:'provider-price-drift', observedAt:'2026-09-03T08:40:00Z', evidenceRef:'price:a:v2' };
const tournament = { ok:true, status:'TOURNAMENT_EVIDENCED', workerRoutingAuthority:'ELIGIBLE_FOR_INTEGRATION_REVIEW_ONLY', winner:{key:'p:b@sha256:new'}, evidenceFreshness:{evaluatedAt:'2026-09-03T08:50:00Z'} };
const run = overrides => proveFreshFrontierReplacement({ priorRoutingDecision:blocked, reTournamentTrigger:trigger, replacementTournament:tournament, ...overrides }, {now:NOW});

test('admits only fresh post-trigger replacement for compilation review', () => {
  const out=run(); assert.equal(out.ok,true); assert.equal(out.status,'FRESH_REPLACEMENT_EVIDENCED');
  assert.equal(out.routingAuthority,'ELIGIBLE_FOR_PROVIDER_NEUTRAL_WORKER_COMPILATION_REVIEW'); assert.equal(out.businessEffectAuthority,'NONE');
});

test('blocks replacement when prior route was not revoked', () => {
  const out=run({priorRoutingDecision:{...blocked,ok:true,status:'ROUTING_REVALIDATED',routingAuthority:'ELIGIBLE_FOR_PROVIDER_NEUTRAL_WORKER_COMPILATION_REVIEW'}});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/blocked-prior-routing-required/);
});

test('blocks replacement without evidenced trigger', () => {
  const out=run({reTournamentTrigger:{reason:'drift'}}); assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/evidenced-retournament-trigger-required/);
});

test('blocks tournament that predates drift trigger', () => {
  const out=run({replacementTournament:{...tournament,evidenceFreshness:{evaluatedAt:'2026-09-03T08:30:00Z'}}});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/replacement-must-postdate-trigger/);
});

test('blocks stale replacement tournament', () => {
  const out=run({maxReplacementAgeMinutes:5}); assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/stale-replacement-tournament-rejected/);
});

test('blocks silent retention of drifted winner', () => {
  const out=run({replacementTournament:{...tournament,winner:{key:'p:a@sha256:old'}}});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/drifted-winner-cannot-silently-retain-authority/);
});
