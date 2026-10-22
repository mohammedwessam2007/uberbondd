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
// This module decides and records. Charging and the charge-reservation store
// are injected, so the same settlement logic runs against a test ledger, an
// Apify pay-per-event Actor, or nothing at all. It never contacts the
// subjects of findings.

import crypto from 'node:crypto';
import { guaranteeSatisfies, SETTLED_STATES } from './charge-reservations.mjs';

export const SELF_VERIFYING_FINDINGS_VERSION = 'uberbond.self-verifying-findings-1.1.0';
export const VERIFICATION_OUTCOMES = Object.freeze(['REPRODUCED', 'NOT_REPRODUCED', 'UNOBSERVABLE']);

const sha256 = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

/**
 * A finding is identified by what it claims, not when it was seen: the same
 * defect observed twice is one finding with two verifications.
 */
export function makeFinding({ subject, subjectKey = subject, code, claimKey, claim, evidence, disproof, verifierId, discoveredAt = null }) {
  for (const [name, value] of Object.entries({ subject, subjectKey, code, claimKey, claim, disproof, verifierId })) {
    if (!nonEmpty(value)) throw new Error(`finding.${name} is required`);
  }
  if (!Array.isArray(evidence) || !evidence.length) throw new Error('finding.evidence must be a non-empty list');
  // subjectKey names the subject canonically (http/https and www variants of
  // one site are one subject), so a finding has one id however it was entered.
  const id = sha256({ subject: subjectKey, code, claimKey, verifierId }).slice(0, 32);
  return { id, subject, code, claimKey, claim, evidence, disproof, verifierId, ...(discoveredAt ? { discoveredAt } : {}) };
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
 * are delivered, and only those can be charged.
 *
 * Order per finding: reserve, deliver, charge, settle. A buyer is never billed
 * for an item that was not delivered, and a key is reserved atomically before
 * any charge so two runs can never both bill the same buyer, finding and day.
 *
 * Each delivered finding carries two separate billing records:
 *   deliveredBilling - what the buyer-facing item says at delivery time:
 *     PENDING_PROVIDER_CONFIRMATION or NOT_CHARGED. It never claims payment,
 *     because delivery happens before the charge.
 *   finalBilling - the outcome: CONFIRMED (provider billed), REFUSED (provider
 *     billed nothing), UNKNOWN (no reliable answer: the reservation is kept so
 *     it is never charged again, and charging stops for the rest of the run),
 *     or NOT_CHARGED.
 *
 * charge(event) -> { status: CONFIRMED|REFUSED|UNKNOWN, limitReached?, reason? }.
 *   A legacy { ok: true|false } reads as CONFIRMED|REFUSED. A throw or any other
 *   shape is UNKNOWN.
 * canCharge() -> true when the buyer's spending limit still allows one more
 *   event. Checked before delivering a chargeable finding; false means the
 *   finding is not delivered (the buyer's limit, not a free gift).
 * reservations: a store from charge-reservations.mjs. Charging needs a store
 *   whose guarantee satisfies requiredGuarantee (cross-run by default);
 *   without one, findings are delivered NOT_CHARGED and nothing is billed.
 * charge = null is a delivery-only run, for work billed outside the platform.
 */
export async function settleFindingsSale({ buyerId, findings, verifier, pricePerVerifiedCents = null, charge = null, canCharge = null, reservations = null, requiredGuarantee = 'ATOMIC_CROSS_RUN', runId = crypto.randomUUID(), deliver = null, now = () => new Date(), maxCharges = Infinity }) {
  if (!nonEmpty(buyerId)) throw new Error('buyerId is required');
  if (charge && (!Number.isSafeInteger(pricePerVerifiedCents) || pricePerVerifiedCents <= 0)) throw new Error('pricePerVerifiedCents must be a positive integer when charging');
  const blockedReason = !charge ? 'DELIVERY_ONLY_RUN'
    : !reservations ? 'NO_CHARGE_RESERVATION_STORE'
    : !guaranteeSatisfies(reservations.guarantee, requiredGuarantee) ? `RESERVATION_GUARANTEE_${reservations.guarantee}_BELOW_${requiredGuarantee}`
    : null;
  const delivered = [];
  const refused = [];
  const charges = [];
  const deliveredUncharged = [];
  const billingUnknown = [];
  const billingOutcomes = [];
  const reservationErrors = [];
  let halted = null;

  const deliverItem = async (finding, verification, deliveredBilling) => {
    const item = { finding, verification, deliveredBilling: Object.freeze({ ...deliveredBilling }) };
    if (deliver) await deliver(Object.freeze({ ...item }));
    return item;
  };
  const record = (item, finalBilling) => {
    item.finalBilling = finalBilling;
    delivered.push(item);
    billingOutcomes.push({ findingId: item.finding.id, deliveredBilling: item.deliveredBilling.status, finalBilling: finalBilling.status, reason: finalBilling.reason ?? null });
  };
  const deliverNotCharged = async (finding, verification, reason) => {
    try {
      record(await deliverItem(finding, verification, { status: 'NOT_CHARGED', reason }), { status: 'NOT_CHARGED', reason });
    } catch (error) {
      refused.push({ findingId: finding.id, outcome: 'REPRODUCED', detail: `DELIVERY_FAILED:${errorText(error)}` });
    }
  };
  const settleReservation = async (findingId, idempotencyKey, state) => {
    try { await reservations.settle(idempotencyKey, state, { runId }); } catch (error) {
      // The row stays PENDING, which still blocks any later charge: safe, but a person must reconcile it.
      reservationErrors.push({ findingId, idempotencyKey, step: `settle:${state}`, detail: errorText(error) });
    }
  };

  for (const finding of findings) {
    const verification = await reverifyFinding(finding, verifier, { now });
    if (verification.outcome !== 'REPRODUCED') { refused.push({ findingId: finding.id, outcome: verification.outcome, detail: verification.detail }); continue; }
    if (blockedReason) { await deliverNotCharged(finding, verification, blockedReason); continue; }
    if (halted && halted !== 'BUYER_SPEND_LIMIT_REACHED') { await deliverNotCharged(finding, verification, `CHARGING_HALTED:${halted}`); continue; }
    if (halted === 'BUYER_SPEND_LIMIT_REACHED' || charges.length >= maxCharges) { halted = 'BUYER_SPEND_LIMIT_REACHED'; refused.push({ findingId: finding.id, outcome: 'REPRODUCED', detail: 'BUYER_SPEND_LIMIT_REACHED' }); continue; }
    if (canCharge) {
      let allowed = false;
      try { allowed = (await canCharge()) === true; } catch { allowed = false; }
      if (!allowed) { halted = 'BUYER_SPEND_LIMIT_REACHED'; refused.push({ findingId: finding.id, outcome: 'REPRODUCED', detail: 'BUYER_SPEND_LIMIT_REACHED' }); continue; }
    }

    const day = verification.verifiedAt.slice(0, 10);
    const idempotencyKey = sha256({ buyerId, findingId: finding.id, day }).slice(0, 40);
    let reservation;
    try { reservation = await reservations.reserve(idempotencyKey, { runId }); } catch (error) {
      halted = 'RESERVATION_STORE_UNAVAILABLE';
      reservationErrors.push({ findingId: finding.id, idempotencyKey, step: 'reserve', detail: errorText(error) });
      await deliverNotCharged(finding, verification, `CHARGING_HALTED:${halted}`);
      continue;
    }
    if (reservation?.acquired !== true) {
      await deliverNotCharged(finding, verification, reservation?.state === 'CONFIRMED' ? 'ALREADY_CHARGED_TODAY' : `CHARGE_RESERVED_ELSEWHERE:${reservation?.state ?? 'UNKNOWN'}`);
      continue;
    }

    let item;
    try { item = await deliverItem(finding, verification, { status: 'PENDING_PROVIDER_CONFIRMATION' }); } catch (error) {
      await settleReservation(finding.id, idempotencyKey, 'REFUSED');
      refused.push({ findingId: finding.id, outcome: 'REPRODUCED', detail: `DELIVERY_FAILED:${errorText(error)}` });
      continue;
    }
    const outcome = await attemptCharge(charge, { eventName: 'verified-finding', idempotencyKey, amountCents: pricePerVerifiedCents, findingId: finding.id, freshEvidenceSha256: verification.freshEvidenceSha256 });
    await settleReservation(finding.id, idempotencyKey, outcome.status);
    if (outcome.status === 'CONFIRMED') {
      charges.push({ idempotencyKey, findingId: finding.id, amountCents: pricePerVerifiedCents, freshEvidenceSha256: verification.freshEvidenceSha256 });
      record(item, { status: 'CONFIRMED', idempotencyKey });
    } else if (outcome.status === 'REFUSED') {
      deliveredUncharged.push({ findingId: finding.id, detail: `CHARGE_NOT_CONFIRMED${outcome.reason ? `:${outcome.reason}` : ''}` });
      record(item, { status: 'REFUSED', reason: outcome.reason });
    } else {
      halted = 'UNKNOWN_CHARGE_OUTCOME';
      billingUnknown.push({ findingId: finding.id, idempotencyKey, detail: outcome.reason });
      record(item, { status: 'UNKNOWN', reason: outcome.reason, idempotencyKey });
    }
    if (outcome.limitReached && !halted) halted = 'BUYER_SPEND_LIMIT_REACHED';
  }

  const finalCount = status => billingOutcomes.filter(entry => entry.finalBilling === status).length;
  const receipt = {
    version: SELF_VERIFYING_FINDINGS_VERSION,
    buyerId: sha256(buyerId).slice(0, 16),
    chargingMode: charge ? 'PAY_PER_EVENT' : 'DELIVERY_ONLY',
    chargingBlockedReason: blockedReason,
    chargingHalted: halted,
    reservationGuarantee: reservations?.guarantee ?? 'NONE',
    requiredGuarantee,
    requested: findings.length,
    delivered: delivered.length,
    charged: charges.length,
    refused: refused.length,
    billing: { confirmed: finalCount('CONFIRMED'), providerRefused: finalCount('REFUSED'), unknown: finalCount('UNKNOWN'), notCharged: finalCount('NOT_CHARGED') },
    deliveredUncharged,
    billingUnknown,
    chargedCents: charges.reduce((sum, item) => sum + item.amountCents, 0),
    charges,
    refusals: refused,
    billingOutcomes,
    reservationErrors,
    rule: 'Only findings re-verified at sale time with fresh evidence are charged, each after it is delivered and only after an atomic reservation of its buyer/finding/day key. Unknown outcomes stay reserved and are never retried.',
    evidenceClass: 'SALE_SETTLEMENT_DECISION',
    revenueTier: 'NONE_UNTIL_PROVIDER_PAYOUT: a charge event is not collected or cleared money'
  };
  return { delivered, receipt: { ...receipt, receiptSha256: sha256(receipt) } };
}

async function attemptCharge(charge, event) {
  let result;
  try { result = await charge(event); } catch (error) {
    return { status: 'UNKNOWN', reason: `CHARGE_CALLBACK_THREW:${errorText(error)}`, limitReached: false };
  }
  const status = SETTLED_STATES.includes(result?.status) ? result.status
    : result?.ok === true ? 'CONFIRMED'
    : result?.ok === false ? 'REFUSED'
    : 'UNKNOWN';
  return { status, reason: result?.reason ?? (status === 'UNKNOWN' ? 'UNRECOGNISED_CHARGE_RESPONSE' : null), limitReached: result?.limitReached === true };
}

const errorText = error => String(error?.message ?? error).slice(0, 160);

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
