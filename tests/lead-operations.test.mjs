import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAD_OPERATIONS_POLICY,
  buildBuyingGroupPlan,
  buildLeadControlTower,
  buildLeadCoverageMap,
  buildLeadFieldLedger,
  buildLookalikePlan,
  buildProviderPreflight,
  buildTargetProfileRecord,
  normalizeTargetProfile
} from '../src/lead-operations.mjs';

const now = new Date('2026-08-13T12:00:00.000Z');
const base = {
  id: 'p-1', company: 'Northstar Medical Studio', website: 'https://northstar.example', domain: 'northstar.example', niche: 'medical agency', country: 'CA', city: 'Toronto',
  technologies: ['WordPress'], source: 'licensed_export', sourceUrl: 'https://northstar.example/about', sourceLicense: 'owner-authorized export', createdAt: '2026-08-01T12:00:00.000Z', completedAt: '2026-08-10T12:00:00.000Z',
  contact: { email: 'owner@northstar.example', name: 'Alex Owner', title: 'Founder', source: 'licensed_export', sourceUrl: 'https://northstar.example/team', sourceLicense: 'owner-authorized export', observedAt: '2026-08-10T12:00:00.000Z', verified: 'valid', exact: true },
  issue: { title: 'Mobile form fails', evidenceUrl: 'https://northstar.example/services', evidenceExcerpt: 'The contact form does not submit on mobile devices.', evidenceObservedAt: '2026-08-10T12:00:00.000Z', confidence: 0.9 },
  audit: [{ code: 'FORM_SUBMIT' }], status: 'ready'
};

test('normalizes a durable target profile with bounded goals and fields', () => {
  const profile = normalizeTargetProfile({ name: 'Canadian medical QA', query: { prompt: 'medical agencies in Canada', countries: ['CA'] }, requiredPersonas: ['Founder', 'Marketing Director'], requiredFields: ['work_email', 'email_verification', 'not-a-field'], targetAccounts: 0, targetLeads: 999999 });
  assert.equal(profile.name, 'Canadian medical QA');
  assert.deepEqual(profile.requiredPersonas, ['Founder', 'Marketing Director']);
  assert.deepEqual(profile.requiredFields, ['work_email', 'email_verification']);
  assert.equal(profile.targetAccounts, 1);
  assert.equal(profile.targetLeads, 100000);
});

test('creates a saved target-profile record without external effects', () => {
  const record = buildTargetProfileRecord({ name: 'QA agencies', profile: { query: { industries: ['agency'] } }, now });
  assert.match(record.id, /^targetprofile_[a-f0-9]{20}$/);
  assert.equal(record.kind, 'target-profile');
  assert.equal(record.status, 'saved');
  assert.equal(record.providerCalls, 0);
  assert.equal(record.externalEffects, 0);
});

test('field ledger exposes provenance, verification and inferred-contact blockers', () => {
  const ledger = buildLeadFieldLedger({ prospect: { ...base, fieldObservations: [
    { field: 'account.industry', value: 'medical agency', sourceType: 'licensed_export', sourceUrl: 'https://source.example/a', observedAt: '2026-08-12T00:00:00.000Z', confidence: 0.9 },
    { field: 'account.industry', value: 'healthcare software', sourceType: 'provider_api', sourceUrl: 'https://source.example/b', observedAt: '2026-08-13T00:00:00.000Z', confidence: 0.8 }
  ] }, now });
  assert.equal(ledger.prospectId, 'p-1');
  assert.equal(ledger.fields.find(field => field.field === 'contact.email').status, 'verified');
  assert.equal(ledger.conflicts.length, 1);
  assert.equal(ledger.providerCalls, 0);
  const inferred = buildLeadFieldLedger({ prospect: { ...base, contact: { ...base.contact, email: 'guessed@northstar.example', inferred: true, exact: false, verified: 'unknown' } }, now });
  assert.equal(inferred.fields.find(field => field.field === 'contact.email').status, 'blocked-inferred');
  assert.ok(inferred.blockers.includes('inferred:contact.email'));
});

test('coverage map identifies evidence, contact, verification and signal bottlenecks', () => {
  const coverage = buildLeadCoverageMap({
    prospects: [base, { id: 'p-2', company: 'Unresearched Agency', website: 'https://agency.example', domain: 'agency.example', niche: 'medical agency', country: 'CA', status: 'queued' }],
    signals: [{ prospectId: 'p-1', type: 'funding', title: 'Funding', excerpt: 'A funding round was announced.', sourceType: 'public_website', observedAt: '2026-08-12T00:00:00.000Z', confidence: 0.9 }],
    profile: { name: 'Medical agencies', targetAccounts: 4, targetLeads: 4, query: { industries: ['medical agency'] } }, now
  });
  assert.equal(coverage.totals.records, 2);
  assert.equal(coverage.totals.accounts, 2);
  assert.equal(coverage.totals.verifiedContacts, 1);
  assert.ok(coverage.bottlenecks.some(item => item.key === 'missing_evidence'));
  assert.ok(coverage.bottlenecks.some(item => item.key === 'missing_contact'));
  assert.equal(coverage.providerCalls, 0);
});

test('buying-group plan makes missing persona coverage explicit', () => {
  const plan = buildBuyingGroupPlan({ accounts: [{ accountKey: 'northstar.example', company: 'Northstar', domain: 'northstar.example', personas: ['Founder'], accountScore: 70, buyingStage: 'research' }], requiredRoles: ['economic_buyer', 'champion', 'technical'], now });
  assert.equal(plan.summary.accounts, 1);
  assert.equal(plan.accounts[0].coveragePercent, 33);
  assert.deepEqual(plan.accounts[0].missingRoles, ['Champion / marketing owner', 'Technical evaluator']);
});

test('lookalike planning is explainable and preserves suppression/ownership exclusions', () => {
  const results = buildLookalikePlan({
    seeds: [base],
    candidates: [
      { id: 'p-2', company: 'Similar Medical Studio', website: 'https://similar.example', domain: 'similar.example', niche: 'medical agency', country: 'CA', city: 'Toronto', technologies: ['WordPress'], issue: { title: 'Mobile form fails' } },
      { id: 'p-3', company: 'Suppressed Studio', website: 'https://blocked.example', domain: 'blocked.example', niche: 'medical agency', country: 'CA', technologies: ['WordPress'] },
      { id: 'p-4', company: 'Owned Studio', website: 'https://owned.example', domain: 'owned.example', niche: 'medical agency', country: 'CA', status: 'sent' }
    ],
    suppressions: [{ value: 'blocked.example' }], limit: 10, now
  });
  assert.equal(results.status, 'ready');
  assert.equal(results.results[0].id, 'p-2');
  assert.ok(results.results[0].similarityReasons.length >= 3);
  assert.equal(results.results.find(row => row.id === 'p-3').eligible, false);
  assert.equal(results.externalEffects, 0);
});

test('provider preflight exposes waterfall attempts and blocks unconfigured BYOK', () => {
  const blocked = buildProviderPreflight({ fields: ['work_email', 'email_verification'], providers: ['apollo', 'hunter'], volume: 10 });
  assert.equal(blocked.safeToRun, false);
  assert.ok(blocked.blockingReasons.some(reason => /BYOK/.test(reason)));
  assert.ok(blocked.estimate.worstCaseAttempts >= 20);
  const local = buildProviderPreflight({ fields: ['website_evidence'], providers: ['local-evidence'], volume: 10 });
  assert.equal(local.safeToRun, true);
  assert.equal(local.blockingReasons.length, 0);
  assert.equal(local.providerCalls, 0);
});

test('control tower joins coverage, buying groups, field quality and provider plan', () => {
  const tower = buildLeadControlTower({ prospects: [base], signals: [], searches: [], enrichmentRuns: [], profile: { name: 'Medical QA', query: { industries: ['medical agency'] }, requiredPersonas: ['Founder'] }, now });
  assert.equal(tower.version, 'uberbond.lead-operations.v2');
  assert.equal(tower.coverage.totals.records, 1);
  assert.equal(tower.buyingGroups.summary.accounts, 1);
  assert.equal(tower.fieldQuality.records, 1);
  assert.ok(tower.providerPreflight.routes.length >= 2);
  assert.equal(tower.externalEffects, 0);
  assert.match(LEAD_OPERATIONS_POLICY.conflictRule, /Conflicting/);
});

