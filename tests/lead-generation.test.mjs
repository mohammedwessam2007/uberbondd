import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENRICHMENT_FIELDS,
  LEAD_GENERATION_POLICY,
  buildEnrichmentPlan,
  buildLeadAccountIntelligence,
  buildLeadGenerationWorkspace,
  buildLeadHandoffPlan,
  buildLeadSearchRecord,
  buildLeadSignalStack,
  normalizeLeadQuery,
  normalizeLeadSignal,
  scoreLeadCandidate,
  searchLocalLeadCorpus
} from '../src/lead-generation.mjs';

const now = new Date('2026-08-13T12:00:00.000Z');
const baseProspect = {
  id: 'pros-1', company: 'Northstar Medical Studio', website: 'https://northstar.example', domain: 'northstar.example',
  niche: 'medical agency', country: 'CA', city: 'Toronto', contact: { email: 'owner@northstar.example', verified: 'valid', name: 'Alex Owner', title: 'Founder' },
  source: 'public_website', sourceUrl: 'https://northstar.example/careers', completedAt: '2026-08-10T12:00:00.000Z',
  score: { total: 88 }, issue: { title: 'Mobile form fails', evidenceUrl: 'https://northstar.example/services', evidenceExcerpt: 'The contact form does not submit on mobile devices.' },
  audit: [{ code: 'FORM_SUBMIT', severity: 4 }], status: 'ready'
};

test('normalizes natural-language targeting and bounded thresholds', () => {
  const query = normalizeLeadQuery({ prompt: 'medical agencies in Toronto', countries: ['CA'], minScore: 120, limit: 9999, requireContact: false });
  assert.equal(query.prompt, 'medical agencies in Toronto');
  assert.deepEqual(query.countries, ['ca']);
  assert.equal(query.minScore, 100);
  assert.equal(query.limit, 250);
  assert.equal(query.requireContact, false);
});

test('swaps inverted numeric ranges without widening them', () => {
  const query = normalizeLeadQuery({ minEmployees: 500, maxEmployees: 10, minRevenueUsd: 9000, maxRevenueUsd: 100 });
  assert.equal(query.minEmployees, 10);
  assert.equal(query.maxEmployees, 500);
  assert.equal(query.minRevenueUsd, 100);
  assert.equal(query.maxRevenueUsd, 9000);
});

test('normalizes a source-backed signal and creates a stable digest', () => {
  const signal = normalizeLeadSignal({
    prospectId: 'pros-1', type: 'website_change', title: 'New services page',
    excerpt: 'The agency published a new conversion audit service.', sourceUrl: 'https://northstar.example/services',
    sourceType: 'public_website', confidence: 0.9, observedAt: '2026-08-12T12:00:00.000Z'
  }, { now });
  assert.equal(signal.prospectId, 'pros-1');
  assert.match(signal.id, /^leadsignal_[a-f0-9]{24}$/);
  assert.equal(signal.confidence, 0.9);
  assert.match(signal.digest, /^[a-f0-9]{64}$/);
});

test('rejects a non-HTTPS signal source', () => {
  assert.throws(() => normalizeLeadSignal({ prospectId: 'pros-1', type: 'news', title: 'News', excerpt: 'Material public news', sourceUrl: 'http://example.com' }, { now }), /HTTPS/);
});

test('scores fit, evidence, intent, contactability and safety separately', () => {
  const score = scoreLeadCandidate({
    candidate: baseProspect,
    query: { prompt: 'medical agency founder in CA', minScore: 0 },
    signals: [{ type: 'funding', title: 'New funding', confidence: 0.9, observedAt: '2026-08-12T12:00:00.000Z' }],
    now
  });
  assert.equal(score.eligible, true);
  assert.ok(score.fit > 0);
  assert.ok(score.evidence > 0);
  assert.ok(score.intent > 0);
  assert.equal(score.contactability, 10);
  assert.equal(score.safety, 5);
  assert.ok(score.total <= 100);
});

test('stacks independent signals into an explainable buying stage', () => {
  const stack = buildLeadSignalStack({ signals: [
    { type: 'funding', title: 'New funding', excerpt: 'The company announced a new funding round.', sourceType: 'public_website', confidence: 0.9, observedAt: '2026-08-12T12:00:00.000Z' },
    { type: 'job_listing', title: 'Hiring QA lead', excerpt: 'The company is hiring a QA lead for its website team.', sourceType: 'public_website', confidence: 0.85, observedAt: '2026-08-11T12:00:00.000Z' },
    { type: 'website_visit', title: 'Pricing page visit', excerpt: 'A first-party visitor viewed the pricing page.', sourceType: 'first_party_export', confidence: 0.95, observedAt: '2026-08-13T10:00:00.000Z' }
  ], now });
  assert.equal(stack.stacked, true);
  assert.equal(stack.stage, 'active-research');
  assert.equal(stack.distinctSignalTypes, 3);
  assert.ok(stack.score > 0);
  assert.equal(stack.providerCalls, 0);
});

test('suppression blocks a lead even when it otherwise scores well', () => {
  const score = scoreLeadCandidate({ candidate: baseProspect, query: { minScore: 0 }, suppressions: [{ value: 'owner@northstar.example' }], now });
  assert.equal(score.eligible, false);
  assert.ok(score.blocks.includes('suppressed'));
  assert.equal(score.safety, 0);
});

test('local search excludes suppressed, owned, weak-evidence and duplicate records', () => {
  const results = searchLocalLeadCorpus({
    prospects: [
      baseProspect,
      { ...baseProspect, id: 'pros-duplicate', contact: null },
      { ...baseProspect, id: 'pros-owned', status: 'sent', company: 'Owned Studio' },
      { ...baseProspect, id: 'pros-suppressed', company: 'Suppressed Studio', contact: { email: 'blocked@northstar.example' } },
      { id: 'pros-weak', company: 'Weak Studio', website: 'https://weak.example', domain: 'weak.example', niche: 'medical agency', country: 'CA', status: 'queued' }
    ],
    suppressions: [{ value: 'blocked@northstar.example' }],
    query: { prompt: 'medical agency', minScore: 0 }, now
  });
  assert.equal(results.returned, 1);
  assert.equal(results.results[0].id, 'pros-1');
  assert.ok(results.excluded.already_owned >= 1);
  assert.ok(results.excluded.suppressed >= 1);
  assert.ok(results.excluded.duplicate >= 1 || results.excluded.contact >= 1);
});

test('local search can intentionally include records without contact or evidence for research planning', () => {
  const results = searchLocalLeadCorpus({
    prospects: [{ id: 'pros-2', company: 'Unresearched Agency', website: 'https://agency.example', domain: 'agency.example', niche: 'agency', country: 'EG', status: 'queued' }],
    query: { prompt: 'agency', requireEvidence: false, requireContact: false, skipOwned: false, minScore: 0 }, now
  });
  assert.equal(results.returned, 1);
  assert.equal(results.results[0].id, 'pros-2');
});

test('search deduplicates by exact email before domain', () => {
  const results = searchLocalLeadCorpus({
    prospects: [
      { ...baseProspect, id: 'pros-a', company: 'A' },
      { ...baseProspect, id: 'pros-b', company: 'B', contact: { email: 'other@northstar.example', verified: 'valid' } }
    ],
    query: { minScore: 0 }, now
  });
  assert.equal(results.returned, 1);
});

test('builds a reusable saved search record', () => {
  const record = buildLeadSearchRecord({ name: 'Canadian medical agencies', query: { countries: ['CA'], industries: ['medical agency'] }, now });
  assert.match(record.id, /^leadsearch_/);
  assert.equal(record.status, 'saved');
  assert.deepEqual(record.query.countries, ['ca']);
});

test('builds a provider-neutral waterfall enrichment plan without calling providers', () => {
  const plan = buildEnrichmentPlan({ prospect: baseProspect, fields: ENRICHMENT_FIELDS, providers: ['hunter'], now });
  assert.equal(plan.status, 'planned');
  assert.equal(plan.providerCalls, 0);
  assert.equal(plan.externalEffects, 0);
  assert.equal(plan.summary.existingEmail, true);
  assert.ok(plan.steps.some(step => step.field === 'work_email'));
  assert.ok(plan.steps.flatMap(step => step.waterfall).some(step => step.provider === 'hunter' && step.status === 'configured-plan-only'));
  assert.match(plan.policy.contactRule, /Never invent/);
});

test('workspace summarizes sources, signals and enrichment state', () => {
  const signal = normalizeLeadSignal({ prospectId: 'pros-1', type: 'job_change', title: 'New QA hire', excerpt: 'A new QA hire appeared on the public team page.', sourceUrl: 'https://northstar.example/team', sourceType: 'public_website', observedAt: '2026-08-12T12:00:00.000Z' }, { now });
  const workspace = buildLeadGenerationWorkspace({ prospects: [baseProspect], signals: [signal], leadLists: [{ id: 'list-1' }], searches: [{ id: 'search-1' }], enrichmentRuns: [{ id: 'run-1' }], now });
  assert.equal(workspace.stats.totalRecords, 1);
  assert.equal(workspace.stats.activeSignals, 1);
  assert.equal(workspace.stats.savedSearches, 1);
  assert.equal(workspace.stats.accountCount, 1);
  assert.equal(workspace.topAccounts[0].buyingStage, 'awareness');
  assert.equal(workspace.providerContract.noProviderCalls, true);
});

test('account intelligence groups contacts and exposes signal diversity', () => {
  const second = { ...baseProspect, id: 'pros-2', contact: { email: 'marketing@northstar.example', verified: 'valid', title: 'Marketing Director' } };
  const accounts = buildLeadAccountIntelligence({
    prospects: [baseProspect, second],
    signals: [
      { prospectId: 'pros-1', type: 'funding', title: 'Funding round', excerpt: 'A funding round was announced publicly.', sourceType: 'public_website', confidence: 0.9, observedAt: '2026-08-12T12:00:00.000Z' },
      { prospectId: 'pros-2', type: 'job_listing', title: 'Hiring QA', excerpt: 'The agency is hiring a QA lead.', sourceType: 'public_website', confidence: 0.9, observedAt: '2026-08-12T12:00:00.000Z' }
    ],
    query: { minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false },
    now
  });
  assert.equal(accounts.totalAccounts, 1);
  assert.equal(accounts.accounts[0].contacts, 2);
  assert.equal(accounts.accounts[0].signalStack.distinctSignalTypes, 2);
  assert.equal(accounts.accounts[0].stackedSignals, true);
  assert.equal(accounts.externalEffects, 0);
});

test('handoff plan exposes eligible and blocked rows without enrolling or sending', () => {
  const handoff = buildLeadHandoffPlan({ prospects: [baseProspect], query: { minScore: 0 }, campaign: { id: 'camp-1', name: 'QA' }, now });
  assert.equal(handoff.counts.total, 1);
  assert.equal(handoff.counts.eligible, 1);
  assert.equal(handoff.rows[0].action, 'owner-plan-ready');
  assert.equal(handoff.providerCalls, 0);
  assert.equal(handoff.externalEffects, 0);
});

test('policy forbids LinkedIn scraping and provider calls in the local engine', () => {
  assert.equal(LEAD_GENERATION_POLICY.providerCalls, 0);
  assert.match(LEAD_GENERATION_POLICY.linkedinRule, /No LinkedIn scraping/);
});
