// Lawful Channel Router: route every prospect through the cheapest channel
// that is actually permitted for it.
//
// Founder moonshots #790 (The Civilization Monoculture Detector), #107 (The
// Matter Router: route units to whatever process can use them) and #1 (The
// Causal Compiler: minimum chain of interventions to an end state), through
// GENESIS operator "cross-domain translation" (packet routing -> channel
// routing).
//
// Cold email is one channel, usable only when the recipient-eligibility engine
// returned PASSED. When it did not — the recipient's country requires consent,
// the sender's own country regulates electronic marketing, or no transport
// permits cold B2B — the prospect is not dropped: it is routed to a non-email
// first touch that carries a consent-bridge invitation, so any email that
// follows is something the prospect asked for. Every route states why it is
// allowed, held or rejected; nothing here sends, spends or prints anything.
//
// It composes the existing organs rather than restating them: a prospect who
// redeemed an invitation is followed up through consent receipts checked by
// UberAttention at the moment of routing; a supplied UberReach email endpoint
// must be public, terms-compatible, fresh and unsuppressed before cold email is
// allowed; and the cohort concentration cap is the distribution control plane's.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { evaluateConsentBackedAttention } from './consent-receipt.mjs';
import { evaluateReachEndpoint } from './uberreach-universal-transport.mjs';
import { DISTRIBUTION_MAX_MOTION_SHARE } from './distribution-concentration.mjs';

export const LAWFUL_CHANNEL_ROUTER_VERSION = 'uberbond.lawful-channel-router.v1';
export const ROUTE_STATES = Object.freeze(['ALLOW', 'ALLOW_WITH_UNMET_REQUIREMENTS', 'HOLD', 'REJECT']);

// Business-to-business letters addressed to the company (not a named person)
// are outside the electronic-marketing consent rules in these jurisdictions;
// the sender must still identify itself and honour a request to stop. Other
// jurisdictions hold until encoded.
const POSTAL_B2B_ENCODED = new Set(['US', 'GB', 'CA', 'AU']);
// Senders whose electronic-marketing law is the reason cold email holds. For
// them a postal first touch is a distinct legal question: allowed here only
// once the founder records that counsel confirmed it.
const SENDER_POSTAL_ATTESTATION_REQUIRED = new Set(['EG', 'SA', 'AE']);

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const nonNegative = value => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null);
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const route = (channel, state, { reasons = [], requirements = [], unmet = [], costCents = 0, founderMinutes = 0, createsConsent = false } = {}) => ({
  channel, state, reasons, requirements, unmet, costCents, founderMinutes, createsConsent
});

function consentedFollowUpRoute(prospect, ctx) {
  if (!prospect.consentReceipts.length || !prospect.recipientEmail) return route('CONSENTED_EMAIL', 'HOLD', { reasons: ['no-consent-receipt-for-this-prospect'] });
  const decision = evaluateConsentBackedAttention({
    receipts: prospect.consentReceipts,
    recipientEmail: prospect.recipientEmail,
    request: { requestId: `route:${prospect.ref}`, purpose: ctx.followUpPurpose, evidenceRefs: [`prospect:${prospect.ref}`], senderIdentityVerified: ctx.postalIdentityReady },
    now: ctx.now
  });
  if (decision.state !== 'RECIPIENT_PERMIT_MATCHED') return route('CONSENTED_EMAIL', 'HOLD', { reasons: decision.consentReasons.length ? decision.consentReasons : decision.reasons });
  return route('CONSENTED_EMAIL', 'ALLOW', { reasons: [`uberattention:${decision.decisionId}`], requirements: ['WITHIN_CONSENTED_PURPOSE_ONLY'] });
}

function coldEmailRoute(eligibility, prospect, ctx) {
  const endpoint = prospect.reachEndpoints.find(e => String(e?.channel || '').toUpperCase() === 'EMAIL');
  if (endpoint) {
    const checked = evaluateReachEndpoint(endpoint, { now: ctx.now });
    if (checked.reasonCodes.includes('endpoint-suppressed')) return route('COLD_EMAIL', 'REJECT', { reasons: ['uberreach-endpoint-suppressed'] });
    if (!checked.ready) return route('COLD_EMAIL', 'HOLD', { reasons: checked.reasonCodes.map(code => `uberreach:${code}`) });
  }
  if (!eligibility) return route('COLD_EMAIL', 'HOLD', { reasons: ['no-eligibility-decision-for-a-published-address'] });
  const status = eligibility.legal?.status;
  if (status === 'PASSED') return route('COLD_EMAIL', 'ALLOW', { reasons: [eligibility.basis || 'eligibility-passed'] });
  if (status === 'REQUIREMENTS_UNMET') return route('COLD_EMAIL', 'ALLOW_WITH_UNMET_REQUIREMENTS', { requirements: eligibility.requirements || [], unmet: eligibility.requirementsUnmet || [] });
  if (status === 'FAILED') return route('COLD_EMAIL', 'REJECT', { reasons: eligibility.reasonCodes || ['eligibility-rejected'] });
  return route('COLD_EMAIL', 'HOLD', { reasons: eligibility.reasonCodes?.length ? eligibility.reasonCodes : ['eligibility-held'] });
}

function postalRoute(prospect, ctx) {
  const postal = ctx.channels.postal || {};
  const cost = nonNegative(postal.costCentsPerLetter);
  if (postal.authorized !== true) return route('POSTAL_LETTER', 'HOLD', { reasons: ['postal-channel-not-authorized-by-founder'] });
  if (cost === null) return route('POSTAL_LETTER', 'HOLD', { reasons: ['postal-cost-per-letter-required'] });
  if (!prospect.postalAddressRef) return route('POSTAL_LETTER', 'HOLD', { reasons: ['business-postal-address-with-provenance-required'] });
  if (!['CORPORATE', 'GOVERNMENT'].includes(prospect.recipientType)) return route('POSTAL_LETTER', 'HOLD', { reasons: ['letter-must-be-addressed-to-a-business-not-a-person'] });
  if (!POSTAL_B2B_ENCODED.has(prospect.jurisdiction)) return route('POSTAL_LETTER', 'HOLD', { reasons: ['postal-b2b-rule-not-encoded-for-recipient-jurisdiction'] });
  if (ctx.budgetRemainingCents < cost) return route('POSTAL_LETTER', 'HOLD', { reasons: ['postal-budget-exhausted'], costCents: cost });
  const requirements = ['SENDER_IDENTITY_ON_LETTER', 'STOP_REQUESTS_SUPPRESS_PROSPECT'];
  const unmet = [];
  if (ctx.postalIdentityReady !== true) unmet.push('SENDER_IDENTITY_ON_LETTER');
  if (SENDER_POSTAL_ATTESTATION_REQUIRED.has(ctx.senderJurisdiction)) {
    requirements.push('SENDER_JURISDICTION_COUNSEL_ATTESTATION');
    if (!clean(ctx.counselAttestationRef, 500)) unmet.push('SENDER_JURISDICTION_COUNSEL_ATTESTATION');
  }
  return route('POSTAL_LETTER', unmet.length ? 'ALLOW_WITH_UNMET_REQUIREMENTS' : 'ALLOW', { requirements, unmet, costCents: cost, createsConsent: true });
}

function partnerRoute(prospect) {
  if (!clean(prospect.partnerAgreementRef, 500)) return route('PARTNER_INTRODUCTION', 'HOLD', { reasons: ['no-partner-with-an-agreement-covers-this-prospect'] });
  if (!clean(prospect.partnerRelationshipRef, 500)) return route('PARTNER_INTRODUCTION', 'HOLD', { reasons: ['partner-must-attest-its-own-relationship-with-the-prospect'] });
  return route('PARTNER_INTRODUCTION', 'ALLOW', { requirements: ['PARTNER_SENDS_UNDER_ITS_OWN_RELATIONSHIP'], founderMinutes: 5, createsConsent: true });
}

function founderNetworkRoute(prospect) {
  if (!clean(prospect.existingRelationshipRef, 500)) return route('FOUNDER_NETWORK', 'HOLD', { reasons: ['founder-has-no-recorded-existing-relationship'] });
  return route('FOUNDER_NETWORK', 'ALLOW', { requirements: ['PERSONAL_ONE_TO_ONE_MESSAGE_ONLY'], founderMinutes: 10, createsConsent: true });
}

function inPersonRoute(prospect) {
  if (!clean(prospect.inPersonOpportunityRef, 500)) return route('IN_PERSON', 'HOLD', { reasons: ['no-scheduled-in-person-opportunity'] });
  return route('IN_PERSON', 'ALLOW', { founderMinutes: 15, createsConsent: true });
}

/** Every route for one prospect with its legal state and cost, plus the chosen one. */
export function routeProspect({ prospect = {}, eligibility = null, context = {} } = {}) {
  const p = {
    ref: clean(prospect.ref, 128),
    jurisdiction: clean(prospect.jurisdiction, 8).toUpperCase().replace(/^UK$/, 'GB'),
    recipientType: clean(prospect.recipientType, 40).toUpperCase() || 'UNKNOWN',
    postalAddressRef: clean(prospect.postalAddressRef, 500),
    partnerAgreementRef: prospect.partnerAgreementRef,
    partnerRelationshipRef: prospect.partnerRelationshipRef,
    existingRelationshipRef: prospect.existingRelationshipRef,
    inPersonOpportunityRef: prospect.inPersonOpportunityRef,
    recipientEmail: clean(prospect.recipientEmail, 320),
    consentReceipts: Array.isArray(prospect.consentReceipts) ? prospect.consentReceipts : [],
    reachEndpoints: Array.isArray(prospect.reachEndpoints) ? prospect.reachEndpoints : [],
    suppressed: prospect.suppressed === true
  };
  const ctx = {
    senderJurisdiction: clean(context.senderJurisdiction, 8).toUpperCase(),
    postalIdentityReady: context.postalIdentityReady === true,
    counselAttestationRef: context.counselAttestationRef,
    channels: context.channels || {},
    budgetRemainingCents: nonNegative(context.budgetRemainingCents) ?? 0,
    founderMinuteValueCents: nonNegative(context.founderMinuteValueCents) ?? 100,
    followUpPurpose: clean(context.followUpPurpose, 40).toUpperCase() || 'SERVICE_FOLLOW_UP',
    now: context.now ? new Date(context.now) : new Date()
  };
  if (!p.ref) return { ok: false, version: LAWFUL_CHANNEL_ROUTER_VERSION, reasonCodes: ['prospect-reference-required'] };
  if (p.suppressed) {
    return { ok: true, version: LAWFUL_CHANNEL_ROUTER_VERSION, prospectRef: p.ref, selected: null, routes: [route('ANY', 'REJECT', { reasons: ['suppression-dominates-every-channel'] })], state: 'SUPPRESSED', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS) };
  }
  const routes = [
    consentedFollowUpRoute(p, ctx),
    coldEmailRoute(eligibility, p, ctx),
    postalRoute(p, ctx),
    partnerRoute(p),
    founderNetworkRoute(p),
    inPersonRoute(p),
    route('INBOUND_CONTENT', 'ALLOW', { reasons: ['untargeted-public-content-needs-no-permission'], createsConsent: true })
  ];
  const weight = r => r.costCents + r.founderMinutes * ctx.founderMinuteValueCents;
  // A permission the prospect already gave beats every cold route. Otherwise
  // targeted routes beat untargeted content; among targeted routes the cheapest
  // wins, and a route that creates consent wins ties.
  const allowed = routes.filter(r => r.state === 'ALLOW');
  const targeted = allowed.filter(r => r.channel !== 'INBOUND_CONTENT')
    .sort((a, b) => Number(b.channel === 'CONSENTED_EMAIL') - Number(a.channel === 'CONSENTED_EMAIL') || weight(a) - weight(b) || Number(b.createsConsent) - Number(a.createsConsent) || a.channel.localeCompare(b.channel));
  const selected = targeted[0] || allowed.find(r => r.channel === 'INBOUND_CONTENT') || null;
  const nearest = routes.filter(r => r.state === 'ALLOW_WITH_UNMET_REQUIREMENTS');
  return {
    ok: true,
    version: LAWFUL_CHANNEL_ROUTER_VERSION,
    prospectRef: p.ref,
    state: selected?.channel === 'INBOUND_CONTENT' ? 'UNTARGETED_ONLY' : 'ROUTED',
    selected,
    unlockableBy: nearest.map(r => ({ channel: r.channel, unmet: r.unmet })),
    routes,
    sendAuthority: false,
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}

/** Route a whole cohort and report channel concentration (monoculture) and budget use. */
export function routeCohort({ prospects = [], context = {} } = {}) {
  let budget = nonNegative(context.budgetRemainingCents) ?? 0;
  const rows = [];
  for (const entry of Array.isArray(prospects) ? prospects : []) {
    const r = routeProspect({ prospect: entry.prospect, eligibility: entry.eligibility, context: { ...context, budgetRemainingCents: budget } });
    if (r.ok && r.selected) budget -= r.selected.costCents;
    rows.push(r);
  }
  const byChannel = {};
  for (const r of rows) if (r.selected) byChannel[r.selected.channel] = (byChannel[r.selected.channel] || 0) + 1;
  const targeted = Object.entries(byChannel).filter(([c]) => c !== 'INBOUND_CONTENT');
  const targetedTotal = targeted.reduce((s, [, n]) => s + n, 0);
  const maxShare = targetedTotal ? Math.max(...targeted.map(([, n]) => n)) / targetedTotal : 0;
  const unlocks = {};
  for (const r of rows) for (const u of r.unlockableBy || []) for (const req of u.unmet) unlocks[`${u.channel}:${req}`] = (unlocks[`${u.channel}:${req}`] || 0) + 1;
  return {
    ok: true,
    version: LAWFUL_CHANNEL_ROUTER_VERSION,
    total: rows.length,
    routedTargeted: targetedTotal,
    untargetedOnly: rows.filter(r => r.state === 'UNTARGETED_ONLY').length,
    suppressed: rows.filter(r => r.state === 'SUPPRESSED').length,
    byChannel,
    plannedSpendCents: (nonNegative(context.budgetRemainingCents) ?? 0) - budget,
    monoculture: { maxTargetedChannelShare: Math.round(maxShare * 1000) / 1000, capShare: DISTRIBUTION_MAX_MOTION_SHARE, warning: targetedTotal >= 10 && maxShare > DISTRIBUTION_MAX_MOTION_SHARE },
    unlockHistogram: Object.fromEntries(Object.entries(unlocks).sort((a, b) => b[1] - a[1])),
    cohortDigest: sha256(JSON.stringify(rows.map(r => [r.prospectRef, r.selected?.channel || null]))),
    decisions: rows,
    sendAuthority: false,
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary: 'A routing plan over supplied facts. It sends, prints and spends nothing; the chosen channel still needs its own execution authority, and postal/partner rules encoded here are narrower than legal advice.'
  };
}
