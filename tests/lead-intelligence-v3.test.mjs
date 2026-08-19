import test from 'node:test';
import assert from 'node:assert/strict';
import { ENRICHMENT_FIELDS } from '../src/lead-generation.mjs';
import {
  LEAD_INTELLIGENCE_POLICY,
  buildLeadActionQueue,
  buildLeadAttributionSnapshot,
  buildLeadCaptureSpec,
  buildLeadIntakeRecord,
  buildLeadIntelligenceWorkspace,
  normalizeLeadIntake,
  runLocalEnrichment
} from '../src/lead-intelligence-v3.mjs';

const now = new Date('2026-08-13T12:00:00.000Z');
const base = {
  id: 'p-1', company: 'Northstar Medical Studio', website: 'https://northstar.example', domain: 'northstar.example', niche: 'medical agency', country: 'CA', city: 'Toronto',
  technologies: ['WordPress'], source: 'licensed_export', sourceUrl: 'https://northstar.example/about', sourceLicense: 'owner-authorized export', createdAt: '2026-08-01T12:00:00.000Z', completedAt: '2026-08-10T12:00:00.000Z', status: 'ready',
  contact: { email: 'owner@northstar.example', name: 'Alex Owner', title: 'Founder', source: 'licensed_export', sourceUrl: 'https://northstar.example/team', sourceLicense: 'owner-authorized export', observedAt: '2026-08-10T12:00:00.000Z', verified: 'valid', exact: true },
  issue: { title: 'Mobile form fails', evidenceUrl: 'https://northstar.example/services', evidenceExcerpt: 'The contact form does not submit on mobile devices.', evidenceObservedAt: '2026-08-10T12:00:00.000Z', confidence: 0.9 },
  audit: [{ code: 'FORM_SUBMIT' }]
};

test('normalizes first-party intake with privacy metadata and stable idempotency', () => {
  const record = normalizeLeadIntake({
    kind: 'form', idempotencyKey: 'submission-1', company: 'Northstar Medical Studio', website: 'https://northstar.example',
    businessEmail: 'owner@northstar.example', role: 'Founder', message: 'Please review our mobile form.',
    pageUrl: 'https://northstar.example/contact', noticeUrl: 'https://northstar.example/privacy', noticeVersion: '2026-01', consentState: 'explicit',
    utm: { source: 'referral', campaign: 'qa' }, ip: '198.51.100.1', cookie: 'secret'
  }, { now });
  assert.equal(record.kind, 'form_submission');
  assert.equal(record.status, 'needs_owner_review');
  assert.equal(record.accountKey, 'northstar.example');
  assert.equal(record.privacy.consentState, 'explicit');
  assert.equal(record.fields.utm.source, 'referral');
  assert.equal(record.ip, undefined);
  assert.equal(record.cookie, undefined);
  assert.match(record.id, /^intake_[a-f0-9]{24}$/);
  assert.equal(record.providerCalls, 0);
  assert.equal(record.externalEffects, 0);
});

test('visitor events remain account-level and reject unsafe URLs', () => {
  const visitor = normalizeLeadIntake({ kind: 'visitor_event', eventId: 'visit-1', website: 'https://northstar.example', pageUrl: 'https://northstar.example/pricing', eventName: 'pricing_view' }, { now });
  assert.equal(visitor.status, 'account-activity');
  assert.equal(visitor.privacy.identityMode, 'account-only');
  assert.equal(visitor.email, '');
  assert.throws(() => normalizeLeadIntake({ kind: 'form', website: 'http://northstar.example' }, { now }), /HTTPS/);
});

test('local enrichment returns typed field results without provider calls', () => {
  const result = runLocalEnrichment({ prospect: base, fields: ['company_profile', 'website_evidence', 'work_email', 'email_verification', 'technology', 'funding'], signals: [{ prospectId: base.id, type: 'funding', title: 'New funding', excerpt: 'Northstar announced a new funding round.', sourceType: 'public_website', sourceUrl: 'https://northstar.example/news', observedAt: '2026-08-12T00:00:00.000Z', confidence: 0.8 }], now });
  assert.equal(result.status, 'locally_complete');
  assert.equal(result.summary.found, 6);
  assert.equal(result.summary.missing, 0);
  assert.equal(result.summary.blockers, 0);
  assert.equal(result.results.find(row => row.field === 'email_verification').status, 'found');
  assert.equal(result.results.find(row => row.field === 'funding').provider, 'local-evidence');
  assert.equal(result.providerCalls, 0);
  assert.equal(result.externalEffects, 0);
});

test('local enrichment treats a null field selection as the safe default', () => {
  const result = runLocalEnrichment({ prospect: base, fields: null, now });
  assert.equal(result.requestedFields.length, ENRICHMENT_FIELDS.length);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.externalEffects, 0);
});

test('action queue prioritizes a reply or first-party event over routine enrichment', () => {
  const inquiry = buildLeadIntakeRecord({ kind: 'first_party_inquiry', idempotencyKey: 'inquiry-1', company: base.company, website: base.website, email: base.contact.email, pageUrl: 'https://northstar.example/contact', consentState: 'explicit' }, { now, prospectId: base.id });
  const queue = buildLeadActionQueue({ prospects: [base], signals: [], suppressions: [], intakeEvents: [inquiry], profile: null, now });
  assert.ok(queue.tasks.length >= 2);
  assert.equal(queue.tasks[0].taskType, 'owner_response');
  assert.equal(queue.tasks[0].status, 'ready');
  assert.equal(queue.tasks[0].providerCalls, 0);
  assert.equal(queue.summary.ready >= 1, true);
});

test('attribution exposes source funnel and refuses premature calibration', () => {
  const snapshot = buildLeadAttributionSnapshot({ prospects: [
    { ...base, status: 'sent', source: 'licensed_export' },
    { ...base, id: 'p-2', domain: 'second.example', website: 'https://second.example', status: 'replied', source: 'first_party_export', repliedAt: '2026-08-13T10:00:00.000Z' },
    { ...base, id: 'p-3', domain: 'third.example', website: 'https://third.example', status: 'paid', source: 'first_party_export', paymentStatus: 'paid' }
  ], intakeEvents: [], signals: [], now });
  assert.equal(snapshot.funnel.captured, 3);
  assert.equal(snapshot.funnel.contacted, 3);
  assert.equal(snapshot.funnel.replied, 2);
  assert.equal(snapshot.funnel.cleared_payment, 1);
  assert.equal(snapshot.learning.status, 'insufficient-outcomes-for-calibration');
  assert.ok(snapshot.bySource.some(row => row.source === 'first_party_export'));
});

test('workspace joins capture, queue, enrichment and attribution with zero external effects', () => {
  const intake = buildLeadIntakeRecord({ kind: 'visitor_event', eventId: 'visit-1', website: base.website, pageUrl: 'https://northstar.example/pricing', eventName: 'pricing_view' }, { now });
  const workspace = buildLeadIntelligenceWorkspace({ prospects: [base], signals: [], suppressions: [], searches: [], enrichmentRuns: [], intakeEvents: [intake], fieldResults: [{ status: 'found' }], profile: { name: 'QA', query: { industries: ['medical agency'] } }, now });
  assert.equal(workspace.version, 'uberbond.lead-intelligence.v3');
  assert.equal(workspace.intake.total, 1);
  assert.equal(workspace.enrichment.runs, 1);
  assert.ok(workspace.actionQueue.tasks.length >= 1);
  assert.equal(workspace.attribution.totalProspects, 1);
  assert.equal(workspace.externalEffects, 0);
  assert.match(LEAD_INTELLIGENCE_POLICY.visitorRule, /account-level/);
});

test('capture spec makes the public boundary explicit', () => {
  const spec = buildLeadCaptureSpec({ enabled: false });
  assert.equal(spec.enabled, false);
  assert.equal(spec.method, 'POST');
  assert.ok(spec.privacy.some(item => /IP addresses/.test(item)));
  assert.equal(spec.response.externalEffects, 0);
});
