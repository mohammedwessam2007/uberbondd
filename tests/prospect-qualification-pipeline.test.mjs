// Two qualification modules landed independently, each right about a different
// half: one produces the score, one gates a score it is handed. Side by side
// they are two sources of truth for one decision. Composed they are one, and
// the property that makes the composition safe is that the gate can only ever
// narrow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyProspect } from '../src/prospect-qualification-pipeline.mjs';
import { buildProspectEvidenceBundle } from '../src/prospect-evidence-reconciliation.mjs';

const NOW = new Date('2026-08-23T12:00:00Z');

function bundle({ suppressions = [], state = 'VALID' } = {}) {
  return buildProspectEvidenceBundle({
    prospectId: 'prospect_pipeline',
    contactRoutes: [{
      route: 'buyer@example.com',
      verifications: [{ route: 'buyer@example.com', state, checkedAt: '2026-08-22T00:00:00Z', provider: 'fixture' }]
    }],
    suppressions,
    now: NOW
  });
}

function strong(overrides = {}) {
  return {
    icpFit: { value: 0.9, evidenceClass: 'DIRECT_PUBLIC' },
    buyerRoleFit: { value: 0.85, evidenceClass: 'LICENSED_PROVIDER' },
    painEvidence: { value: 0.7, evidenceClass: 'DIRECT_PUBLIC' },
    signalStrength: { value: 0.6, evidenceClass: 'DIRECT_PUBLIC' },
    offerFit: { value: 0.8, evidenceClass: 'DIRECT_FIRST_PARTY' },
    timing: { value: 0.5, evidenceClass: 'DIRECT_PUBLIC' },
    buyerAuthority: { value: 0.7, evidenceClass: 'LICENSED_PROVIDER' },
    companyEconomics: { value: 0.6, evidenceClass: 'DIRECT_PUBLIC' },
    ...overrides
  };
}

test('a strong, verified, unsuppressed prospect is eligible through the whole pipeline', () => {
  const result = qualifyProspect({ bundle: bundle(), observations: strong(), date: NOW });
  assert.equal(result.eligible, true);
  assert.equal(result.disposition, 'ELIGIBLE_FOR_EXPERIMENT');
  assert.equal(result.tier, 'COMMERCIAL_HANDOFF_READY');
  assert.deepEqual(result.blocks, []);
  assert.equal(result.outboundAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('the gate cannot widen: no option turns a rejected prospect eligible', () => {
  // Rejected by the scorer on fit, with a perfectly good contact route so the
  // gate itself has nothing to object to.
  const weak = strong({
    icpFit: { value: 0.02, evidenceClass: 'DIRECT_PUBLIC' },
    buyerRoleFit: { value: 0.02, evidenceClass: 'LICENSED_PROVIDER' },
    painEvidence: { value: 0, evidenceClass: 'DIRECT_PUBLIC' },
    signalStrength: { value: 0, evidenceClass: 'DIRECT_PUBLIC' },
    offerFit: { value: 0, evidenceClass: 'DIRECT_FIRST_PARTY' },
    timing: { value: 0, evidenceClass: 'DIRECT_PUBLIC' },
    buyerAuthority: { value: 0, evidenceClass: 'LICENSED_PROVIDER' },
    companyEconomics: { value: 0, evidenceClass: 'DIRECT_PUBLIC' }
  });
  for (const options of [
    {},
    { requireContact: false },
    { allowResearchOnly: true },
    { requireContact: false, allowResearchOnly: true, requireExactPerson: false }
  ]) {
    const result = qualifyProspect({ bundle: bundle(), observations: weak, date: NOW, ...options });
    assert.equal(result.eligible, false, `options ${JSON.stringify(options)} widened the decision`);
    assert.notEqual(result.disposition, 'ELIGIBLE_FOR_EXPERIMENT');
    assert.ok(result.blocks.length > 0);
  }
});

test('the gate narrows: a route the scorer was happy with can still block', () => {
  // The scorer sees a verified route and is satisfied; the gate is given a
  // bundle whose only route is blocked, and blocks.
  const suppressed = qualifyProspect({
    bundle: bundle({ suppressions: [{ value: 'buyer@example.com' }] }),
    observations: strong(),
    date: NOW
  });
  assert.equal(suppressed.eligible, false);
  assert.equal(suppressed.contact.blockedRoutes, 1);
  assert.equal(suppressed.contact.verifiedRoutes, 0);
});

test('an unresolved evidence conflict blocks through the pipeline', () => {
  const base = bundle();
  const conflicted = { ...base, summary: { ...base.summary, conflicts: ['work_email'] } };
  const result = qualifyProspect({ bundle: conflicted, observations: strong(), date: NOW });
  assert.equal(result.eligible, false);
  assert.ok(result.blocks.some(block => /conflict/i.test(block)));
});

test('a model reaching for authority quarantines through the pipeline too', () => {
  const result = qualifyProspect({
    bundle: bundle(),
    observations: strong(),
    assessment: { model: 'pushy', confidence: 1, dimensions: { icpFit: 1 }, outboundAuthority: 'GRANTED' },
    date: NOW
  });
  assert.equal(result.eligible, false);
  assert.equal(result.disposition, 'QUARANTINE');
  assert.equal(result.outboundAuthority, 'NONE');
});

test('the pipeline reports no effects and no provider calls of its own', () => {
  const result = qualifyProspect({ bundle: bundle(), observations: strong(), date: NOW });
  for (const value of Object.values(result.externalEffectLedger)) assert.equal(value, 0);
});

test('the same evidence yields the same decision id regardless of when it is asked', () => {
  const a = qualifyProspect({ bundle: bundle(), observations: strong(), date: NOW });
  const b = qualifyProspect({ bundle: bundle(), observations: strong(), date: new Date('2026-09-01T00:00:00Z') });
  assert.equal(a.decisionId, b.decisionId);
});
