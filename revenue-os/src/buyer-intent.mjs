// 24/7 Continuous Revenue Core, section 4: Buyer-Intent Engine.
//
// Disclosed blocker: UBERBOND_LIVE_BUYER_INTENT_STRIKE_PACK, named in the mission as an "uploaded"
// input, was never actually provided to this session (checked the upload directory and every prior
// scratchpad extraction; see the mission's final report for the full disclosure). This module
// therefore implements the engine's *capability* generically and is proven against representative,
// clearly-synthetic `.invalid`-domain fixtures in its tests -- consistent with the mission's own
// explicit instruction: "Do not hard-code 97 Switch, MechaniCool, or any previous candidate."
//
// This is an orchestration layer over already-existing, already-tested primitives -- it does not
// re-implement any of them:
//   - ingest             -> importer.mjs#prepareImportBatch / importBatch
//   - domain identity     -> utils.mjs#isValidDomain / normalizeDomain
//   - lawful channel       -> importer.mjs#ALLOWED_CHANNELS (medium) fused with
//                            channel-safety.mjs#preflightChannelSafety (purpose) -- both gates must
//                            pass independently; a published_contact_form (allowed medium) pointed
//                            at a careers inbox (denied purpose) is still rejected
//   - suppress prohibited
//     routes               -> store.mjs's existing 'suppressions' collection, the same
//                            organizationDomain check already used by outbound.mjs and reply.mjs
// The only genuinely new logic added here is (a) revalidating already-imported opportunities and
// expiring the ones that no longer pass, and (b) ranking by expected contribution margin and owner
// minutes -- a different question from scoring.mjs's qualification score ("how good a fit is this")
// and deliberately not merged into it.
import { preflightChannelSafety, assertEvidenceFreshness } from './channel-safety.mjs';
import { ALLOWED_CHANNELS, prepareImportBatch, importBatch } from './importer.mjs';
import { isValidDomain, normalizeDomain, clamp } from './utils.mjs';
import { SERVICE_CATALOG } from './config.mjs';

export class BuyerIntentError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'BuyerIntentError';
    this.code = code;
  }
}

// ---- ingest: purpose + medium screening ahead of the shared importer core ----

/** Screens one raw candidate signal for lawful-channel purpose before it is ever handed to
 * importer.mjs's own medium/domain/timestamp checks. `raw.purposeLabel` is this module's own
 * required field (importer.mjs's record shape has no equivalent) -- a record with no purpose label
 * at all fails closed via channel-safety.mjs's own malformed-purpose-label reason, it is never
 * treated as "not applicable, so allow it." */
export function screenSignalForIngest(raw) {
  const reasons = [];
  const channel = String(raw?.channel || '').trim();
  if (!ALLOWED_CHANNELS.includes(channel)) reasons.push('unsupported-channel-medium');
  const preflight = preflightChannelSafety({ purposeLabel: raw?.purposeLabel, capturedAt: raw?.capturedAt });
  if (!preflight.ok) reasons.push(...preflight.reasons.map(r => `preflight:${r}`));
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, classification: preflight.classification };
}

/**
 * Purpose-screens every raw record, then hands the survivors to importer.mjs#prepareImportBatch
 * for its own (independent) medium/domain/timestamp/confidence/dedupe checks. A record can be
 * quarantined by either layer; both quarantine reasons are reported in the same shape
 * ({raw, reasons}) so a caller never has to know which layer rejected a given record.
 */
export function prepareBuyerIntentBatch(rawRecords = [], options = {}) {
  const screened = []; const blocked = [];
  for (const raw of rawRecords) {
    const screen = screenSignalForIngest(raw);
    if (!screen.ok) { blocked.push({ raw, reasons: screen.reasons }); continue; }
    screened.push(raw);
  }
  const prepared = prepareImportBatch(screened, options);
  return { ...prepared, quarantined: [...blocked, ...prepared.quarantined] };
}

/** End-to-end ingest: prepare (pure, no I/O) then persist via importer.mjs#importBatch. Exposed as
 * one call for the scheduler's "ingest new public demand signals" fallback task; the two-stage
 * split above remains independently testable without a store. */
export async function ingestBuyerIntentSignals(store, rawRecords = [], options = {}) {
  const prepared = prepareBuyerIntentBatch(rawRecords, options);
  const result = await importBatch(store, prepared);
  return { ...result, quarantined: prepared.quarantined.length, quarantineDetail: prepared.quarantined };
}

// ---- revalidate / expire already-imported opportunities ----

/** Re-checks a signal's domain identity, channel medium, and evidence freshness against the same
 * rules ingest applied -- but not channel *purpose*, which is a property of the page observed at
 * capture time, not something that changes on revalidation. Freshness is intentionally re-derived
 * here from the opportunity's own freshest evidence, not trusted from import time, so an
 * opportunity that simply ages past the freshness window is caught even though nothing about it
 * changed. */
export function revalidateSignal({ organizationDomain, channel, capturedAt } = {}, { freshnessOptions = {} } = {}) {
  const reasons = [];
  if (!isValidDomain(normalizeDomain(organizationDomain || ''))) reasons.push('invalid-or-missing-domain');
  if (!ALLOWED_CHANNELS.includes(String(channel || '').trim())) reasons.push('unsupported-channel-medium');
  const freshness = assertEvidenceFreshness(capturedAt, freshnessOptions);
  if (!freshness.ok) reasons.push(freshness.reason);
  if (reasons.length) return { valid: false, reasons };
  return { valid: true };
}

const TERMINAL_STATUSES = Object.freeze(['expired', 'converted', 'suppressed', 'rejected']);

/**
 * Revalidates every non-terminal opportunity against its own freshest evidence item and expires
 * (patches status -> 'expired', records the reason) any that no longer pass. Never deletes a
 * record -- expiry is a status transition with a reason, matching approval.mjs's own
 * expire-in-place convention, so the opportunity remains inspectable/auditable afterward.
 */
export async function revalidateAndExpireOpportunities(store, { now = Date.now() } = {}) {
  const opportunities = await store.list('opportunities');
  const evidenceItems = await store.list('evidenceItems');
  const results = [];
  let expired = 0, revalidated = 0;

  for (const opp of opportunities) {
    if (TERMINAL_STATUSES.includes(opp.status)) continue;
    const ownEvidence = evidenceItems.filter(e => e.opportunityId === opp.id);
    const freshest = ownEvidence.reduce((best, item) => {
      const t = Date.parse(item.capturedAt);
      return Number.isFinite(t) && (!best || t > Date.parse(best.capturedAt)) ? item : best;
    }, null);

    if (!freshest) {
      await store.patch('opportunities', opp.id, { status: 'expired', data: { ...opp.data, expiryReasons: ['no-evidence'] } });
      results.push({ id: opp.id, action: 'expired', reasons: ['no-evidence'] });
      expired += 1;
      continue;
    }

    const check = revalidateSignal(
      { organizationDomain: opp.organizationDomain, channel: opp.channel, capturedAt: freshest.capturedAt },
      { freshnessOptions: { now } }
    );
    if (!check.valid) {
      await store.patch('opportunities', opp.id, { status: 'expired', data: { ...opp.data, expiryReasons: check.reasons } });
      results.push({ id: opp.id, action: 'expired', reasons: check.reasons });
      expired += 1;
    } else {
      results.push({ id: opp.id, action: 'revalidated' });
      revalidated += 1;
    }
  }

  await store.log('buyer_intent_revalidation', { expired, revalidated, total: opportunities.length });
  return { expired, revalidated, total: opportunities.length, results };
}

// ---- suppress prohibited routes ----
// Reuses the exact collection and organizationDomain-match convention outbound.mjs and reply.mjs
// already enforce at send time -- this module adds no second suppression list, it only reads/writes
// the one that already gates sending, so a route suppressed for any reason (complaint, bounce,
// owner decision, or a prohibited-route determination made here) is honored everywhere.

export async function isRouteSuppressed(store, organizationDomain) {
  const suppressions = await store.list('suppressions');
  return suppressions.some(item => item.data?.organizationDomain === organizationDomain);
}

export async function suppressRoute(store, organizationDomain, reason = 'prohibited-route') {
  if (!organizationDomain) throw new BuyerIntentError('missing-organization-domain');
  if (await isRouteSuppressed(store, organizationDomain)) return { added: false };
  await store.add('suppressions', { reason, data: { organizationDomain } });
  return { added: true };
}

/**
 * Selects opportunities eligible for further work: non-terminal status, structurally valid domain
 * and channel medium, and not on the suppression list. This is the single gate the ranking step
 * below (and, later, the distribution engine) should read from rather than `opportunities` directly
 * -- it is where "verify company/domain identity" and "suppress prohibited routes" are actually
 * enforced as a selection filter, not just as an ingest-time check.
 */
export async function selectWorkableOpportunities(store) {
  const [opportunities, suppressions] = await Promise.all([store.list('opportunities'), store.list('suppressions')]);
  const suppressedDomains = new Set(suppressions.map(s => s.data?.organizationDomain).filter(Boolean));
  return opportunities.filter(opp => {
    if (TERMINAL_STATUSES.includes(opp.status)) return false;
    if (suppressedDomains.has(opp.organizationDomain)) return false;
    if (!isValidDomain(normalizeDomain(opp.organizationDomain || ''))) return false;
    if (!ALLOWED_CHANNELS.includes(opp.channel)) return false;
    return true;
  });
}

// ---- rank by expected contribution margin and owner minutes ----
// Deliberately separate from scoring.mjs#rankOpportunities: that module answers "how good a fit is
// this opportunity" (a 0-100 weighted-sum score across qualitative factors). This answers "how much
// money, per minute of scarce owner time, do we expect this opportunity to be worth" -- a
// capital-allocation question, not a fit question. Both may be applied to the same opportunity list;
// neither substitutes for the other.

/**
 * `paymentProbability` (0-1) and `fulfillmentCostCents`/`ownerMinutes` are estimates the caller
 * supplies (e.g. from scoring.mjs's own paymentReadiness component, or from historical fulfillment
 * data once section 9's tracking exists) -- this function does no estimation of its own, it only
 * turns already-estimated inputs into one comparable expected-value-per-owner-minute number.
 */
export function estimateExpectedContribution({ offerKey, paymentProbability = 0, fulfillmentCostCents = 0, ownerMinutes = 1 } = {}) {
  const service = SERVICE_CATALOG[offerKey];
  if (!service) throw new BuyerIntentError('unknown-offer-key', String(offerKey));
  const priceCents = Number.isInteger(service.priceCents)
    ? service.priceCents
    : Math.round(((service.priceCentsMin || 0) + (service.priceCentsMax || 0)) / 2);
  const cost = Number.isFinite(fulfillmentCostCents) ? Math.max(0, fulfillmentCostCents) : 0;
  const contributionMarginCents = priceCents - cost;
  const contributionMarginRate = priceCents > 0 ? contributionMarginCents / priceCents : 0;
  const probability = clamp(paymentProbability, 0, 1);
  const expectedContributionCents = contributionMarginCents * probability;
  const minutes = Math.max(1, Number(ownerMinutes) || 1);
  const expectedContributionCentsPerOwnerMinute = expectedContributionCents / minutes;
  return {
    offerKey, priceCents, contributionMarginCents, contributionMarginRate,
    paymentProbability: probability, ownerMinutes: minutes,
    expectedContributionCents, expectedContributionCentsPerOwnerMinute
  };
}

/**
 * Ranks `candidates` (each `{opportunity, offerKey, paymentProbability, fulfillmentCostCents,
 * ownerMinutes}`) by expected contribution cents per owner minute, descending. A candidate
 * referencing an offer that does not exist in SERVICE_CATALOG throws rather than being silently
 * dropped or scored zero -- an unknown offer key is a caller bug, not a low-value opportunity.
 */
export function rankByExpectedContribution(candidates = []) {
  return candidates
    .map(candidate => ({ opportunity: candidate.opportunity, value: estimateExpectedContribution(candidate) }))
    .sort((a, b) => b.value.expectedContributionCentsPerOwnerMinute - a.value.expectedContributionCentsPerOwnerMinute);
}
