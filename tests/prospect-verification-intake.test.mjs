import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProspectVerification, PROSPECT_STATUSES } from '../src/prospect-verification-intake.mjs';

const now = new Date('2026-10-05T12:00:00.000Z');
const full = (patch = {}) => ({
  company: 'Example Home Marketing', website: 'https://agency.example/', hqCountry: 'US',
  currentOwnership: { status: 'INDEPENDENT', evidenceUrl: 'https://agency.example/about' },
  recipient: {
    email: 'hello@agency.example', publishedRole: 'GENERAL_BUSINESS_INQUIRIES', sourceUrl: 'https://agency.example/contact',
    excerpt: 'General inquiries: hello@agency.example', observedAt: '2026-10-04T12:00:00.000Z'
  },
  notices: { noSolicitationChecked: true, noSolicitationFound: false, noHarvestChecked: true, noHarvestFound: false },
  offerFit: { servesHomeServiceClients: true, evidenceUrl: 'https://agency.example/hvac-marketing' },
  clientEvidence: {
    clientName: 'Example HVAC', clientSiteUrl: 'https://example-hvac.example/',
    observation: { verifiable: true, text: 'Contact form returns a blank page after submit', sourceUrl: 'https://example-hvac.example/contact', excerpt: 'blank page after submit', observedAt: '2026-10-04T13:00:00.000Z' }
  },
  ...patch
});
const deep = (patch, path) => { const r = full(); let o = r; const keys = path.split('.'); for (const k of keys.slice(0, -1)) o = o[k]; o[keys.at(-1)] = patch; return r; };
const run = (record, excludedRecipients = []) => compileProspectVerification(record, { now, excludedRecipients });
const has = (result, list, fragment) => assert.ok(result[list].some(r => r.includes(fragment)), `${fragment} not in ${JSON.stringify(result[list])}`);

test('a fully observed independent US agency is a VERIFIED_CANDIDATE but still carries no authority', () => {
  const r = run(full());
  assert.equal(r.status, PROSPECT_STATUSES.VERIFIED_CANDIDATE, JSON.stringify(r));
  assert.equal(r.legalAuthorityStatus, 'HOLD_SENDER_SIDE_UNRESOLVED');
  assert.equal(r.senderSideEvaluated, false);
  assert.equal(r.sendAuthority, false);
  assert.equal(r.recipientSideEligibility.decision, 'ALLOW_WITH_REQUIREMENTS');
});

test('privacy-only, legal, careers and support addresses are rejected as sales recipients', () => {
  for (const role of ['PRIVACY_ONLY', 'LEGAL_ONLY', 'CAREERS_ONLY', 'CUSTOMER_SUPPORT_ONLY', 'ABUSE_OR_SECURITY']) {
    const r = run(deep(role, 'recipient.publishedRole'));
    assert.equal(r.status, PROSPECT_STATUSES.REJECTED);
    has(r, 'rejectionReasons', 'not-sales');
  }
  assert.equal(run(deep('UNKNOWN', 'recipient.publishedRole')).status, PROSPECT_STATUSES.INCOMPLETE);
});

test('part of a larger group is rejected; unverified ownership is incomplete', () => {
  has(run(deep('PART_OF_LARGER_GROUP', 'currentOwnership.status')), 'rejectionReasons', 'larger-group');
  has(run(deep('UNKNOWN', 'currentOwnership.status')), 'missingEvidence', 'ownership');
  has(run(deep('GB', 'hqCountry')), 'missingEvidence', 'us-headquarters');
});

test('the address must literally appear in the retained excerpt and be published on the agency\'s own site', () => {
  has(run(deep('General inquiries: hi@agency.example', 'recipient.excerpt')), 'rejectionReasons', 'excerpt-does-not-contain');
  has(run(deep('https://directory.example/agency', 'recipient.sourceUrl')), 'rejectionReasons', 'own-site');
  has(run(deep('', 'recipient.excerpt')), 'missingEvidence', 'excerpt-missing');
  has(run(deep('http://agency.example/contact', 'recipient.sourceUrl')), 'missingEvidence', 'source-https');
  has(run(deep('2026-12-01T00:00:00.000Z', 'recipient.observedAt')), 'rejectionReasons', 'in-future');
});

test('personal mailboxes, system addresses and invalid addresses are rejected', () => {
  for (const email of ['boss@gmail.com', 'noreply@agency.example', 'not-an-email']) {
    const r = run(full({ recipient: { ...full().recipient, email, excerpt: `contact ${email}` } }));
    assert.equal(r.status, PROSPECT_STATUSES.REJECTED, email);
  }
});

test('notices: unchecked is incomplete, present is rejected', () => {
  has(run(deep(false, 'notices.noSolicitationChecked')), 'missingEvidence', 'no-solicitation');
  has(run(deep(false, 'notices.noHarvestChecked')), 'missingEvidence', 'no-harvest');
  has(run(deep(true, 'notices.noSolicitationFound')), 'rejectionReasons', 'no-solicitation-notice-present');
  has(run(deep(true, 'notices.noHarvestFound')), 'rejectionReasons', 'no-harvest-notice-present');
});

test('prior contact or suppression dominates, case-insensitively', () => {
  has(run(full(), ['HELLO@Agency.example']), 'rejectionReasons', 'prior-contact-or-suppression');
});

test('without a real client site and an externally verifiable observation the candidate stays INCOMPLETE; no observation is invented', () => {
  const none = run(full({ clientEvidence: null }));
  assert.equal(none.status, PROSPECT_STATUSES.INCOMPLETE);
  has(none, 'missingEvidence', 'observation-missing');
  has(none, 'missingEvidence', 'real-client-site');
  const unverifiable = run(deep(false, 'clientEvidence.observation.verifiable'));
  assert.equal(unverifiable.status, PROSPECT_STATUSES.INCOMPLETE);
  assert.equal(run(deep(false, 'offerFit.servesHomeServiceClients')).status, PROSPECT_STATUSES.INCOMPLETE);
});

test('the known externally reported candidates resolve exactly as their evidence allows', () => {
  // 1SEO: publicly lists info@1seo.com but now states it is part of Scorpion.
  assert.equal(run({ company: '1SEO', website: 'https://1seo.com/', currentOwnership: { status: 'PART_OF_LARGER_GROUP' }, recipient: { email: 'info@1seo.com', publishedRole: 'GENERAL_BUSINESS_INQUIRIES' } }).status, PROSPECT_STATUSES.REJECTED);
  // KickCharge: sparky@ is listed in the privacy-contact section only.
  assert.equal(run({ company: 'KickCharge Creative', website: 'https://www.kickcharge.com/', recipient: { email: 'sparky@kickcharge.com', publishedRole: 'PRIVACY_ONLY' } }).status, PROSPECT_STATUSES.REJECTED);
  // Footbridge: address reported, but excerpt, notices and client observation are not yet retained.
  const foot = run({ company: 'Footbridge Media', website: 'https://www.footbridgemedia.com/', recipient: { email: 'service@footbridgemedia.com', publishedRole: 'UNKNOWN' } });
  assert.equal(foot.status, PROSPECT_STATUSES.INCOMPLETE);
  assert.ok(foot.missingEvidence.length >= 5);
});

test('intake is pure and inert: it does not mutate its input and nothing imports it', async () => {
  const record = full(); const before = JSON.stringify(record);
  run(record);
  assert.equal(JSON.stringify(record), before);
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname;
  const importers = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'tests' || name === '.git') continue;
      const full2 = join(dir, name);
      if (statSync(full2).isDirectory()) walk(full2);
      else if (/\.(mjs|js)$/.test(name) && readFileSync(full2, 'utf8').includes('prospect-verification-intake') && !full2.endsWith('src/prospect-verification-intake.mjs')) importers.push(full2.slice(root.length));
    }
  };
  walk(root);
  assert.deepEqual(importers, []);
});
