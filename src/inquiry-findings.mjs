// Bridge from the Inquiry Path Coherence Engine to Self-Verifying Findings.
//
// Only findings the engine allows to be stated as observed fact become
// sellable findings; questions (ASK_DONT_ASSERT) are never sold. Each gets a
// claim key that names the defect itself (the dialled pair, the discarded
// schema types, the dead host), so a later independent probe can say whether
// that same defect still exists rather than whether "something" is wrong.
// The verifier re-probes the subject site from scratch at sale time: the
// discovery observation and the sale observation are separate witnesses.

import crypto from 'node:crypto';
import { makeFinding, settleFindingsSale } from './self-verifying-findings.mjs';

export const INQUIRY_FINDINGS_VERSION = 'uberbond.inquiry-findings-1.0.0';
const VERIFIER_ID = 'inquiry-path-coherence/reprobe-v1';

/** Stable identity of a defect, independent of wording and observation time. */
export function claimKeyOf(finding) {
  const digits = String(finding.title ?? '').match(/\(\d{3}\) \d{3}-\d{4}/g) ?? [];
  switch (finding.code) {
    case 'TEL_LABEL_DIALS_DIFFERENT_NUMBER': return `tel:${digits.slice(0, 2).join('>')}`;
    case 'MACHINE_READABLE_PHONE_DIVERGES': return `schema-phone:${digits.join(',')}`;
    case 'STRUCTURED_DATA_UNPARSEABLE': return `jsonld:${finding.evidence?.[0]?.url ?? ''}:${String(finding.title ?? '').replace(/^.*declaring this business as /, '').replace(/ is invalid JSON.*$/, '')}`;
    case 'FORM_SUBMITS_TO_NONEXISTENT_HOST': return `form-host:${(String(finding.title).match(/to (\S+), a hostname/) ?? [])[1] ?? ''}`;
    case 'TEL_LINK_MALFORMED': return `tel-malformed:${finding.evidence.map(entry => entry.excerpt.split(' ')[0]).sort().join('|')}`;
    default: return `${finding.code}:${crypto.createHash('sha256').update(String(finding.title)).digest('hex').slice(0, 16)}`;
  }
}

/** One site however it was typed: protocol, www and a trailing slash do not matter. */
export function canonicalSiteKey(website) {
  const url = new URL(website);
  return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`;
}

/** Convert one probe receipt into sellable findings (assertable ones only). */
export function sellableFindingsFromProbe(receipt) {
  const subject = receipt.website;
  const subjectKey = canonicalSiteKey(subject);
  return (receipt.analysis?.findings ?? [])
    .filter(finding => finding.firstTouchUse === 'MAY_STATE_AS_OBSERVED_FACT')
    .map(finding => makeFinding({
      subject,
      subjectKey,
      code: finding.code,
      claimKey: claimKeyOf(finding),
      claim: finding.title,
      evidence: finding.evidence,
      disproof: finding.thirtySecondDisproof,
      verifierId: VERIFIER_ID,
      discoveredAt: receipt.observedAt
    }));
}

/**
 * Verifier: probe the subject again and report whether the same claim key is
 * still an assertable finding. probe(website) -> probe receipt.
 */
export function inquiryReprobeVerifier({ probe }) {
  const cache = new Map();
  return async finding => {
    if (!cache.has(finding.subject)) cache.set(finding.subject, probe(finding.subject));
    const receipt = await cache.get(finding.subject);
    if (receipt.analysis?.verdict === 'NOT_OBSERVABLE_FROM_STATIC_HTML') return { outcome: 'UNOBSERVABLE', detail: 'subject not observable at sale time' };
    const match = (receipt.analysis?.findings ?? []).find(item => item.firstTouchUse === 'MAY_STATE_AS_OBSERVED_FACT' && item.code === finding.code && claimKeyOf(item) === finding.claimKey);
    return match ? { outcome: 'REPRODUCED', evidence: match.evidence } : { outcome: 'NOT_REPRODUCED', detail: 'defect not present in the sale-time observation' };
  };
}

/**
 * One buyer run: discover findings on each website, re-verify each with an
 * independent sale-time probe, deliver and charge only what reproduces.
 * Each item is reserved, delivered, then charged (see settleFindingsSale).
 * charge, canCharge, reservations and pushItem are injected (an Apify billing
 * adapter, a SQL reservation store and Actor.pushData, or test fakes).
 * Without charge the run is delivery-only. Without a cross-run reservation
 * store nothing is charged.
 */
export async function runVerifiedDefectsSale({ buyerId, websites, probe, verifyProbe = probe, charge = null, canCharge = null, reservations = null, requiredGuarantee = 'ATOMIC_CROSS_RUN', runId, pushItem, pricePerVerifiedCents = null, maxCharges = Infinity, now = () => new Date() }) {
  const sites = [];
  const seen = new Set();
  for (const website of websites) {
    let key;
    try { key = canonicalSiteKey(website); } catch { continue; }
    if (!seen.has(key)) { seen.add(key); sites.push(website); }
  }
  const discovered = [];
  const notObservable = [];
  for (const website of sites) {
    const receipt = await probe(website);
    if (receipt.analysis?.verdict === 'NOT_OBSERVABLE_FROM_STATIC_HTML') notObservable.push(website);
    discovered.push(...sellableFindingsFromProbe(receipt));
  }
  const deliver = item => pushItem({
    website: item.finding.subject,
    defect: item.finding.code,
    claim: item.finding.claim,
    disproveIn30Seconds: item.finding.disproof,
    evidence: item.verification.freshEvidence,
    verifiedAt: item.verification.verifiedAt,
    discoveredAt: item.finding.discoveredAt ?? null,
    freshEvidenceSha256: item.verification.freshEvidenceSha256,
    // Known at delivery time only: pending or not charged. The confirmed,
    // refused or unknown outcome is in the run's sale receipt, never here.
    billing: item.deliveredBilling
  });
  const { receipt } = await settleFindingsSale({ buyerId, findings: discovered, verifier: inquiryReprobeVerifier({ probe: verifyProbe }), pricePerVerifiedCents, charge, canCharge, reservations, requiredGuarantee, ...(runId ? { runId } : {}), deliver, maxCharges, now });
  return { ...receipt, websites: sites.length, duplicateSitesIgnored: websites.length - sites.length, discovered: discovered.length, notObservable, discoveredFindings: discovered };
}
