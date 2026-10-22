// Self-Verifying Findings: a data product that is re-verified at the moment of sale.
//
// Ordinary data vendors sell rows that were true when collected; the buyer
// absorbs the decay. Here every finding is a falsifiable claim about a public
// subject carrying its own evidence, disproof and a deterministic verifier.
// When a buyer requests findings, each one is re-verified live, and only
// findings that reproduce are delivered and charged. Stale, unreproducible or
// unobservable findings are never charged. The vendor eats the decay, so the
// price tracks current truth, and every charge carries a fresh evidence hash.
//
// Founder ancestry (literal corpus): founder-moonshot-0058 (Error Economy),
// 0146 (Knowledge Packet), 0306 (Proof-of-Value Primitive), 0513 (New Market
// Class Generator: verification creates markets), 0013 (Observability Engine).
//
// This module decides and records. Charging is an injected function, so the
// same settlement logic runs against a test ledger, an Apify pay-per-event
// Actor, or nothing at all. It never contacts the subjects of findings.

import crypto from 'node:crypto';

export const SELF_VERIFYING_FINDINGS_VERSION = 'uberbond.self-verifying-findings-1.0.0';
export const VERIFICATION_OUTCOMES = Object.freeze(['REPRODUCED', 'NOT_REPRODUCED', 'UNOBSERVABLE']);

const sha256 = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

/**
 * A finding is identified by what it claims, not when it was seen: the same
 * defect observed twice is one finding with two verifications.
 */
export function makeFinding({ subject, code, claimKey, claim, evidence, disproof, verifierId }) {
  for (const [name, value] of Object.entries({ subject, code, claimKey, claim, disproof, verifierId })) {
    if (!nonEmpty(value)) throw new Error(`finding.${name} is required`);
  }
  if (!Array.isArray(evidence) || !evidence.length) throw new Error('finding.evidence must be a non-empty list');
  const id = sha256({ subject, code, claimKey, verifierId }).slice(0, 32);
  return { id, subject, code, claimKey, claim, evidence, disproof, verifierId };
}

/**
 * verifier(finding) -> { outcome: REPRODUCED|NOT_REPRODUCED|UNOBSERVABLE, evidence?, cost? }
 * A verifier that throws counts as UNOBSERVABLE: an error is never evidence.
 */
export async function reverifyFinding(finding, verifier, { now = () => new Date() } = {}) {
  let result;
  try { result = await verifier(finding); } catch (error) { result = { outcome: 'UNOBSERVABLE', detail: String(error?.message ?? error).slice(0, 160) }; }
  const outcome = VERIFICATION_OUTCOMES.includes(result?.outcome) ? result.outcome : 'UNOBSERVABLE';
  const freshEvidence = outcome === 'REPRODUCED' ? (Array.isArray(result.evidence) && result.evidence.length ? result.evidence : null) : null;
  // A reproduction without fresh evidence is not a reproduction.
  const finalOutcome = outcome === 'REPRODUCED' && !freshEvidence ? 'UNOBSERVABLE' : outcome;
  return {
    findingId: finding.id,
    outcome: finalOutcome,
    verifiedAt: now().toISOString(),
    freshEvidenceSha256: freshEvidence ? sha256(freshEvidence) : null,
    freshEvidence,
    detail: result?.detail ?? null
  };
}

/**
 * Sell a batch. Each requested finding is re-verified; only REPRODUCED ones
 * are delivered and charged, at most once per buyer per finding per day.
 * charge({ eventName, idempotencyKey, amountCents }) must be idempotent on its key.
 */
export async function settleFindingsSale({ buyerId, findings, verifier, pricePerVerifiedCents, charge, alreadyCharged = new Set(), now = () => new Date(), maxCharges = Infinity }) {
  if (!nonEmpty(buyerId)) throw new Error('buyerId is required');
  if (!Number.isSafeInteger(pricePerVerifiedCents) || pricePerVerifiedCents <= 0) throw new Error('pricePerVerifiedCents must be a positive integer');
  const delivered = [];
  const refused = [];
  const charges = [];
  for (const finding of findings) {
    const verification = await reverifyFinding(finding, verifier, { now });
    if (verification.outcome !== 'REPRODUCED') { refused.push({ findingId: finding.id, outcome: verification.outcome, detail: verification.detail }); continue; }
    const day = verification.verifiedAt.slice(0, 10);
    const idempotencyKey = sha256({ buyerId, findingId: finding.id, day }).slice(0, 40);
    if (alreadyCharged.has(idempotencyKey)) { delivered.push({ finding, verification, charged: false, reason: 'ALREADY_CHARGED_TODAY' }); continue; }
    if (charges.length >= maxCharges) { refused.push({ findingId: finding.id, outcome: 'REPRODUCED', detail: 'BUYER_SPEND_LIMIT_REACHED' }); continue; }
    const receipt = await charge({ eventName: 'verified-finding', idempotencyKey, amountCents: pricePerVerifiedCents, findingId: finding.id, freshEvidenceSha256: verification.freshEvidenceSha256 });
    if (!receipt?.ok) { refused.push({ findingId: finding.id, outcome: 'REPRODUCED', detail: `CHARGE_NOT_CONFIRMED${receipt?.reason ? `:${receipt.reason}` : ''}` }); continue; }
    alreadyCharged.add(idempotencyKey);
    charges.push({ idempotencyKey, findingId: finding.id, amountCents: pricePerVerifiedCents, freshEvidenceSha256: verification.freshEvidenceSha256 });
    delivered.push({ finding, verification, charged: true });
  }
  const receipt = {
    version: SELF_VERIFYING_FINDINGS_VERSION,
    buyerId: sha256(buyerId).slice(0, 16),
    requested: findings.length,
    delivered: delivered.length,
    charged: charges.length,
    refused: refused.length,
    chargedCents: charges.reduce((sum, item) => sum + item.amountCents, 0),
    charges,
    refusals: refused,
    rule: 'Only findings re-verified at sale time with fresh evidence are charged; never twice per buyer, finding and day.',
    evidenceClass: 'SALE_SETTLEMENT_DECISION',
    revenueTier: 'NONE_UNTIL_PROVIDER_PAYOUT: a charge event is not collected or cleared money'
  };
  return { delivered, receipt: { ...receipt, receiptSha256: sha256(receipt) } };
}

/**
 * Decay curve: of findings first seen at age 0, what fraction still
 * reproduces after k days. This is the descendant data product: how fast each
 * defect class gets fixed is information nobody else is measuring.
 * observations: [{ findingId, code, firstSeen, verifiedAt, outcome }]
 */
export function defectSurvival(observations, { bucketsDays = [0, 7, 30, 90] } = {}) {
  const byCode = {};
  for (const item of observations) {
    if (item.outcome === 'UNOBSERVABLE') continue;
    const age = Math.floor((Date.parse(item.verifiedAt) - Date.parse(item.firstSeen)) / 86_400_000);
    const bucket = [...bucketsDays].reverse().find(days => age >= days);
    if (bucket === undefined) continue;
    const row = (byCode[item.code] ??= Object.fromEntries(bucketsDays.map(days => [days, { checked: 0, reproduced: 0 }])));
    row[bucket].checked += 1;
    if (item.outcome === 'REPRODUCED') row[bucket].reproduced += 1;
  }
  return Object.fromEntries(Object.entries(byCode).map(([code, row]) => [code, Object.fromEntries(Object.entries(row).map(([days, cell]) => [days, { ...cell, survival: cell.checked ? cell.reproduced / cell.checked : null }]))]));
}
