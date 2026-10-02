// PROSPECT_PREFLIGHT: one generic, zero-authority operation.
//
//   candidate evidence record
//     -> exact production contact-history read (suppressions, prospects,
//        outbound reservations/events, replies, messages, provider events)
//     -> deterministic prospect verification (negative signals, ownership,
//        publication provenance, notices, offer route, recipient-side legality)
//     -> cold-route evidence envelope check (the inert cold-v1 module, now
//        reachable, never self-authorizing)
//     -> prework + V5 message tournament (UberReply machinery)
//     -> fleet sender allocation (existing allocator; quarantined/paused never)
//     -> effect-package compile (no final digest while any fact is placeholder)
//     -> ONE typed terminal state with exact blocker codes.
//
// It reads the store (list only), writes nothing, calls no provider, contacts
// no one, and returns sendAuthority:false for every state including
// READY_FOR_AUTHORIZATION. Approval, dispatch and reconciliation stay with the
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
  BLOCKED_CONTACT_HISTORY: 'BLOCKED_CONTACT_HISTORY'
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

/**
 * @param {object} input
 * @param {object} input.store    read-only store (list only is called)
 * @param {object} input.record   candidate evidence record (see prospect-verification-intake)
 * @param {object} input.slots    grounded message slots from the evidence lane
 * @param {string} input.artifactRef repository-relative artifacts/ path of the prepared artifact
 * @param {object} [input.identity] { legalBusinessSenderName, authorizedPublicPostalAddress, footerUseAuthorized }
 * @param {object} [input.senderSide] sender-side legal resolution
 * @param {object} [input.unsubscribe] runtime-created signed unsubscribe URLs
 * @param {object} [input.campaign]
 */
export async function runProspectPreflight({
  store, record, slots, artifactRef = '', identity = {}, senderSide = {}, unsubscribe = {}, campaign = {},
  provider = 'smtp-relay', now = new Date(), artifactExists = repositoryArtifactExists
} = {}) {
  const evaluatedAt = new Date(now).toISOString();
  const out = (state, extra = {}) => ({
    version: PROSPECT_PREFLIGHT_VERSION, evaluatedAt, state,
    blockerCodes: dedupe(extra.blockerCodes || []),
    readOnly: true, sendAuthority: false, externalEffectAuthority: 'NONE', externalEffects: 0,
    ...extra
  });
  if (!record || typeof record !== 'object') return out(PREFLIGHT_STATES.BLOCKED_EXTERNAL_FACT, { blockerCodes: ['candidate-record-missing'] });
  const email = String(record.recipient?.email || '').trim().toLowerCase();

  // 1. Exact production contact history, computed in-process (no pasted truth).
  const contactHistory = await checkContactHistory({ store, email, now });
  const toIntake = { ...record };
  delete toIntake.contactHistory;
  toIntake.contactHistoryReceipt = contactHistory;
  const intake = compileProspectVerification(toIntake, { now, contactHistoryTrust: { inProcess: true } });
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

  // 2. Cold-route envelope: the inert cold-v1 module validating the exact
  //    evidence a later founder authorization would bind to. No authorization
  //    is requested, minted or inferred here.
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
  if (!envelope.ok) return out(PREFLIGHT_STATES.BLOCKED_EXTERNAL_FACT, { ...summary, blockerCodes: [envelope.reason], coldRoute: { envelopeOk: false, reason: envelope.reason } });

  // 3. Prework artifact + V5 tournament. The artifact must exist in the repo.
  const artifactPrepared = artifactExists(artifactRef) === true;
  const tournament = runProspectMessageTournament({ intake, record, slots, artifactPrepared, artifactRef, now });
  summary.tournament = { status: tournament.status, winnerId: tournament.winner?.id || null, reasonCodes: tournament.reasonCodes || [] };
  if (tournament.status !== 'WINNER_SELECTED') return out(PREFLIGHT_STATES.DO_NOT_SEND, { ...summary, blockerCodes: [...(tournament.reasonCodes || ['no-winner'])] });

  // 4. Sender allocation by the existing allocator (a quarantined or paused
  //    mailbox is never allocated).
  const sender = await readSenderAllocation({ store, recipientEmail: email, provider, now });
  summary.sender = sender.ok ? { ok: true, slot: sender.slot } : { ok: false, reasonCodes: sender.reasonCodes };

  // 5. Effect package. No final digest while any participant is not final.
  const effectPackage = compileEffectPackage({ intake, tournament, identity, sender, unsubscribe, senderSide, campaign, provider, now });
  const base = {
    ...summary,
    coldRoute: { envelopeOk: true, routeDigest: envelope.routeDigest, senderSideClassification: SENDER_SIDE_HOLD_CLASSIFICATION, selfAuthorizing: false },
    message: { winner: tournament.winner, coreMessageDigest: tournament.bindings.coreMessageDigest },
    effectPackage: { state: effectPackage.state, finalEffectDigest: effectPackage.finalEffectDigest, placeholdersPresent: effectPackage.placeholdersPresent, blockers: effectPackage.blockers }
  };
  const codes = effectPackage.blockers.map(b => b.code);
  if (!sender.ok) return out(PREFLIGHT_STATES.BLOCKED_SENDER_HEALTH, { ...base, blockerCodes: [...sender.reasonCodes, ...codes.filter(c => !c.startsWith('sender-allocation'))] });
  if (effectPackage.blockers.some(b => b.group === 'identity')) return out(PREFLIGHT_STATES.BLOCKED_IDENTITY, { ...base, blockerCodes: codes });
  if (effectPackage.blockers.some(b => b.group === 'authority')) return out(PREFLIGHT_STATES.BLOCKED_LEGAL_AUTHORITY, { ...base, blockerCodes: codes });
  if (effectPackage.state === EFFECT_PACKAGE_STATES.READY_PENDING_DRAFT_TIME_FACTS) {
    return out(PREFLIGHT_STATES.READY_PENDING_DRAFT_TIME_FACTS, { ...base, blockerCodes: [], draftTimeFacts: effectPackage.runtimeAtSendBlockers });
  }
  if (effectPackage.state !== EFFECT_PACKAGE_STATES.READY_FOR_AUTHORIZATION) {
    return out(PREFLIGHT_STATES.BLOCKED_SENDER_HEALTH, { ...base, blockerCodes: codes });
  }
  return out(PREFLIGHT_STATES.READY_FOR_AUTHORIZATION, { ...base, blockerCodes: [] });
}
