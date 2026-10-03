// Generic effect-package compiler for a verified, message-selected prospect.
//
// It assembles every fact that participates in the final immutable effect
// digest and refuses to mint that digest while ANY participating fact is a
// placeholder or missing. It does not approve, dispatch or reconcile: those
// stay with the existing governance (createOutreachApproval / outbound
// reservations / outbound events / reservation recovery). The state names
// below stop at READY_FOR_AUTHORIZATION; APPROVED, DISPATCHED and RECONCILED
// are mapped to the existing canonical owners instead of being re-implemented.
import { createHash } from 'node:crypto';
import { CONTACT_HISTORY_RUNTIME_PROVENANCE } from './prospect-contact-history.mjs';
import { verifyInvitedBusinessContact, invitedBusinessSenderSideClear } from './outreach-governance.mjs';

export const EFFECT_PACKAGE_VERSION = 'uberbond.prospect-effect-package.v1';

export const EFFECT_PACKAGE_STATES = Object.freeze({
  PREPARED: 'PREPARED',
  READY_EXCEPT_IDENTITY: 'READY_EXCEPT_IDENTITY',
  READY_EXCEPT_AUTHORITY: 'READY_EXCEPT_AUTHORITY',
  READY_EXCEPT_SENDER: 'READY_EXCEPT_SENDER',
  READY_EXCEPT_RUNTIME_HISTORY: 'READY_EXCEPT_RUNTIME_HISTORY',
  // The global green-lane route is not green (or its binding is absent): the
  // digest cannot bind a route that does not exist.
  READY_EXCEPT_ROUTE: 'READY_EXCEPT_ROUTE',
  // Everything verifiable before a prospect record exists is final; only facts
  // the existing draft step creates per prospect (signed unsubscribe URLs bound
  // to the prospect id) remain. The digest is minted by governance at draft time.
  READY_PENDING_DRAFT_TIME_FACTS: 'READY_PENDING_DRAFT_TIME_FACTS',
  READY_EXCEPT_IDENTITY_AND_AUTHORITY: 'READY_EXCEPT_IDENTITY_AND_AUTHORITY',
  READY_FOR_AUTHORIZATION: 'READY_FOR_AUTHORIZATION'
});

// Terminal states past READY_FOR_AUTHORIZATION already have canonical owners.
export const DOWNSTREAM_STATE_OWNERS = Object.freeze({
  APPROVED: 'src/outreach-governance.mjs createOutreachApproval/verifyOutreachApproval (HMAC-signed, <=24h, exact message digest)',
  DISPATCHED: "store outboundReservations status 'dispatching' -> 'sent' through the governed dispatch path",
  RECONCILED: "store outboundEvents + src/reservation-recovery.mjs ('uncertain' reconciliation)"
});

const PLACEHOLDER = /^(?:LEGAL_BUSINESS_SENDER_NAME|AUTHORIZED_PUBLIC_POSTAL_ADDRESS|<[^>]*>|\[[^\]]*\]|\{[^}]*\}|TBD|TODO|PLACEHOLDER|N\/A|NONE|UNKNOWN)$/i;
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
};
const sha = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const isPlaceholder = value => {
  const v = text(value, 600);
  return !v || PLACEHOLDER.test(v) || /\b(?:LEGAL_BUSINESS_SENDER_NAME|AUTHORIZED_PUBLIC_POSTAL_ADDRESS)\b/.test(v) || /(?:^|\s)(?:<[^>]+>|\[[^\]]+\])(?:\s|$)/.test(v);
};

// Facts only the production runtime can supply (fleet allocation read, and the
// per-prospect signed unsubscribe URLs created by the existing draft step).
// They hold the digest but are not machine-resolvable blockers in a sandbox.
const RUNTIME_AT_SEND = new Set(['sender-allocation-runtime-read-required', 'signed-unsubscribe-urls-not-created']);
const SENDER_SIDE_FIELDS = ['operatorLocation', 'senderEntityJurisdiction', 'controllerJurisdiction'];

/**
 * @param {object} input
 * @param {object} input.intake       prospect verification result
 * @param {object} input.tournament   WINNER_SELECTED tournament result
 * @param {object} [input.identity]   { legalBusinessSenderName, authorizedPublicPostalAddress, footerUseAuthorized }
 * @param {object} [input.sender]     runtime fleet allocation { ok, slot, provider, quarantined }
 * @param {object} [input.unsubscribe] { unsubscribeUrl, oneClickUnsubscribeUrl } created at runtime
 * @param {object} [input.senderSide]  { resolved: boolean, operatorLocation, senderEntityJurisdiction, controllerJurisdiction, resolutionRef }
 * @param {object} [input.campaign]    { campaignId, offerLineage }
 * @param {object|null} [input.routeBinding] effectBinding from the global green-lane router. `undefined` keeps the
 *   legacy package (no route participant); `null` means a route was required and is not green, which withholds the
 *   digest; an object binds route class, route policy version, policy evidence hashes, jurisdiction, legal form,
 *   invitation and contact-source digests into the final effect digest, so any route mutation changes it.
 */
export function compileEffectPackage({ intake, tournament, identity = {}, sender = null, unsubscribe = {}, senderSide = {}, campaign = {}, provider = 'smtp-relay', routeBinding, invitedBusinessContact, now = new Date() } = {}) {
  const compiledAt = new Date(now).toISOString();
  const blockers = { runtimeHistory: [], message: [], route: [], identity: [], authority: [], sender: [], draftTime: [] };
  if (campaign.effectExpiresAt && (!Number.isFinite(Date.parse(campaign.effectExpiresAt)) || Date.parse(campaign.effectExpiresAt) <= +new Date(now) || Date.parse(campaign.effectExpiresAt) > +new Date(now) + 86400000)) blockers.message.push('effect-expiry-invalid-or-outside-24-hour-bound');
  if (routeBinding === null) blockers.route.push('route-binding-absent-global-route-not-green');
  else if (routeBinding !== undefined && (typeof routeBinding !== 'object' || !routeBinding.routeClass || !routeBinding.policyEvidenceDigest)) blockers.route.push('route-binding-malformed');
  if (routeBinding?.providerRouteType === 'INVITED_BUSINESS_CONTACT') {
    const invitation = verifyInvitedBusinessContact(invitedBusinessContact, { now });
    if (!invitation.ok || invitation.evidenceDigest !== routeBinding.invitedBusinessEvidenceDigest) blockers.route.push('invited-business-effect-evidence-invalid-or-changed');
  }

  if (!intake || intake.status !== 'VERIFIED_CANDIDATE') blockers.runtimeHistory.push('prospect-not-verified-candidate');
  if (intake && intake.contactHistoryProvenance !== CONTACT_HISTORY_RUNTIME_PROVENANCE) blockers.runtimeHistory.push('contact-history-runtime-receipt-missing');
  if (!tournament || tournament.status !== 'WINNER_SELECTED' || !tournament.winner) blockers.message.push('message-tournament-winner-missing');

  const legalName = text(identity.legalBusinessSenderName, 200);
  const address = text(identity.authorizedPublicPostalAddress, 500);
  if (isPlaceholder(legalName)) blockers.identity.push('legal-business-sender-name-placeholder-or-missing');
  if (isPlaceholder(address) || address.length < 12) blockers.identity.push('authorized-public-postal-address-placeholder-or-missing');
  if (identity.footerUseAuthorized !== true) blockers.identity.push('owner-authorization-to-publish-footer-missing');

  const senderSideHold = intake?.legalAuthorityStatus === 'HOLD_SENDER_SIDE_UNRESOLVED';
  const scopedClear = routeBinding?.providerRouteType === 'INVITED_BUSINESS_CONTACT' && invitedBusinessSenderSideClear(senderSide, { invitedBusinessContact, now, message: tournament?.winner ? { subject: tournament.winner.subject, body: tournament.winner.body } : null });
  if (senderSideHold && senderSide.resolved !== true && !scopedClear) blockers.authority.push('sender-side-legal-authority-hold-unresolved');
  if (routeBinding?.providerRouteType === 'INVITED_BUSINESS_CONTACT' && !scopedClear && !blockers.authority.includes('sender-side-legal-authority-hold-unresolved')) blockers.authority.push('sender-side-legal-authority-hold-unresolved');
  if (senderSide.resolved === true) {
    for (const field of SENDER_SIDE_FIELDS) if (!text(senderSide[field], 8)) blockers.authority.push(`sender-side-field-missing:${field}`);
    if (!text(senderSide.resolutionRef, 500)) blockers.authority.push('sender-side-resolution-reference-missing');
  }

  if (!sender || sender.ok !== true || !text(sender.slot)) blockers.sender.push('sender-allocation-runtime-read-required');
  else {
    if (sender.quarantined === true) blockers.sender.push('allocated-sender-is-quarantined');
    if (text(sender.provider) && text(sender.provider) !== provider) blockers.sender.push('allocated-sender-provider-mismatch');
  }
  const unsubUrl = text(unsubscribe.unsubscribeUrl, 1000);
  const oneClick = text(unsubscribe.oneClickUnsubscribeUrl, 1000);
  const unsubscribeFinal = unsubUrl.startsWith('https://') && oneClick.startsWith('https://');
  if (!unsubscribeFinal) blockers.draftTime.push('signed-unsubscribe-urls-not-created');

  // Render the final text only from supplied parts; placeholders stay visible.
  const core = tournament?.winner ? { subject: tournament.winner.subject, body: tournament.winner.body } : null;
  const nameForRender = legalName || 'LEGAL_BUSINESS_SENDER_NAME';
  const addressForRender = address || 'AUTHORIZED_PUBLIC_POSTAL_ADDRESS';
  const renderedBody = core
    ? `${core.body}\n\nThis is a commercial message from ${nameForRender}.\n${nameForRender}, ${addressForRender}\nUnsubscribe: ${unsubUrl || '{signed-unsubscribe-url-created-at-send}'}`
    : null;

  const identityFinal = blockers.identity.length === 0;
  const participants = {
    ...(campaign.effectExpiresAt ? { expiresAt: campaign.effectExpiresAt, maxEffects: 1 } : {}),
    recipient: tournament?.bindings?.prospect?.recipient || null,
    legalBusinessSenderName: identityFinal ? legalName : null,
    authorizedPublicPostalAddress: identityFinal ? address : null,
    sender: blockers.sender.length === 0 ? { slot: text(sender.slot), provider } : null,
    provider,
    subject: core?.subject || null,
    body: core && identityFinal && unsubscribeFinal ? renderedBody : null,
    footerAndUnsubscribe: identityFinal && unsubscribeFinal ? { unsubUrl, oneClick } : null,
    evidence: tournament?.bindings?.evidenceSnapshot?.digest || null,
    contactHistoryReceiptDigest: intake?.contactHistoryReceiptDigest || null,
    ...(routeBinding === undefined ? {} : { route: blockers.route.length ? null : routeBinding }),
    campaignAndOfferLineage: { campaignId: text(campaign.campaignId) || null, offerId: tournament?.bindings?.offerId || intake?.offerId || null, experimentCellId: tournament?.bindings?.experimentCellId || null, candidateSetDigest: tournament?.bindings?.candidateSetDigest || null }
  };
  const missingParticipants = Object.entries(participants).filter(([, value]) => value === null || value === '' || value === undefined).map(([key]) => key);
  if (!participants.campaignAndOfferLineage.campaignId) missingParticipants.push('campaignAndOfferLineage.campaignId');
  if (!participants.campaignAndOfferLineage.campaignId) blockers.draftTime.push('campaign-lineage-missing');

  const messageBlocked = blockers.message.length > 0;
  const identityBlocked = blockers.identity.length > 0;
  const authorityBlocked = blockers.authority.length > 0;
  const senderBlocked = blockers.sender.length > 0;
  const draftTimeBlocked = blockers.draftTime.length > 0;
  const historyBlocked = blockers.runtimeHistory.length > 0;
  const routeBlocked = blockers.route.length > 0;
  let state;
  if (historyBlocked) state = EFFECT_PACKAGE_STATES.READY_EXCEPT_RUNTIME_HISTORY;
  else if (routeBlocked) state = EFFECT_PACKAGE_STATES.READY_EXCEPT_ROUTE;
  else if (messageBlocked) state = EFFECT_PACKAGE_STATES.PREPARED;
  else if (identityBlocked && authorityBlocked) state = EFFECT_PACKAGE_STATES.READY_EXCEPT_IDENTITY_AND_AUTHORITY;
  else if (identityBlocked) state = EFFECT_PACKAGE_STATES.READY_EXCEPT_IDENTITY;
  else if (authorityBlocked) state = EFFECT_PACKAGE_STATES.READY_EXCEPT_AUTHORITY;
  else if (senderBlocked) state = EFFECT_PACKAGE_STATES.READY_EXCEPT_SENDER;
  else if (draftTimeBlocked) state = EFFECT_PACKAGE_STATES.READY_PENDING_DRAFT_TIME_FACTS;
  else state = EFFECT_PACKAGE_STATES.READY_FOR_AUTHORIZATION;

  // The digest exists only when nothing that participates is missing or placeholder.
  const mintable = state === EFFECT_PACKAGE_STATES.READY_FOR_AUTHORIZATION && missingParticipants.length === 0;
  const finalEffectDigest = mintable ? sha({ version: EFFECT_PACKAGE_VERSION, participants }) : null;
  const allBlockers = Object.entries(blockers).flatMap(([group, codes]) => codes.map(code => ({ group, code })));
  return {
    version: EFFECT_PACKAGE_VERSION,
    compiledAt,
    state,
    // "Everything the machine can resolve is resolved": nothing but identity
    // and sender-side legal authority remain (the two owner/legal holds).
    readyExceptIdentityAndLegalAuthority: !historyBlocked && !messageBlocked && !routeBlocked && blockers.sender.every(code => RUNTIME_AT_SEND.has(code)),
    blockers: allBlockers,
    machineResolvableBlockerCount: allBlockers.filter(b => ['runtimeHistory', 'message', 'route'].includes(b.group)).length + blockers.sender.filter(code => !RUNTIME_AT_SEND.has(code)).length,
    runtimeAtSendBlockers: [...blockers.sender.filter(code => RUNTIME_AT_SEND.has(code)), ...blockers.draftTime],
    ownerOrLegalHolds: { identity: identityBlocked, legalAuthority: authorityBlocked },
    finalEffectDigest,
    finalEffectDigestWithheldBecause: finalEffectDigest ? [] : [...new Set([...allBlockers.map(b => b.code), ...missingParticipants.map(p => `participant-not-final:${p}`)])],
    placeholdersPresent: identityBlocked,
    preview: { subject: core?.subject || null, body: renderedBody, containsPlaceholders: identityBlocked || !unsubscribeFinal },
    routeBound: routeBinding === undefined ? null : !routeBlocked,
    participantsFinal: Object.fromEntries(Object.entries(participants).map(([key, value]) => [key, !(value === null || value === '' || value === undefined)])),
    participants,
    maxEffects: 1,
    expiresAt: campaign.effectExpiresAt || null,
    downstreamStateOwners: DOWNSTREAM_STATE_OWNERS,
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'An effect package is preparation. READY_FOR_AUTHORIZATION means every participating fact is final, not that anything is authorized: the founder-signed approval, the sender-side legal gate and the existing governed dispatch path remain separate and required.'
  };
}
