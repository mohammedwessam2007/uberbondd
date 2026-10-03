// PROSPECT_PREFLIGHT: one generic, zero-authority operation.
//
//   candidate evidence record
//     -> exact production contact-history read (suppressions, prospects,
//        outbound reservations/events, replies, messages, provider events)
//     -> deterministic prospect verification (negative signals, ownership,
//        publication provenance, notices, offer route)
//     -> bounded read-only public company-registry lookup where the recipient
//        jurisdiction needs legal-form evidence (zero cost; fails closed)
//     -> GLOBAL_GREEN_LANE_ROUTER: jurisdiction, legal form, inbox typing,
//        invitation, contact-source binding, fresh policy evidence, route
//        class and route tournament. GREEN is never send authority.
//     -> cold-route evidence envelope check for US routes (the inert cold-v1
//        module, now reachable, never self-authorizing)
//     -> prework + V5 message tournament (UberReply machinery)
//     -> fleet sender allocation (existing allocator; quarantined/paused never)
//     -> effect-package compile (no final digest while any fact is placeholder;
//        the green route is bound into the digest)
//     -> ONE typed terminal state with exact blocker codes.
//
// It reads the store (list only), writes nothing, calls no provider, contacts
// no one, and returns sendAuthority:false for every state including
// READY_FOR_AUTHORIZATION. The only outbound traffic it can cause is a bounded
// GET to an official public company registry (externalReads), never an effect. Approval, dispatch and reconciliation stay with the
// existing governed path.
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContactHistory, RESULT_STATUS as CONTACT_STATUS } from './prospect-contact-history.mjs';
import { compileProspectVerification, PROSPECT_STATUSES } from './prospect-verification-intake.mjs';
import { runProspectMessageTournament } from './prospect-message-tournament.mjs';
import { compileEffectPackage, EFFECT_PACKAGE_STATES } from './prospect-effect-package.mjs';
import { createColdRouteEvidence, verifyColdRouteEnvelope, SENDER_SIDE_HOLD_CLASSIFICATION } from './outreach-cold-route-policy.mjs';
import { selectFleetMailbox } from './uberfleet.mjs';
import { routeGlobalGreenLane, ROUTE_STATES, ROUTE_CLASSES } from './global-green-lane-router.mjs';
import { resolveCompanyViaRegistry } from './company-registry-adapter.mjs';
import { compileGreenLaneActivationTruth } from './green-lane-activation-truth.mjs';
import { createPolicyEvidenceRegistry } from './global-policy-evidence.mjs';
import { httpsHostOf } from './host-family.mjs';

export const PROSPECT_PREFLIGHT_VERSION = 'uberbond.prospect-preflight.v1';

export const PREFLIGHT_STATES = Object.freeze({
  READY_FOR_AUTHORIZATION: 'READY_FOR_AUTHORIZATION',
  // Everything verifiable without a prospect record is final. Only facts the
  // existing draft step creates per prospect (signed unsubscribe URLs) remain.
  READY_PENDING_DRAFT_TIME_FACTS: 'READY_PENDING_DRAFT_TIME_FACTS',
  DO_NOT_SEND: 'DO_NOT_SEND',
  BLOCKED_EXTERNAL_FACT: 'BLOCKED_EXTERNAL_FACT',
  BLOCKED_IDENTITY: 'BLOCKED_IDENTITY',
  BLOCKED_LEGAL_AUTHORITY: 'BLOCKED_LEGAL_AUTHORITY',
  BLOCKED_SENDER_HEALTH: 'BLOCKED_SENDER_HEALTH',
  BLOCKED_CONTACT_HISTORY: 'BLOCKED_CONTACT_HISTORY',
  // The global route is not green (conditional, consent required, or an unknown
  // that failed closed), or its policy evidence is missing/stale.
  BLOCKED_ROUTE: 'BLOCKED_ROUTE',
  BLOCKED_POLICY_REFRESH: 'BLOCKED_POLICY_REFRESH'
});

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Only repository-relative paths under artifacts/ can prove an artifact exists. */
export function repositoryArtifactExists(ref) {
  const value = String(ref || '').trim();
  if (!value || value.includes('\0') || /^[a-z]+:/i.test(value) || value.startsWith('/') || value.includes('..')) return false;
  const full = resolve(repoRoot, value);
  if (!full.startsWith(`${repoRoot}${sep}artifacts${sep}`)) return false;
  return existsSync(full);
}

const dedupe = list => [...new Set(list)];

async function readSenderAllocation({ store, recipientEmail, provider, now }) {
  try {
    const [accounts, senderHealth, outboundEvents] = await Promise.all([store.list('accounts'), store.list('senderHealth'), store.list('outboundEvents')]);
    const allocation = selectFleetMailbox({ prospectId: recipientEmail, accounts, senderHealth, outboundEvents, provider, date: now });
    return allocation.ok
      ? { ok: true, slot: allocation.slot, provider, quarantined: false, accountId: allocation.accountId || null, source: 'selectFleetMailbox' }
      : { ok: false, reasonCodes: allocation.reasonCodes || [allocation.status || 'no-eligible-mailbox'], source: 'selectFleetMailbox' };
  } catch (error) {
    return { ok: false, reasonCodes: [`sender-allocation-read-failed:${String(error?.code || error?.name || 'error').slice(0, 40)}`], source: 'selectFleetMailbox' };
  }
}

const iso2 = value => {
  const v = String(value ?? '').trim().toUpperCase();
  return v === 'UK' ? 'GB' : /^[A-Z]{2}$/.test(v) ? v : '';
};

// Offer id -> the router's offer family (only used to scope invitation fit).
const OFFER_FAMILY = Object.freeze({
  LEAD_TO_BOOKING_LEAK_AUDIT: 'AGENCY_REVENUE', CLIENT_ROI_PROOF_SPRINT: 'AGENCY_REVENUE', BILINGUAL_BOOKING_LEAK_AUDIT: 'AGENCY_REVENUE', AI_AGENT_RELEASE_GATE: 'AI'
});

function summarizeRoute(decision) {
  return {
    state: decision.state, routeClass: decision.routeClass, provisionalRouteClass: decision.provisionalRouteClass, green: decision.green,
    routeDigest: decision.routeDigest, jurisdiction: decision.jurisdiction.jurisdiction,
    selected: decision.selected ? { channel: decision.selected.channel, routeClass: decision.selected.routeClass, fitness: decision.selected.fitnessScore?.fitness ?? null, executable: decision.selected.executable } : null,
    fallbacks: decision.fallbacks,
    legalForm: { status: decision.legalForm.status, recipientType: decision.legalForm.recipientType, entity: decision.legalForm.entity, evidenceDigest: decision.legalForm.evidenceDigest },
    inbox: { addressClass: decision.inbox.addressClass, privacyClass: decision.inbox.privacyClass },
    invitation: { classification: decision.invitation.classification, strength: decision.invitation.invitationStrength, evidenceDigest: decision.invitation.evidenceDigest },
    contactSource: { status: decision.contactSource.status, hardRejects: decision.contactSource.hardRejects, missing: decision.contactSource.missing, bindingDigest: decision.contactSource.bindingDigest },
    policy: { state: decision.policyEvidence.state, requiredRules: decision.policyEvidence.requiredRules, evidenceDigest: decision.policyEvidence.evidenceDigest, refreshRequired: decision.policyRefreshRequired },
    eligibility: decision.eligibility,
    senderSide: decision.senderSide,
    governanceGate: decision.governanceGate,
    sendPrerequisites: decision.sendPrerequisites,
    blockers: decision.blockers
  };
}

/**
 * @param {object} input
 * @param {object} input.store    read-only store (list only is called)
 * @param {object} input.record   candidate evidence record (see prospect-verification-intake). Optional global
 *   fields: record.legalEntity { legalName, companyNumber, formText }, record.recipient.jurisdiction /
 *   .namedPersonEvidence / .pageContext, record.invitationEvidence[], record.intakeChannels[].
 * @param {object} input.slots    grounded message slots from the evidence lane
 * @param {string} input.artifactRef repository-relative artifacts/ path of the prepared artifact
 * @param {object} [input.identity] { legalBusinessSenderName, authorizedPublicPostalAddress, footerUseAuthorized }
 * @param {object} [input.senderSide] sender-side legal resolution
 * @param {object} [input.unsubscribe] runtime-created signed unsubscribe URLs
 * @param {object} [input.campaign]
 * @param {object} [input.policyRegistry] fresh-evidence registry (src/global-policy-evidence.mjs). Absent = empty =
 *   every permissive route reports POLICY_REFRESH_REQUIRED.
 * @param {object} [input.registryAdapters] public company-registry adapters (src/company-registry-adapter.mjs)
 * @param {object} [input.globalRoute] extras for the router { objective, economics, routeCosts, lawfulChannels }
 */
export async function runProspectPreflight({
  store, record, slots, artifactRef = '', identity = {}, senderSide = {}, unsubscribe = {}, campaign = {},
  provider = 'smtp-relay', now = new Date(), artifactExists = repositoryArtifactExists,
  policyRegistry = null, registryAdapters = null, globalRoute = {}
} = {}) {
  const evaluatedAt = new Date(now).toISOString();
  const registryLookups = [];
  const out = (state, extra = {}) => ({
    version: PROSPECT_PREFLIGHT_VERSION, evaluatedAt, state,
    blockerCodes: dedupe(extra.blockerCodes || []),
    readOnly: true, sendAuthority: false, externalEffectAuthority: 'NONE', externalEffects: 0,
    externalReads: registryLookups.length, registryLookups,
    ...extra
  });
  if (!record || typeof record !== 'object') return out(PREFLIGHT_STATES.BLOCKED_EXTERNAL_FACT, { blockerCodes: ['candidate-record-missing'] });
  const email = String(record.recipient?.email || '').trim().toLowerCase();

  // 1. Exact production contact history, computed in-process (no pasted truth).
  const contactHistory = await checkContactHistory({ store, email, now });
  const toIntake = { ...record };
  delete toIntake.contactHistory;
  toIntake.contactHistoryReceipt = contactHistory;
  const intake = compileProspectVerification(toIntake, { now, contactHistoryTrust: { inProcess: true }, jurisdictionPolicy: { anyHeadquarters: true, deferRecipientSide: true } });
  const summary = {
    company: intake.company, recipient: email, offerId: intake.offerId,
    contactHistory: { status: contactHistory.status, hit: contactHistory.overallContactHistoryHit, receiptDigest: contactHistory.receiptDigest || null, checkedAt: contactHistory.checkedAt },
    intake: { status: intake.status, rejectionReasons: intake.rejectionReasons, missingEvidence: intake.missingEvidence, provenance: intake.contactHistoryProvenance }
  };

  if (contactHistory.status === CONTACT_STATUS.HIT || intake.status === PROSPECT_STATUSES.REJECTED) {
    return out(PREFLIGHT_STATES.DO_NOT_SEND, { ...summary, blockerCodes: [...intake.rejectionReasons] });
  }
  if (contactHistory.status !== CONTACT_STATUS.CLEAN) {
    return out(PREFLIGHT_STATES.BLOCKED_CONTACT_HISTORY, { ...summary, blockerCodes: [`contact-history-${String(contactHistory.status).toLowerCase()}`, ...(contactHistory.reasonCodes || [])] });
  }
  if (intake.status !== PROSPECT_STATUSES.VERIFIED_CANDIDATE) {
    return out(PREFLIGHT_STATES.BLOCKED_EXTERNAL_FACT, { ...summary, blockerCodes: [...intake.missingEvidence] });
  }

  // 2. Sender allocation by the existing allocator (a quarantined or paused
  //    mailbox is never allocated). Read first so the route can report it.
  const sender = await readSenderAllocation({ store, recipientEmail: email, provider, now });

  // 3. GLOBAL_GREEN_LANE_ROUTER. Resolve public registry evidence first (a
  //    bounded read of an official register where the jurisdiction's rule needs
  //    legal-form evidence), then route. The router is the single owner of the
  //    recipient-side legal decision.
  const registry = policyRegistry || createPolicyEvidenceRegistry({ rows: [], now });
  const recipientJurisdiction = iso2(record.recipient?.jurisdiction) || iso2(record.hqCountry);
  const legalEntity = record.legalEntity && typeof record.legalEntity === 'object' ? record.legalEntity : {};
  let registryResult = null;
  if (registryAdapters && recipientJurisdiction && (legalEntity.legalName || legalEntity.companyNumber)) {
    registryResult = await resolveCompanyViaRegistry({ registry: registryAdapters, jurisdiction: recipientJurisdiction, name: legalEntity.legalName || '', companyNumber: legalEntity.companyNumber || '' });
    registryLookups.push({ registryId: registryResult.registryId, jurisdiction: recipientJurisdiction, status: registryResult.status, cache: registryResult.evidence?.cache || null, retrievedAt: registryResult.evidence?.retrievedAt || null });
  }
  const jurisdictionClaims = [{ jurisdiction: record.hqCountry, source: 'CANDIDATE_RECORD_HQ' }];
  if (record.recipient?.jurisdiction) jurisdictionClaims.push({ jurisdiction: record.recipient.jurisdiction, source: 'CANDIDATE_RECORD_RECIPIENT' });
  const routeDecision = routeGlobalGreenLane({
    now,
    objective: { kind: 'FIRST_TOUCH_COLD_B2B', offerId: intake.offerId, offerFamily: OFFER_FAMILY[intake.offerId] || null, ...(globalRoute.objective || {}) },
    candidate: { ref: email, company: intake.company, legalName: legalEntity.legalName || record.company, companyNumber: legalEntity.companyNumber || '', formText: legalEntity.formText || '', website: record.website },
    contact: {
      email,
      source: { url: record.recipient.sourceUrl, observedAt: record.recipient.observedAt, pageContext: record.recipient.pageContext || 'EXACT_SOURCE_PAGE', publicationType: record.recipient.publicationType || 'OWN_SITE_PAGE', collectionMethod: 'MANUAL', excerpt: record.recipient.excerpt },
      namedPersonEvidence: record.recipient.namedPersonEvidence || {}
    },
    recipient: { jurisdictionClaims, type: iso2(recipientJurisdiction) === 'GB' ? undefined : 'CORPORATE' },
    registry: { result: registryResult },
    notices: { noSolicitationChecked: record.notices?.noSolicitationChecked === true, noSolicitationFound: record.notices?.noSolicitationFound === true, noHarvestChecked: record.notices?.noHarvestChecked === true, noHarvestFound: record.notices?.noHarvestFound === true },
    offerRelevance: { relatedToRecipientRole: record.offerFit?.servesHomeServiceClients === true, rationale: String(record.offerRoute?.rationale || '') },
    invitationEvidence: Array.isArray(record.invitationEvidence) ? record.invitationEvidence : [],
    intakeChannels: Array.isArray(record.intakeChannels) ? record.intakeChannels : [],
    history: { status: contactHistory.status, receiptDigest: contactHistory.receiptDigest || null },
    provider: { id: provider, vendor: 'winnr' },
    sender: { identity, senderSide, allocation: sender.ok ? { ok: true, slot: sender.slot } : { ok: false, reasonCodes: sender.reasonCodes }, compliance: {} },
    policyRegistry: registry,
    economics: globalRoute.economics, routeCosts: globalRoute.routeCosts, lawfulChannels: globalRoute.lawfulChannels
  });
  summary.globalRoute = summarizeRoute(routeDecision);
  const activation = extra => compileGreenLaneActivationTruth({ routeDecision, preflight: extra });

  if (routeDecision.routeClass === ROUTE_CLASSES.DO_NOT_SEND) {
    return out(PREFLIGHT_STATES.DO_NOT_SEND, { ...summary, blockerCodes: routeDecision.blockers, oneButton: activation(null) });
  }
  if (routeDecision.state === ROUTE_STATES.POLICY_REFRESH_REQUIRED) {
    return out(PREFLIGHT_STATES.BLOCKED_POLICY_REFRESH, { ...summary, blockerCodes: routeDecision.blockers, policyRefreshRequired: routeDecision.policyRefreshRequired, oneButton: activation(null) });
  }
  if (!routeDecision.green) {
    // UNKNOWN_FAIL_CLOSED means an external fact is missing or ambiguous; CONDITIONAL and
    // CONSENT_REQUIRED mean the facts are known and the route itself is not available.
    const state = routeDecision.state === ROUTE_STATES.UNKNOWN_FAIL_CLOSED ? PREFLIGHT_STATES.BLOCKED_EXTERNAL_FACT : PREFLIGHT_STATES.BLOCKED_ROUTE;
    return out(state, { ...summary, blockerCodes: [...(state === PREFLIGHT_STATES.BLOCKED_ROUTE ? [`route-${String(routeDecision.state).toLowerCase()}`] : []), ...routeDecision.blockers], oneButton: activation(null) });
  }

  // 4. Cold-route envelope: the inert cold-v1 module validating the exact
  //    evidence a later founder authorization would bind to. It only exists for
  //    US routes; for any other jurisdiction no governed cold envelope exists
  //    yet, which is reported, never papered over. No authorization is
  //    requested, minted or inferred here.
  let coldRoute;
  if (routeDecision.jurisdiction.jurisdiction === 'US') {
    const route = createColdRouteEvidence({
      recipientEmail: email, sourceUrl: record.recipient.sourceUrl, sourceExcerpt: record.recipient.excerpt,
      sourceObservedAt: record.recipient.observedAt, jurisdiction: 'US', relevantToRecipientRole: true,
      noUnsolicitedStatementPresent: false,
      coldPolicy: {
        policyId: 'SMTP_RELAY_PUBLIC_BUSINESS_CONTACT_V1', contactSource: 'PUBLISHED_BUSINESS_CONTACT', collectionMethod: 'MANUAL',
        recipientType: 'CORPORATE', noSolicitationNoticeChecked: record.notices?.noSolicitationChecked === true,
        noHarvestNoticeChecked: record.notices?.noHarvestChecked === true, addressGuessed: false,
        roleRationale: String(record.offerRoute?.rationale || '')
      }
    }, now);
    const envelope = verifyColdRouteEnvelope({ route, recipientEmail: email, now });
    if (!envelope.ok) return out(PREFLIGHT_STATES.BLOCKED_EXTERNAL_FACT, { ...summary, blockerCodes: [envelope.reason], coldRoute: { envelopeOk: false, reason: envelope.reason }, oneButton: activation(null) });
    coldRoute = { envelopeOk: true, routeDigest: envelope.routeDigest, senderSideClassification: SENDER_SIDE_HOLD_CLASSIFICATION, selfAuthorizing: false };
  } else {
    coldRoute = { envelopeOk: null, status: 'NO_GOVERNED_COLD_ROUTE_ENVELOPE_FOR_JURISDICTION', jurisdiction: routeDecision.jurisdiction.jurisdiction, selfAuthorizing: false, note: 'cold-v1 is US-only and inert; extending governed dispatch to another jurisdiction is a separate human-authorized change' };
  }

  // 5. Prework artifact + V5 tournament. The artifact must exist in the repo.
  const artifactPrepared = artifactExists(artifactRef) === true;
  const tournament = runProspectMessageTournament({ intake, record, slots, artifactPrepared, artifactRef, now });
  summary.tournament = { status: tournament.status, winnerId: tournament.winner?.id || null, reasonCodes: tournament.reasonCodes || [] };
  if (tournament.status !== 'WINNER_SELECTED') return out(PREFLIGHT_STATES.DO_NOT_SEND, { ...summary, blockerCodes: [...(tournament.reasonCodes || ['no-winner'])], oneButton: activation(null) });
  summary.sender = sender.ok ? { ok: true, slot: sender.slot } : { ok: false, reasonCodes: sender.reasonCodes };

  // 6. Effect package. No final digest while any participant is not final; the
  //    green route is bound into the digest.
  const effectPackage = compileEffectPackage({ intake, tournament, identity, sender, unsubscribe, senderSide, campaign, provider, routeBinding: routeDecision.effectBinding, now });
  const base = {
    ...summary,
    coldRoute,
    message: { winner: tournament.winner, coreMessageDigest: tournament.bindings.coreMessageDigest },
    effectPackage: { state: effectPackage.state, finalEffectDigest: effectPackage.finalEffectDigest, placeholdersPresent: effectPackage.placeholdersPresent, routeBound: effectPackage.routeBound, blockers: effectPackage.blockers }
  };
  const withOneButton = result => ({ ...result, oneButton: activation(result) });
  const codes = effectPackage.blockers.map(b => b.code);
  if (!sender.ok) return withOneButton(out(PREFLIGHT_STATES.BLOCKED_SENDER_HEALTH, { ...base, blockerCodes: [...sender.reasonCodes, ...codes.filter(c => !c.startsWith('sender-allocation'))] }));
  if (effectPackage.blockers.some(b => b.group === 'identity')) return withOneButton(out(PREFLIGHT_STATES.BLOCKED_IDENTITY, { ...base, blockerCodes: codes }));
  if (effectPackage.blockers.some(b => b.group === 'authority')) return withOneButton(out(PREFLIGHT_STATES.BLOCKED_LEGAL_AUTHORITY, { ...base, blockerCodes: codes }));
  if (effectPackage.state === EFFECT_PACKAGE_STATES.READY_PENDING_DRAFT_TIME_FACTS) {
    return withOneButton(out(PREFLIGHT_STATES.READY_PENDING_DRAFT_TIME_FACTS, { ...base, blockerCodes: [], draftTimeFacts: effectPackage.runtimeAtSendBlockers }));
  }
  if (effectPackage.state !== EFFECT_PACKAGE_STATES.READY_FOR_AUTHORIZATION) {
    return withOneButton(out(PREFLIGHT_STATES.BLOCKED_SENDER_HEALTH, { ...base, blockerCodes: codes }));
  }
  return withOneButton(out(PREFLIGHT_STATES.READY_FOR_AUTHORIZATION, { ...base, blockerCodes: [] }));
}
