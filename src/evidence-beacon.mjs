// Evidence Beacon: the pitch is the prospect's own verifiable evidence.
//
// Founder moonshots #306 (The Proof-of-Value Primitive), #67 (The Trust
// Compiler) and #146 (The Knowledge Packet), through GENESIS operator
// "adversarial search". UberBond has no case studies or customers yet, so a
// generic claim is not credible. What it can show truthfully is what its own
// read-only audit observed on the prospect's public pages, each item with the
// page, the excerpt and the time, so the prospect can check it in a minute.
//
// The packet is private to the holder of a consent-bridge invitation. It keeps
// only findings observed on the prospect's own domain, recently, with an
// excerpt and enough confidence; it never adds revenue-loss figures. When
// nothing qualifies the answer is NO_QUALIFYING_FINDINGS and the prospect
// should not be invited: sender reputation and the founder's budget are not
// spent on a first touch with nothing real to show.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const EVIDENCE_BEACON_VERSION = 'uberbond.evidence-beacon.v1';
export const BEACON_MIN_CONFIDENCE = 0.72;
export const BEACON_MAX_AGE_DAYS = 30;
export const BEACON_MAX_FINDINGS = 5;

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
function hostOf(value) {
  try { return new URL(String(value)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
const sameSite = (url, host) => { const h = hostOf(url); return Boolean(h) && (h === host || h.endsWith(`.${host}`)); };

export function compileEvidenceBeacon({ invitation, website, findings = [], crawledAt, now = new Date() } = {}) {
  const host = hostOf(website);
  const crawled = Date.parse(crawledAt);
  const at = new Date(now).getTime();
  const reasons = [];
  if (invitation?.version !== 'uberbond.consent-bridge.v1' || !invitation?.invitationId) reasons.push('consent-bridge-invitation-required');
  if (!host) reasons.push('prospect-public-website-required');
  if (!Number.isFinite(crawled)) reasons.push('crawl-time-required');
  else if (crawled > at + 60000) reasons.push('crawl-time-in-future');
  else if ((at - crawled) / 86400000 > BEACON_MAX_AGE_DAYS) reasons.push('crawl-older-than-30-days-rerun-audit');
  if (reasons.length) return { ok: false, version: EVIDENCE_BEACON_VERSION, reasonCodes: reasons, externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS) };

  const excluded = {};
  const note = code => { excluded[code] = (excluded[code] || 0) + 1; };
  const qualifying = [];
  for (const f of Array.isArray(findings) ? findings : []) {
    if (!sameSite(f?.evidenceUrl, host)) { note('evidence-not-on-prospect-domain'); continue; }
    if (!clean(f?.evidenceExcerpt, 320)) { note('no-observed-excerpt'); continue; }
    if (f?.safeForOutreach === false) { note('marked-unsafe-for-outreach'); continue; }
    if (!(Number(f?.confidence) >= BEACON_MIN_CONFIDENCE)) { note('confidence-below-threshold'); continue; }
    qualifying.push(f);
  }
  qualifying.sort((a, b) => Number(b.severity) * Number(b.confidence) - Number(a.severity) * Number(a.confidence) || String(a.code).localeCompare(String(b.code)));
  const observedAt = new Date(crawled).toISOString();
  const items = qualifying.slice(0, BEACON_MAX_FINDINGS).map(f => ({
    code: clean(f.code, 80),
    observation: clean(f.title, 200),
    page: clean(f.evidenceUrl, 1000),
    excerpt: clean(f.evidenceExcerpt, 320),
    observedAt,
    possibleConsequence: clean(f.implication, 400) || null,
    howToCheck: `Open ${clean(f.evidenceUrl, 1000)} and look for: ${clean(f.evidenceExcerpt, 160)}`,
    severity: Number(f.severity),
    confidence: Number(f.confidence)
  }));
  const status = items.length ? 'EVIDENCE_BEACON_READY' : 'NO_QUALIFYING_FINDINGS';
  const core = { invitationId: invitation.invitationId, domain: host, observedAt, items: items.map(i => [i.code, i.page, sha256(i.excerpt)]) };
  return {
    ok: true,
    version: EVIDENCE_BEACON_VERSION,
    status,
    inviteRecommended: items.length > 0,
    beaconId: `ubbeacon_${sha256(JSON.stringify(core)).slice(0, 24)}`,
    invitationId: invitation.invitationId,
    domain: host,
    observedAt,
    findings: items,
    excludedCounts: excluded,
    proofOfValue: {
      observableFindings: items.length,
      highestSeverity: items.length ? Math.max(...items.map(i => i.severity)) : 0,
      claimType: 'OBSERVED_ON_YOUR_PUBLIC_PAGES__NO_REVENUE_IMPACT_CLAIMED'
    },
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary: 'Read-only observations of public pages at one moment. Each item names the page and excerpt so the recipient can verify it. Possible consequences are hypotheses, not measured losses, and nothing here proves that fixing an item changes revenue.'
  };
}
