import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEvidenceBeacon } from '../src/evidence-beacon.mjs';
import { issueInvitation } from '../src/consent-bridge.mjs';
import { deterministicAudit } from '../src/audit-rules.mjs';

const NOW = new Date('2026-09-26T12:00:00Z');
const invitation = issueInvitation({ prospect: { company: 'Harbor Dental', website: 'https://harbordental.example' }, campaignId: 'camp_1', channel: 'POSTAL_LETTER', secret: 'k'.repeat(48), now: NOW }).record;
const crawl = { pages: [{ url: 'https://www.harbordental.example/', title: '', description: '', h1Count: 0, visibleH1: [], headings: [], robotsMeta: [], responseHeaders: {}, jsonLd: [], bodyText: 'Welcome to our clinic.', links: [], forms: [], images: [] }] };
const findings = deterministicAudit(crawl, { niche: 'dental' });
const beacon = (overrides = {}) => compileEvidenceBeacon({ invitation, website: 'https://harbordental.example', findings, crawledAt: '2026-09-25T08:00:00Z', now: NOW, ...overrides });

test('real audit findings become a verifiable, capped, severity-ordered packet', () => {
  const b = beacon();
  assert.equal(b.status, 'EVIDENCE_BEACON_READY');
  assert.equal(b.inviteRecommended, true);
  assert.equal(b.findings.length, 5);
  assert.deepEqual(b.findings.map(f => f.code).slice(0, 2).sort(), ['no-cta', 'weak-contact-path']);
  assert.ok(b.findings.every(f => f.page.startsWith('https://www.harbordental.example/') && f.excerpt && f.howToCheck.startsWith('Open ')));
  assert.equal(b.excludedCounts['marked-unsafe-for-outreach'], 1, 'the low-confidence crawler note is excluded');
  assert.equal(b.proofOfValue.claimType, 'OBSERVED_ON_YOUR_PUBLIC_PAGES__NO_REVENUE_IMPACT_CLAIMED');
  assert.equal(JSON.stringify(b).match(/\$\s?\d/), null, 'no money figures are invented');
  assert.equal(beacon().beaconId, b.beaconId);
});

test('findings about other domains, without excerpts or below confidence never reach the packet', () => {
  const b = beacon({ findings: [
    { code: 'x', title: 'Other site issue', severity: 5, confidence: 0.99, evidenceUrl: 'https://competitor.example/', evidenceExcerpt: 'foo' },
    { code: 'y', title: 'Lookalike domain', severity: 5, confidence: 0.99, evidenceUrl: 'https://harbordental.example.evil.test/', evidenceExcerpt: 'foo' },
    { code: 'z', title: 'No excerpt', severity: 5, confidence: 0.99, evidenceUrl: 'https://harbordental.example/', evidenceExcerpt: '' },
    { code: 'w', title: 'Weak', severity: 5, confidence: 0.5, evidenceUrl: 'https://harbordental.example/', evidenceExcerpt: 'foo' }
  ] });
  assert.equal(b.status, 'NO_QUALIFYING_FINDINGS');
  assert.equal(b.inviteRecommended, false);
  assert.deepEqual(b.excludedCounts, { 'evidence-not-on-prospect-domain': 2, 'no-observed-excerpt': 1, 'confidence-below-threshold': 1 });
});

test('stale, future-dated or unbound evidence is refused', () => {
  assert.deepEqual(beacon({ crawledAt: '2026-08-01T00:00:00Z' }).reasonCodes, ['crawl-older-than-30-days-rerun-audit']);
  assert.deepEqual(beacon({ crawledAt: '2026-10-01T00:00:00Z' }).reasonCodes, ['crawl-time-in-future']);
  assert.deepEqual(beacon({ invitation: { invitationId: 'x' } }).reasonCodes, ['consent-bridge-invitation-required']);
  assert.deepEqual(beacon({ website: 'not a url' }).reasonCodes, ['prospect-public-website-required']);
});
