import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProspectQualification } from '../src/prospect-qualification-gate.mjs';

function score(overrides = {}) {
  return { eligible: true, total: 92, blocks: [], ...overrides };
}

function bundle({ routes = [], people = [], conflicts = [] } = {}) {
  return { routes, people, summary: { conflicts } };
}

test('verified route can satisfy qualification without granting send authority', () => {
  const result = evaluateProspectQualification({
    score: score(),
    evidenceBundle: bundle({ routes: [{ route: 'buyer@example.com', status: 'VERIFIED_ROUTE', usableForHandoff: true }] })
  });
  assert.equal(result.eligible, true);
  assert.equal(result.tier, 'COMMERCIAL_HANDOFF_READY');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffects, 0);
  assert.equal(result.providerCalls, 0);
});

test('known invalid route hard-blocks even when the numeric lead score is excellent', () => {
  const result = evaluateProspectQualification({
    score: score({ total: 99 }),
    evidenceBundle: bundle({ routes: [{ route: 'buyer@example.com', status: 'BLOCKED_INVALID', usableForHandoff: false }] })
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blocks.includes('contact-route-blocked'));
});

test('suppression hard-blocks qualification even if upstream scoring says eligible', () => {
  const result = evaluateProspectQualification({
    score: score(),
    evidenceBundle: bundle({ routes: [{ route: 'buyer@example.com', status: 'BLOCKED_SUPPRESSED', usableForHandoff: false }] })
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blocks.includes('contact-route-blocked'));
});

test('stale verification requires reverification before commercial handoff', () => {
  const result = evaluateProspectQualification({
    score: score(),
    evidenceBundle: bundle({ routes: [{ route: 'buyer@example.com', status: 'REVERIFY_REQUIRED', usableForHandoff: false }] })
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blocks.includes('contact-route-not-verified'));
});

test('catch-all risky unknown and temporary failures remain non-commercial', () => {
  for (const status of ['NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'DEFER_TEMPORARY_FAILURE']) {
    const result = evaluateProspectQualification({
      score: score(),
      evidenceBundle: bundle({ routes: [{ route: 'buyer@example.com', status, usableForHandoff: false }] })
    });
    assert.equal(result.eligible, false, status);
    assert.ok(result.blocks.includes('contact-route-not-verified'), status);
  }
});

test('missing verification evidence cannot satisfy requireContact', () => {
  const result = evaluateProspectQualification({ score: score(), evidenceBundle: bundle() });
  assert.equal(result.eligible, false);
  assert.ok(result.blocks.includes('no-verified-contact-route'));
});

test('upstream qualification blocks are preserved', () => {
  const result = evaluateProspectQualification({
    score: score({ eligible: false, blocks: ['suppressed'] }),
    evidenceBundle: bundle({ routes: [{ route: 'buyer@example.com', status: 'VERIFIED_ROUTE', usableForHandoff: true }] })
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blocks.includes('suppressed'));
});

test('unresolved enrichment conflicts block commercial handoff', () => {
  const result = evaluateProspectQualification({
    score: score(),
    evidenceBundle: bundle({
      routes: [{ route: 'buyer@example.com', status: 'VERIFIED_ROUTE', usableForHandoff: true }],
      conflicts: ['job_title']
    })
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blocks.includes('prospect-evidence-conflict'));
});

test('exact-person-required mode rejects inferred-only identity', () => {
  const result = evaluateProspectQualification({
    score: score(),
    requireExactPerson: true,
    evidenceBundle: bundle({
      routes: [{ route: 'buyer@example.com', status: 'VERIFIED_ROUTE', usableForHandoff: true }],
      people: [{ personId: 'p1', exactIdentity: false, inferred: true, evidenceClass: 'MODEL_INFERENCE' }]
    })
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blocks.includes('exact-person-identity-required'));
});

test('research-only tier remains explicit rather than laundering a block into eligibility', () => {
  const result = evaluateProspectQualification({
    score: score(),
    allowResearchOnly: true,
    evidenceBundle: bundle({ routes: [{ route: 'buyer@example.com', status: 'NEEDS_REVIEW', usableForHandoff: false }] })
  });
  assert.equal(result.eligible, false);
  assert.equal(result.tier, 'RESEARCH_ONLY');
  assert.equal(result.businessEffectAuthority, 'NONE');
});
