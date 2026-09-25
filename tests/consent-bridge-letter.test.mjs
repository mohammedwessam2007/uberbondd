import test from 'node:test';
import assert from 'node:assert/strict';
import { compileBridgeLetter, renderBridgeLetterBatch } from '../src/consent-bridge-letter.mjs';
import { issueInvitation, redeemInvitation } from '../src/consent-bridge.mjs';
import { compileEvidenceBeacon } from '../src/evidence-beacon.mjs';
import { deterministicAudit } from '../src/audit-rules.mjs';
import { compileUberPostalIdentity } from '../src/uberpostal-identity.mjs';

const NOW = new Date('2026-09-26T12:00:00Z');
const SECRET = 'k'.repeat(48);
const prospect = { company: 'Harbor Dental <Group>', website: 'https://harbordental.example' };
const crawl = { pages: [{ url: 'https://www.harbordental.example/', title: '', description: '', h1Count: 0, visibleH1: [], headings: [], robotsMeta: [], responseHeaders: {}, jsonLd: [], bodyText: 'Welcome to our clinic.', links: [], forms: [], images: [] }] };
const identity = compileUberPostalIdentity({ legalName: 'Example Founder', line1: '1 Example St', city: 'Example', country: 'US', ownerAuthorized: true, publicFooterAuthorized: true, evidenceRef: 'owner:test', now: NOW });
const issue = (channel = 'IN_PERSON') => issueInvitation({ prospect, campaignId: 'bridge_2026-09-26', channel, secret: SECRET, now: NOW });
const beaconFor = (invitation, findings = deterministicAudit(crawl, {})) => compileEvidenceBeacon({ invitation: invitation.record, website: prospect.website, findings, crawledAt: '2026-09-26T08:00:00Z', now: NOW });
const letter = (overrides = {}) => {
  const invitation = overrides.invitation || issue();
  return compileBridgeLetter({ invitation, beacon: beaconFor(invitation), prospect, postalIdentity: identity, siteBaseUrl: 'https://uberbond.example', stopEmail: 'stop@uberbond.example', format: 'CARD', now: NOW, ...overrides });
};

test('a card carries verifiable findings, a typeable code, the stop route and the sender identity', () => {
  const invitation = issue();
  const card = letter({ invitation });
  assert.equal(card.ok, true);
  assert.equal(card.findingCount, 2);
  assert.equal(card.landingUrl, `https://uberbond.example/?code=${invitation.printableCode}`);
  assert.ok(card.text.includes(`enter code ${invitation.printableCode}`));
  assert.ok(card.text.includes(`email stop@uberbond.example with "STOP ${invitation.printableCode}"`));
  assert.ok(card.text.includes('Example Founder · 1 Example St · Example · US'));
  assert.ok(card.text.includes('Page: https://www.harbordental.example/'));
  assert.equal(card.text.includes('hypothesis'), false, 'cards are short; the consequence line is letter-only');
  assert.equal(/\$\s?\d/.test(card.text), false, 'no revenue figure is invented');
  assert.ok(card.html.includes('Harbor Dental &lt;Group&gt;'), 'prospect text is escaped');
  assert.equal(card.html.includes('<Group>'), false);
  assert.equal(letter({ invitation }).letterId, card.letterId);

  const full = letter({ invitation: issue('POSTAL_LETTER'), format: 'LETTER' });
  assert.equal(full.findingCount, 3);
  assert.ok(full.text.includes('our hypothesis, not a measured loss'));
});

test('nothing qualifies, nothing prints', () => {
  const invitation = issue();
  const empty = compileEvidenceBeacon({ invitation: invitation.record, website: prospect.website, findings: [], crawledAt: '2026-09-26T08:00:00Z', now: NOW });
  assert.equal(empty.status, 'NO_QUALIFYING_FINDINGS');
  assert.deepEqual(letter({ invitation, beacon: empty }).reasonCodes, ['no-qualifying-findings-do-not-invite']);
});

test('a page without a real sender, stop route, https site or paper channel is refused', () => {
  const noFooter = compileUberPostalIdentity({ legalName: 'Example Founder', line1: '1 Example St', city: 'Example', country: 'US', ownerAuthorized: true, publicFooterAuthorized: false, evidenceRef: 'owner:test', now: NOW });
  assert.ok(letter({ postalIdentity: noFooter }).reasonCodes.includes('founder-authorized-sender-identity-required'));
  assert.ok(letter({ stopEmail: '' }).reasonCodes.includes('monitored-stop-address-required'));
  assert.ok(letter({ siteBaseUrl: 'http://uberbond.example' }).reasonCodes.includes('https-site-base-url-required'));
  const other = issueInvitation({ prospect, campaignId: 'another_campaign', channel: 'IN_PERSON', secret: SECRET, now: NOW });
  assert.ok(letter({ invitation: issue(), beacon: beaconFor(other) }).reasonCodes.includes('beacon-belongs-to-another-invitation'));
  assert.ok(letter({ prospect: { company: 'Harbor Dental', website: 'https://someone-else.example' } }).reasonCodes.includes('beacon-domain-differs-from-prospect-website'));
  assert.ok(letter({ format: 'POSTER' }).reasonCodes.includes('format-letter-or-card-required'));
  const printedEmail = issueInvitation({ prospect, campaignId: 'c', channel: 'COLD_EMAIL', secret: SECRET, now: NOW });
  assert.equal(printedEmail.ok, false, 'invitations themselves refuse email as the channel');
});

test('the printed code redeems into consent on the site, and the batch prints one page per card', () => {
  const invitation = issue();
  const card = letter({ invitation });
  const typed = card.text.match(/enter code ([0-9A-Z-]{14})/)[1];
  const redeemed = redeemInvitation({ record: invitation.record, code: typed, subjectEmail: 'office@harbordental.example', followUpConsent: true, secret: SECRET, now: NOW });
  assert.equal(redeemed.ok, true);
  assert.deepEqual(redeemed.receipts.map(r => r.wordingId), ['public-intake-v1', 'report-follow-up-v1']);

  const second = issueInvitation({ prospect: { company: 'Harbor Dental', website: 'https://harbordental.example' }, campaignId: 'bridge_2026-09-26', channel: 'IN_PERSON', secret: SECRET, now: NOW });
  const batch = renderBridgeLetterBatch([card, letter({ invitation: second }), { ok: false }]);
  assert.equal((batch.match(/<article class="bridge card">/g) || []).length, 2);
  assert.match(batch, /page-break-after: always/);
});

test('the real HTML crawler output flows through audit, beacon and letter for a live local site', async () => {
  const http = await import('node:http');
  const { crawlSiteBrowser } = await import('../src/browser-crawler.mjs');
  const { compileBridgePageFromCrawl } = await import('../src/consent-bridge-letter.mjs');
  const page = '<!doctype html><html lang="en"><head><title>Harbor Dental</title></head><body><h1>Welcome</h1><p>Where excellence meets innovative solutions.</p><a href="/about">About</a></body></html>';
  const server = http.createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('User-agent: *\nAllow: /'); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(page);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const website = `http://127.0.0.1:${server.address().port}/`;
    const crawl = await crawlSiteBrowser(website, { allowLocal: true, htmlOnly: true, maxPages: 2, delayMs: 0, timeoutMs: 5000 });
    assert.ok(crawl.pages.length >= 1);
    const now = new Date(crawl.completedAt);
    const common = { crawl, audit: deterministicAudit, issueInvitation, compileEvidenceBeacon, campaignId: 'bridge_test', channel: 'IN_PERSON', secret: SECRET, postalIdentity: identity, siteBaseUrl: 'https://uberbond.example', stopEmail: 'stop@uberbond.example', format: 'CARD', now };
    const result = compileBridgePageFromCrawl({ prospect: { company: 'Harbor Dental', website }, ...common });
    assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
    assert.ok(result.findingCount >= 1);
    assert.ok(result.text.includes(`Page: ${website}`));
    assert.equal(result.invitationRecord.channel, 'IN_PERSON');
    assert.deepEqual(compileBridgePageFromCrawl({ prospect: { company: 'Harbor Dental', website }, ...common, crawl: { pages: [], errors: [{ error: 'robots-unavailable' }] } }).reasonCodes, ['no-readable-public-pages', 'robots-unavailable']);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
