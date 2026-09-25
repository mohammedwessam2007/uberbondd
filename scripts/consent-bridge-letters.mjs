#!/usr/bin/env node
// Print-ready consent-bridge letters or hand-out cards for a short list of
// businesses. Founder-run: it reads each prospect's public pages (robots.txt
// respected, HTML only), keeps only findings the prospect can verify, issues an
// invitation code, and writes one printable HTML file plus the invitation
// records needed to attribute requests later. Prospect data and invitation
// records stay in ~/.uberbond, never in the repository.
//
// It sends nothing, posts nothing and spends nothing. A prospect whose route
// for the requested channel is not ALLOW (for example a sender whose own
// country needs a counsel confirmation for letters) is listed with the reason
// and skipped.
//
//   UBERBOND_INVITATION_SECRET=<32+ chars> node scripts/consent-bridge-letters.mjs \
//     --prospects ~/.uberbond/bridge-prospects.json --site https://<your site> \
//     [--channel IN_PERSON|POSTAL_LETTER] [--format CARD|LETTER] [--postage-cents 150]
//
// prospects file: [{ "company", "website", "jurisdiction", "postalAddressRef"?, "inPersonOpportunityRef"? }]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crawlSiteBrowser } from '../src/browser-crawler.mjs';
import { deterministicAudit } from '../src/audit-rules.mjs';
import { issueInvitation } from '../src/consent-bridge.mjs';
import { compileEvidenceBeacon } from '../src/evidence-beacon.mjs';
import { compileBridgePageFromCrawl, renderBridgeLetterBatch } from '../src/consent-bridge-letter.mjs';
import { routeProspect } from '../src/lawful-channel-router.mjs';
import { compileUberPostalIdentity } from '../src/uberpostal-identity.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback = '') => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const home = path.join(os.homedir(), '.uberbond');
const expand = p => p.replace(/^~(?=$|\/)/, os.homedir());
const fail = (message, code = 2) => { console.error(message); process.exit(code); };

const channel = opt('channel', 'IN_PERSON').toUpperCase();
const format = opt('format', channel === 'IN_PERSON' ? 'CARD' : 'LETTER').toUpperCase();
const siteBaseUrl = opt('site', process.env.APP_BASE_URL || '');
const secret = process.env.UBERBOND_INVITATION_SECRET || '';
const prospectsPath = expand(opt('prospects', path.join(home, 'bridge-prospects.json')));
const factsPath = expand(opt('facts', path.join(home, 'launch-facts.json')));
const postageCents = Number(opt('postage-cents', '0'));
const counselAttestationRef = opt('counsel-ref', '');

if (!['IN_PERSON', 'POSTAL_LETTER'].includes(channel)) fail('--channel must be IN_PERSON or POSTAL_LETTER');
if (secret.length < 32) fail('Set UBERBOND_INVITATION_SECRET to 32+ random characters and keep it: it is needed to attribute requests later.');
if (!fs.existsSync(prospectsPath)) fail(`No prospects file at ${prospectsPath}. Write a JSON array of { company, website, jurisdiction } there (it stays outside git).`);
if (!fs.existsSync(factsPath)) fail(`No launch facts at ${factsPath}. Run: npm run outreach:launch-facts`);

const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
const prospects = JSON.parse(fs.readFileSync(prospectsPath, 'utf8'));
if (!Array.isArray(prospects) || !prospects.length || prospects.length > 50) fail('The prospects file must be a JSON array of 1 to 50 businesses.');

const postal = facts.postal || {};
const postalIdentity = compileUberPostalIdentity({
  legalName: facts.legalName, line1: postal.line1, line2: postal.line2, city: postal.city, region: postal.region, postalCode: postal.postalCode, country: postal.country,
  ownerAuthorized: facts.postalAddressAuthorized === true, publicFooterAuthorized: facts.publicFooterAuthorized === true,
  evidenceRef: /YYYY-MM-DD/.test(String(facts.postalEvidenceRef || '')) ? '' : facts.postalEvidenceRef
});
if (!postalIdentity.ok) fail(`The sender identity printed on every page is not ready: ${postalIdentity.blockers.join(', ')}. Fill ~/.uberbond/launch-facts.json.`);

const now = new Date();
const context = {
  senderJurisdiction: String(facts.senderJurisdiction || '').toUpperCase(),
  postalIdentityReady: true,
  counselAttestationRef,
  channels: { postal: { authorized: channel === 'POSTAL_LETTER', costCentsPerLetter: postageCents } },
  budgetRemainingCents: channel === 'POSTAL_LETTER' ? postageCents * prospects.length : 0,
  now
};

const letters = [];
const invitations = [];
const skipped = [];
for (const p of prospects) {
  const ref = String(p.website || p.company || '').slice(0, 120);
  const routed = routeProspect({
    prospect: { ref, jurisdiction: p.jurisdiction, recipientType: 'CORPORATE', postalAddressRef: p.postalAddressRef, inPersonOpportunityRef: p.inPersonOpportunityRef || (channel === 'IN_PERSON' ? 'founder-hand-delivery' : '') },
    eligibility: null,
    context
  });
  const channelRoute = routed.routes?.find(r => r.channel === channel);
  if (channelRoute?.state !== 'ALLOW') { skipped.push({ company: p.company, reason: channelRoute ? [...channelRoute.reasons, ...channelRoute.unmet] : routed.reasonCodes }); continue; }

  let crawl;
  try {
    crawl = await crawlSiteBrowser(p.website, { htmlOnly: true, maxPages: 5, delayMs: 500, timeoutMs: 10000 });
  } catch (error) { skipped.push({ company: p.company, reason: [`public-pages-unreadable:${error.message}`] }); continue; }
  const page = compileBridgePageFromCrawl({
    prospect: p, crawl, audit: deterministicAudit, issueInvitation, compileEvidenceBeacon,
    campaignId: `bridge_${now.toISOString().slice(0, 10)}`, channel, secret, postalIdentity, siteBaseUrl, stopEmail: facts.replyToAddress, format, now
  });
  if (!page.ok) { skipped.push({ company: p.company, reason: page.reasonCodes }); continue; }
  letters.push(page);
  invitations.push(page.invitationRecord);
}

const outDir = expand(opt('out', path.join(home, 'bridge', now.toISOString().slice(0, 10))));
fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
const write = (name, content) => { const file = path.join(outDir, name); fs.writeFileSync(file, content, { mode: 0o600 }); return file; };
const printFile = letters.length ? write(`${channel.toLowerCase()}-${format.toLowerCase()}s.html`, renderBridgeLetterBatch(letters)) : null;
const invitationFile = invitations.length ? write('invitations.json', JSON.stringify(invitations, null, 2) + '\n') : null;
console.log(JSON.stringify({
  status: letters.length ? 'BRIDGE_PAGES_READY_TO_PRINT' : 'NOTHING_TO_PRINT',
  channel,
  format,
  printed: letters.length,
  skipped,
  printFile,
  invitationFile,
  postageEstimateCents: channel === 'POSTAL_LETTER' ? postageCents * letters.length : 0,
  nextStep: letters.length ? 'Print the file, hand over or post each page, and keep invitations.json: npm run outreach:bridge-attribute reads it with exported leads.' : 'Nothing qualified. See skipped reasons.',
  externalEffects: 0
}, null, 2));
