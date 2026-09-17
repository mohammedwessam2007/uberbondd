import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNativeCapacityPlan,
  buildNativeTargetProfileRecord,
  canonicalLeadIdentity,
  compileNativeEnrichmentPlan,
  compileNativeLeadList,
  compileNativeLocalEnrichment,
  deduplicateLeadCorpus,
  nativeLeadListCsv,
  UBERBOND_NATIVE_LEAD_OPS_POLICY
} from '../src/uberbond-native-lead-ops.mjs';

const now = new Date('2026-09-17T12:00:00.000Z');

function prospect(overrides = {}) {
  return {
    id: 'pros-1',
    company: 'Northstar HVAC',
    website: 'https://northstar.example',
    domain: 'northstar.example',
    niche: 'HVAC agency',
    country: 'United Kingdom',
    city: 'London',
    source: 'owner_import',
    sourceUrl: 'https://northstar.example',
    updatedAt: '2026-09-16T12:00:00.000Z',
    contact: { email: 'owner@northstar.example', title: 'Founder', verified: 'valid', source: 'owner_import', exact: true },
    issue: { title: 'Booking handoff breaks on mobile', evidenceUrl: 'https://northstar.example/book', evidenceExcerpt: 'The booking button returns to the home page on mobile.', evidenceObservedAt: '2026-09-16T12:00:00.000Z' },
    status: 'ready',
    ...overrides
  };
}

test('canonical identity is domain-first and exact-email-only for people', () => {
  assert.deepEqual(canonicalLeadIdentity(prospect()), {
    accountKey: 'domain:northstar.example',
    contactKey: 'email:owner@northstar.example',
    domain: 'northstar.example',
    email: 'owner@northstar.example',
    identityQuality: 'canonical-domain'
  });
  assert.equal(canonicalLeadIdentity({ company: 'No Website Ltd' }).contactKey, null);
});

test('dedupe keeps the strongest canonical account and excludes suppression before selection', () => {
  const result = deduplicateLeadCorpus({
    prospects: [
      prospect(),
      prospect({ id: 'pros-2', source: 'csv_import', contact: { email: 'sales@northstar.example', verified: 'unknown' } }),
      prospect({ id: 'pros-3', company: 'Suppressed HVAC', domain: 'suppressed.example', website: 'https://suppressed.example', contact: { email: 'hello@suppressed.example' } })
    ],
    suppressions: [{ value: 'suppressed.example' }],
    now
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, 'pros-1');
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.excluded[0].reason, 'suppressed-domain');
  assert.equal(result.providerCalls, 0);
  assert.equal(result.externalEffects, 0);
});

test('native list compilation creates a governed local handoff without authorization', () => {
  const list = compileNativeLeadList({
    name: 'London HVAC founding lane',
    profile: { name: 'London HVAC', query: { industries: ['HVAC'], countries: ['United Kingdom'], minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false } },
    prospects: [prospect()],
    campaignId: 'camp-a',
    limit: 10,
    idempotencyKey: 'list-request-1',
    now
  });
  assert.equal(list.status, 'prepared');
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0].handoffState, 'OWNER_PLAN_READY_NOT_AUTHORIZED');
  assert.equal(list.handoff.enrollment, 'NOT_PERFORMED');
  assert.equal(list.handoff.send, 'NOT_AUTHORIZED');
  assert.equal(list.providerCalls, 0);
  assert.equal(list.externalEffects, 0);
  assert.match(UBERBOND_NATIVE_LEAD_OPS_POLICY.listRule, /not contact authority/);
});

test('target profiles and local enrichment are stable and provider-free', () => {
  const profile = buildNativeTargetProfileRecord({ name: 'HVAC founding lane', profile: { query: { industries: ['HVAC'] } }, now });
  const planA = compileNativeEnrichmentPlan({ prospect: prospect(), fields: ['company_profile', 'work_email'], now });
  const planB = compileNativeEnrichmentPlan({ prospect: prospect(), fields: ['company_profile', 'work_email'], now: new Date('2026-09-18T12:00:00.000Z') });
  const local = compileNativeLocalEnrichment({ prospect: prospect(), fields: ['company_profile', 'website_evidence', 'work_email'], now });
  assert.equal(profile.kind, 'target-profile');
  assert.equal(planA.planId, planB.planId);
  assert.equal(planA.providerCalls, 0);
  assert.equal(local.status, 'completed');
  assert.equal(local.provider, 'local-evidence');
  assert.ok(local.fieldResults.length >= 3);
  assert.equal(local.externalEffects, 0);
});

test('capacity plan is explicit planning only and exposes the real daily arithmetic', () => {
  const plan = buildNativeCapacityPlan({ monthlyMessages: 100000, activeDaysPerMonth: 30, now });
  assert.equal(plan.state, 'CAPACITY_PLAN_ONLY');
  assert.equal(plan.requiredDailyMessages, 3334);
  assert.equal(plan.providerCalls, 0);
  assert.equal(plan.externalEffects, 0);
  assert.ok(plan.blockers.includes('no-sender-cells-supplied'));
  assert.match(plan.truthBoundary, /not provider approval/);
});

test('lead-list CSV is exportable without leaking unsupported fields', () => {
  const list = compileNativeLeadList({
    profile: { query: { minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false } },
    prospects: [prospect({ company: 'Northstar, HVAC' })],
    limit: 1,
    idempotencyKey: 'csv-1',
    now
  });
  const csv = nativeLeadListCsv(list);
  assert.match(csv, /^prospect_id,account_key,company,/);
  assert.match(csv, /"Northstar, HVAC"/);
  assert.doesNotMatch(csv, /token|password|secret/i);
});

