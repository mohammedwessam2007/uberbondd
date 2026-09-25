// Printable first touch for the consent bridge: a letter or a hand-out card.
//
// This is the $0-to-postage first-cash path. It needs no mail server, DNS or
// sending reputation: the founder prints the page at home and posts it or hands
// it over. The page carries only what can be checked — observations from the
// prospect's own public pages (the Evidence Beacon) — plus an invitation code.
// The prospect's own request on the website creates the consent receipts; any
// email that follows is something they asked for.
//
// A letter is refused rather than weakened: no qualifying findings, no
// founder-authorized sender identity on the page, no working stop route, or a
// channel other than paper means there is nothing to print.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const BRIDGE_LETTER_VERSION = 'uberbond.consent-bridge-letter.v1';
export const BRIDGE_LETTER_FORMATS = Object.freeze({ LETTER: 3, CARD: 2 });

const PAPER_CHANNELS = new Set(['POSTAL_LETTER', 'IN_PERSON']);
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function httpsBase(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch { return null; }
}

function hostOf(value) {
  try { return new URL(String(value)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

export function compileBridgeLetter({ invitation, beacon, prospect = {}, postalIdentity, siteBaseUrl, stopEmail, format = 'LETTER', now = new Date() } = {}) {
  const reasons = [];
  const record = invitation?.record;
  const kind = clean(format, 10).toUpperCase();
  if (!BRIDGE_LETTER_FORMATS[kind]) reasons.push('format-letter-or-card-required');
  if (invitation?.ok !== true || !record?.invitationId || !invitation.printableCode) reasons.push('issued-invitation-required');
  else if (!PAPER_CHANNELS.has(record.channel)) reasons.push('paper-channel-invitation-required');
  if (beacon?.ok !== true || beacon.status !== 'EVIDENCE_BEACON_READY') reasons.push('no-qualifying-findings-do-not-invite');
  else if (beacon.invitationId !== record?.invitationId) reasons.push('beacon-belongs-to-another-invitation');
  const identity = postalIdentity?.identity;
  if (postalIdentity?.ok !== true || identity?.publicFooterAuthorized !== true || !clean(identity?.footer)) reasons.push('founder-authorized-sender-identity-required');
  const base = httpsBase(siteBaseUrl);
  if (!base) reasons.push('https-site-base-url-required');
  const stop = clean(stopEmail, 320).toLowerCase();
  if (!validEmail(stop)) reasons.push('monitored-stop-address-required');
  const company = clean(prospect.company, 180);
  const host = hostOf(prospect.website);
  if (!company || !host) reasons.push('prospect-company-and-website-required');
  else if (beacon?.domain && beacon.domain !== host) reasons.push('beacon-domain-differs-from-prospect-website');
  if (reasons.length) return { ok: false, version: BRIDGE_LETTER_VERSION, reasonCodes: [...new Set(reasons)], externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS) };

  const code = invitation.printableCode;
  const landingUrl = new URL(invitation.landingPath, base).toString();
  const enterAt = `${base.host}${base.pathname === '/' ? '' : base.pathname}`;
  const findings = beacon.findings.slice(0, BRIDGE_LETTER_FORMATS[kind]);
  const observedOn = beacon.observedAt.slice(0, 10);
  const lines = [
    `To the team at ${company}`,
    '',
    `On ${observedOn} we read the public pages of ${host} and noticed ${findings.length === 1 ? 'one thing' : `${findings.length} things`} you can check yourself in a minute:`,
    '',
    ...findings.flatMap((f, i) => [
      `${i + 1}. ${f.observation}`,
      `   Page: ${f.page}`,
      `   What we saw: "${f.excerpt}"`,
      ...(kind === 'LETTER' && f.possibleConsequence ? [`   Why it may matter (our hypothesis, not a measured loss): ${f.possibleConsequence}`] : []),
      ''
    ]),
    `For the free private report, open ${landingUrl}`,
    `or go to ${enterAt} and enter code ${code}. It asks for the email address to send it to.`,
    'We will only email you about it again if you tick the box that says so.',
    '',
    `To stop hearing from us, email ${stop} with "STOP ${code}" and we will not contact ${company} again.`,
    `This was sent to ${company} as a business, at its published address.`,
    '',
    identity.footer
  ];
  const text = lines.join('\n');

  const findingHtml = findings.map(f => `
      <li>
        <strong>${escapeHtml(f.observation)}</strong>
        <div class="ref">Page: ${escapeHtml(f.page)}</div>
        <div class="seen">What we saw: “${escapeHtml(f.excerpt)}”</div>
        ${kind === 'LETTER' && f.possibleConsequence ? `<div class="why">Why it may matter (our hypothesis, not a measured loss): ${escapeHtml(f.possibleConsequence)}</div>` : ''}
      </li>`).join('');
  const html = `
  <article class="bridge ${kind.toLowerCase()}">
    <p class="to">To the team at ${escapeHtml(company)}</p>
    <p>On ${escapeHtml(observedOn)} we read the public pages of <strong>${escapeHtml(host)}</strong> and noticed ${findings.length === 1 ? 'one thing' : `${findings.length} things`} you can check yourself in a minute:</p>
    <ol>${findingHtml}
    </ol>
    <p class="invite">For the free private report, open <strong>${escapeHtml(landingUrl)}</strong><br>or go to <strong>${escapeHtml(enterAt)}</strong> and enter code <span class="code">${escapeHtml(code)}</span>. It asks for the email address to send it to. We will only email you about it again if you tick the box that says so.</p>
    <p class="stop">To stop hearing from us, email ${escapeHtml(stop)} with “STOP ${escapeHtml(code)}” and we will not contact ${escapeHtml(company)} again. This was sent to ${escapeHtml(company)} as a business, at its published address.</p>
    <p class="from">${escapeHtml(identity.footer)}</p>
  </article>`;

  return {
    ok: true,
    version: BRIDGE_LETTER_VERSION,
    letterId: `ubletter_${sha256([record.invitationId, beacon.beaconId, postalIdentity.identityDigest, kind].join('|')).slice(0, 24)}`,
    invitationId: record.invitationId,
    beaconId: beacon.beaconId,
    format: kind,
    findingCount: findings.length,
    landingUrl,
    text,
    html,
    compiledAt: new Date(now).toISOString(),
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary: 'A printable page. Nothing is printed, posted or handed over by this function; each finding is an observation of a public page at one moment, and its consequence is a hypothesis.'
  };
}

/** One printable HTML document: each letter or card on its own page. */
export function renderBridgeLetterBatch(letters = []) {
  const ready = (Array.isArray(letters) ? letters : []).filter(l => l?.ok === true && l.html);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>UberBond letters</title>
<style>
  body { font: 11pt/1.45 Georgia, "Times New Roman", serif; color: #111; margin: 0; }
  .bridge { padding: 22mm 20mm; page-break-after: always; break-after: page; }
  .bridge.card { padding: 10mm 12mm; font-size: 9.5pt; }
  .bridge ol { padding-left: 1.2em; }
  .bridge li { margin-bottom: .7em; }
  .ref, .seen, .why { font-size: .92em; color: #333; overflow-wrap: anywhere; }
  .code { font: 700 1.2em/1 "Courier New", monospace; letter-spacing: .08em; }
  .stop, .from { font-size: .85em; color: #444; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>${ready.map(l => l.html).join('\n')}
</body>
</html>
`;
}

/**
 * One prospect, from its crawled public pages to a printable page or a stated
 * reason not to print. The caller supplies the crawl and the audit function so
 * this stays free of network access.
 */
export function compileBridgePageFromCrawl({ prospect = {}, crawl, audit, issueInvitation, compileEvidenceBeacon, campaignId, channel, secret, postalIdentity, siteBaseUrl, stopEmail, format, now = new Date() } = {}) {
  if (!crawl?.pages?.length) return { ok: false, version: BRIDGE_LETTER_VERSION, reasonCodes: ['no-readable-public-pages', ...((crawl?.errors || []).map(e => String(e.error || e.status)))] };
  const invitation = issueInvitation({ prospect: { company: prospect.company, website: prospect.website }, campaignId, channel, secret, now });
  if (!invitation.ok) return { ok: false, version: BRIDGE_LETTER_VERSION, reasonCodes: invitation.reasonCodes };
  const beacon = compileEvidenceBeacon({ invitation: invitation.record, website: prospect.website, findings: audit(crawl, prospect), crawledAt: crawl.completedAt || new Date(now).toISOString(), now });
  const letter = compileBridgeLetter({ invitation, beacon, prospect, postalIdentity, siteBaseUrl, stopEmail, format, now });
  return letter.ok ? { ...letter, invitationRecord: invitation.record } : letter;
}
