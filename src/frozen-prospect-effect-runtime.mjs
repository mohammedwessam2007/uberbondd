// Exact-digest, one-use dispatch for a frozen prospect effect. This is an
// exception for one signed effect, not an outbound-mode switch: global
// OUTBOUND_ENABLED / OUTBOUND_DRY_RUN stay untouched.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { dispatchSmtpFleetAccount, openSmtpAccountCredential } from './uberfleet.mjs';
import { gateOutboundRoute, OUTBOUND_AUTHORIZATION_PACKAGE_MISSING } from './outbound-send-authorization.mjs';

const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => [k, canonical(x[k])])) : x;
const sha = x => createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const authKey = digest => `frozenProspectAuthorization:${digest}`;
const executionKey = digest => `frozenProspectExecution:${digest}`;
// A NOT_SENT release crossed no provider boundary, so it no longer counts as a consumed one-use effect.
const executionClaimed = (settings, digest) => Boolean(settings[executionKey(digest)]) && settings[executionKey(digest)].status !== 'NOT_SENT';
const deny = (code, extra = {}) => ({ ok: false, state: 'NOT_SENT', reason: code, providerCalls: 0, dispatchAdapterCalls: 0, sendAuthority: false, ...extra });
const exactEmail = value => String(value || '').trim().toLowerCase();
const safeHexEqual = (a, b) => {
  if (!/^[a-f0-9]{64}$/i.test(String(a || '')) || !/^[a-f0-9]{64}$/i.test(String(b || ''))) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};
const deterministicMessageId = (digest, senderAddress) => {
  const domain = exactEmail(senderAddress).split('@').pop()?.replace(/[^a-z0-9.-]/g, '') || 'uberbond.local';
  return `<ubf-${String(digest || '').slice(0, 56)}@${domain}>`;
};

export function verifyFrozenProspectAuthorization({ record, digest, participants, secret, now = new Date(), senderAddress, routeDigest } = {}) {
  if (!record || record.schemaVersion !== 'uberbond.frozen-effect-authorization.v1') return { ok: false, reason: 'authorization-record-missing-or-invalid' };
  const { signature, ...base } = record;
  const expected = createHmac('sha256', String(secret || '')).update(JSON.stringify(canonical(base))).digest('hex');
  if (!safeHexEqual(signature, expected)) return { ok: false, reason: 'authorization-signature-invalid' };
  const route = participants?.route || {};
  const checks = {
    effectDigest: digest,
    recipient: exactEmail(participants?.recipient),
    senderSlot: String(participants?.sender?.slot || ''),
    provider: String(participants?.provider || '').toLowerCase(),
    routeClass: String(route.routeClass || '')
  };
  // The signature covers the record's own bytes. The sender and route binding is checked against the live values only when
  // the caller supplies them, so a valid signature alone never proves the record names this sender or this route.
  if (senderAddress !== undefined) checks.senderAddress = exactEmail(senderAddress);
  if (routeDigest !== undefined) checks.routeDigest = String(routeDigest || '');
  for (const [field, expectedValue] of Object.entries(checks)) {
    if (record[field] !== expectedValue) return { ok: false, reason: `authorization-${field}-mismatch` };
  }
  if (record.effectCap !== 1 || record.approvedBy === '' || !record.approvedBy) return { ok: false, reason: 'authorization-cap-or-approver-invalid' };
  if (!Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= +new Date(now)) return { ok: false, reason: 'authorization-expired' };
  if (Date.parse(record.expiresAt) > Date.parse(participants.expiresAt)) return { ok: false, reason: 'authorization-outlives-effect' };
  return { ok: true, authorizationDigest: sha(base), effectCap: 1 };
}

function checkPreflight(result, digest, participants, { requireAuthorization = false } = {}) {
  if (!result?.ok || result.validation?.valid !== true || result.validation?.frozenEffectDigest !== digest) return 'preflight-not-valid-for-exact-digest';
  if (result.state !== 'READY_FOR_AUTHORIZATION' || result.effectPackage?.finalEffectDigest !== digest) return 'effect-not-ready-or-digest-changed';
  if (result.effectPackage?.maxEffects !== 1 || participants.maxEffects !== 1) return 'effect-cap-not-one';
  if (exactEmail(result.effectPackage?.participants?.recipient) !== exactEmail(participants.recipient)) return 'recipient-binding-changed';
  if (result.contactHistory?.status !== 'CLEAN' || result.contactHistory?.hit !== false) return 'production-history-not-clean';
  const gates = result.globalRoute?.sendPrerequisites || {};
  for (const name of ['suppressionClean', 'historyClean', 'identityComplete', 'senderEligible', 'providerAllowed']) {
    if (gates[name]?.status !== 'PASS') return `canonical-gate-${name}-${String(gates[name]?.status || 'UNKNOWN').toLowerCase()}`;
  }
  if (result.globalRoute?.green !== true || result.globalRoute?.governanceGate?.refused !== false) return 'route-or-provider-governance-not-pass';
  if (result.globalRoute?.governanceGate?.routeType !== 'INVITED_BUSINESS_CONTACT') return 'route-not-qualified-invited-business';
  if (result.sender?.ok !== true || result.sender?.slot !== participants.sender?.slot) return 'selected-sender-changed';
  if (result.effectPackage?.participants?.provider !== 'smtp-relay' || participants.provider !== 'smtp-relay') return 'effect-provider-not-bound-smtp-relay';
  if (result.effectPackage?.participants?.route?.routeClass !== 'INVITED_GREEN') return 'effect-route-class-not-invited-green';
  if (requireAuthorization && result.oneButton?.gates?.authorizationValid?.status !== 'PASS') return 'canonical-authorization-gate-not-pass';
  return '';
}

export async function executeFrozenProspectEffect({
  store, digest, secret, approvalSecret, approverId, encryptionKey, validate,
  dispatch = dispatchSmtpFleetAccount, now = new Date(), thresholds = {}, canaryMinGapSeconds = 0,
  outboundAuthorization = null, consentVerifier = undefined, authorization = null
} = {}) {
  if (!/^[a-f0-9]{64}$/.test(digest || '')) return deny('frozen-effect-digest-invalid');
  if (typeof secret !== 'string' || secret.length < 32) return deny('frozen-effect-secret-unavailable');
  if (typeof approvalSecret !== 'string' || approvalSecret.length < 32 || !String(approverId || '').trim()) return deny('canonical-approval-signing-not-configured');
  if (!/^[a-f0-9]{64}$/i.test(String(encryptionKey || ''))) return deny('smtp-encryption-key-unavailable');
  if (typeof validate !== 'function' || typeof dispatch !== 'function') return deny('canonical-validation-or-provider-adapter-unavailable');

  const settings = await store.getSettings();
  const snapshot = settings[`frozenProspectEffect:${digest}`];
  if (!snapshot || snapshot.digest !== digest) return deny('frozen-effect-snapshot-unavailable');
  const participants = snapshot.result?.effectPackage?.participants;
  if (!participants || sha({ version: snapshot.result.effectPackage.version || 'uberbond.prospect-effect-package.v1', participants }) !== digest) {
    // The original freeze uses this exact package version. The fallback below
    // keeps the check independent of a caller-supplied payload or digest.
    if (!participants || sha({ version: 'uberbond.prospect-effect-package.v1', participants }) !== digest) return deny('frozen-effect-digest-does-not-match-snapshot');
  }
  if (participants.maxEffects !== 1 || !participants.expiresAt || !Number.isFinite(Date.parse(participants.expiresAt)) || Date.parse(participants.expiresAt) <= +new Date(now)) return deny('frozen-effect-expired-or-cap-invalid');
  const frozenRouteDigest = String(snapshot.result?.globalRoute?.routeDigest || '');
  if (!/^[a-f0-9]{64}$/i.test(frozenRouteDigest)) return deny('frozen-route-digest-unavailable');
  if (exactEmail(participants.recipient) !== 'partnerships@intelo.ai') return deny('authorized-recipient-mismatch');
  if (!participants.sender?.slot || participants.provider !== 'smtp-relay' || participants.sender.provider !== 'smtp-relay') return deny('frozen-provider-or-sender-binding-invalid');
  const slotAddress = String(participants.sender.slot).startsWith('winnr:') ? String(participants.sender.slot).slice(6).toLowerCase() : '';
  if (!slotAddress || !slotAddress.includes('@') || !slotAddress.includes('nadia')) return deny('authorized-sender-nadia-not-bound-by-slot');
  if (participants.route?.routeClass !== 'INVITED_GREEN' || participants.route?.providerRouteType !== 'INVITED_BUSINESS_CONTACT') return deny('authorized-invited-route-not-bound');

  // Read-only canonical revalidation happens before any reservation or
  // dispatch mutation. It reuses the history receipt and unsubscribe bytes.
  const preflight = await validate(digest);
  const gateFailure = checkPreflight(preflight, digest, participants);
  if (gateFailure) return deny(gateFailure, { blockerCodes: preflight?.blockerCodes || [] });
  if (preflight.globalRoute?.routeDigest !== frozenRouteDigest) return deny('canonical-route-digest-changed');
  const currentParticipants = preflight.effectPackage.participants;
  if (sha({ version: preflight.effectPackage.version || 'uberbond.prospect-effect-package.v1', participants: currentParticipants }) !== digest) return deny('canonical-payload-digest-changed');

  const recipient = exactEmail(participants.recipient);
  const senderSlot = String(participants.sender.slot);
  const routeDigest = String(preflight.globalRoute.routeDigest || '');
  const timestamp = new Date(now).toISOString();

  // Live-route package request, before the one-use claim, any credential open or any adapter call. The package is requested
  // for the exact message this route will send. Without one the route refuses with an explicit reason and consumes nothing.
  const candidate = {
    to: recipient, from: slotAddress, subject: participants.subject, text: participants.body, body: participants.body,
    messageId: deterministicMessageId(digest, slotAddress), listUnsubscribe: participants.footerAndUnsubscribe?.oneClick
  };
  let outboundPackage = null;
  if (typeof outboundAuthorization === 'function') {
    try { outboundPackage = await outboundAuthorization({ message: candidate }); } catch { outboundPackage = null; }
  }
  if (!outboundPackage || typeof outboundPackage !== 'object') {
    return deny(OUTBOUND_AUTHORIZATION_PACKAGE_MISSING, { reasonCodes: [OUTBOUND_AUTHORIZATION_PACKAGE_MISSING] });
  }

  // Read-only route decision on the exact bound account, so a route refusal names the gate that failed. Nothing is claimed,
  // reserved or opened here. The claim transaction repeats the decision before any credential is opened.
  const boundAccount = await store.findOne('accounts', { slot: senderSlot });
  const routeRefusal = boundAccount ? gateOutboundRoute({
    account: boundAccount, message: { ...candidate, from: exactEmail(boundAccount.email), authorization: outboundPackage }, consentVerifier
  }) : null;
  if (routeRefusal) return deny('outbound-authorization-refused', { reasonCodes: routeRefusal.reasonCodes });

  // The approval must be a record the caller supplies for this call: signed with the approval secret and bound to this exact
  // digest, route and sender, with the configured approver named. The runtime never mints one, and a record already in
  // settings is not an approval by itself.
  if (!authorization || typeof authorization !== 'object') return deny('frozen-effect-authorization-missing', { reasonCodes: ['frozen-effect-authorization-missing'] });
  const approvalCheck = verifyFrozenProspectAuthorization({ record: authorization, digest, participants, secret: approvalSecret, now, senderAddress: slotAddress, routeDigest });
  if (!approvalCheck.ok) return deny(approvalCheck.reason);
  if (String(authorization.approvedBy).trim() !== String(approverId).trim()) return deny('frozen-effect-authorization-approver-mismatch');

  // Persist the exact caller-supplied record before the canonical one-button read, so the gate verifies these bytes. A
  // different record already persisted for this digest is refused rather than replaced.
  const persisted = await store.transaction(async tx => {
    if (tx.pool) await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`frozen-prospect-effect:${digest}`]);
    const currentSettings = await tx.getSettings();
    if (executionClaimed(currentSettings, digest)) return { alreadyClaimed: true, effectCapRemaining: currentSettings[executionKey(digest)]?.effectCapRemaining ?? 0 };
    const existing = currentSettings[authKey(digest)];
    if (existing) return sha(existing) === sha(authorization) ? existing : null;
    await tx.setSetting(authKey(digest), authorization);
    return authorization;
  });
  if (!persisted) return deny('effect-cap-already-claimed-or-authorization-mismatch');
  if (persisted.alreadyClaimed) return deny('effect-cap-already-claimed', { effectCapRemaining: persisted.effectCapRemaining ?? 0 });

  const authorizedPreflight = await validate(digest);
  const authorizedGateFailure = checkPreflight(authorizedPreflight, digest, participants, { requireAuthorization: true });
  if (authorizedGateFailure) return deny(authorizedGateFailure, { blockerCodes: authorizedPreflight?.blockerCodes || [] });
  if (authorizedPreflight.globalRoute?.routeDigest !== routeDigest) return deny('authorized-route-digest-changed');

  const claim = await store.transaction(async tx => {
    if (tx.pool) await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`frozen-prospect-effect:${digest}`]);
    const currentSettings = await tx.getSettings();
    const prior = executionClaimed(currentSettings, digest) ? currentSettings[executionKey(digest)] : null;
    if (prior) return { blocked: 'effect-cap-already-claimed', prior };
    let authorization = currentSettings[authKey(digest)];
    if (!authorization) return { blocked: 'persisted-authorization-missing' };
    const authCheck = verifyFrozenProspectAuthorization({ record: authorization, digest, participants, secret: approvalSecret, now });
    if (!authCheck.ok || authorization.routeDigest !== routeDigest || authorization.senderAddress !== slotAddress) return { blocked: 'persisted-authorization-mismatch-or-invalid' };
    const account = await tx.findOne('accounts', { slot: senderSlot });
    if (!account || account.connected !== true || String(account.provider || '').toLowerCase() !== 'smtp-relay' || !account.tokens || account.smtpRoute?.authorized !== true || account.smtpRoute?.termsCompatible !== true || !String(account.smtpRoute?.evidenceRef || '').trim()) return { blocked: 'bound-smtp-sender-unavailable-or-ineligible' };
    if (exactEmail(account.email) !== slotAddress) return { blocked: 'bound-sender-address-does-not-match-nadia-slot' };
    if (!String(account.smtpRoute?.host || '').trim() || !Number.isInteger(Number(account.smtpRoute?.port)) || Number(account.smtpRoute.port) < 1 || Number(account.smtpRoute.port) > 65535) return { blocked: 'bound-smtp-route-incomplete' };
    // Decide on the exact bound account before any credential is opened. A refusal reserves nothing and claims nothing.
    const gate = gateOutboundRoute({ account, message: { ...candidate, from: exactEmail(account.email), authorization: outboundPackage }, consentVerifier });
    if (gate) return { blocked: 'outbound-authorization-refused', reasonCodes: gate.reasonCodes };
    try { openSmtpAccountCredential(account, encryptionKey); }
    catch { return { blocked: 'bound-smtp-credentials-unavailable' }; }
    const reserved = await tx.reserveOutboundSend({
      id: `frozen-${digest.slice(0, 32)}`, idempotencyKey: `frozen-effect:${digest}`,
      campaignId: snapshot.input?.campaign?.campaignId || null, inbox: senderSlot, recipientEmail: recipient,
      kind: 'initial', followup: 0, dailyCap: 1, hourlyCap: 1,
      minGapSeconds: Math.max(0, Number(canaryMinGapSeconds || 0), Number(account.minGapSeconds || 0)), now
    });
    if (!reserved.ok) return { blocked: `outbound-reservation-${reserved.reason}` };
    await tx.markOutboundReservation(reserved.reservation.id, 'dispatching', { effectDigest: digest, provider: 'smtp-relay' });
    const dispatching = {
      schemaVersion: 'uberbond.frozen-effect-execution.v1', effectDigest: digest,
      status: 'DISPATCHING', recipient, senderSlot, senderAddress: slotAddress,
      provider: 'smtp-relay', routeClass: participants.route.routeClass, routeDigest,
      reservationId: reserved.reservation.id, authorizedAt: authorization.approvedAt,
      dispatchClaimedAt: timestamp, dispatchAdapterCalls: null,
      providerCallAttempted: null, effectBoundaryCrossed: null, effectCapRemaining: 0
    };
    await tx.setSetting(executionKey(digest), dispatching);
    return { authorization, account, reservation: reserved.reservation, dispatching };
  });
  if (claim.blocked) return deny(claim.blocked, { effectCapRemaining: claim.prior?.effectCapRemaining ?? 1, ...(claim.reasonCodes ? { reasonCodes: claim.reasonCodes } : {}) });

  const message = { ...candidate, from: exactEmail(claim.account.email) };
  let providerResult;
  try { providerResult = await dispatch({ account: claim.account, encryptionKey, message: { ...message, authorization: outboundPackage }, consentVerifier }); }
  catch (error) { providerResult = { classification: 'UNCERTAIN', reasonCodes: ['smtp-provider-call-threw'], dispatchError: String(error?.message || error).slice(0, 300), automaticRetryAuthorized: false }; }
  const executedAt = new Date().toISOString();
  const rawClassification = providerResult && typeof providerResult === 'object' && !Array.isArray(providerResult)
    && typeof providerResult.classification === 'string' ? providerResult.classification : '';
  const providerReferenceId = typeof providerResult?.providerReferenceId === 'string'
    ? providerResult.providerReferenceId.trim().slice(0, 500) : '';
  // A REFUSED result that explicitly states no provider attempt and no boundary crossing is a pre-dispatch refusal: the adapter
  // decided before any credential open or transport call. Anything less explicit stays ambiguous below. Only the refusal is released.
  const preDispatchRefusal = rawClassification === 'REFUSED' && providerResult?.providerCallAttempted === false
    && providerResult?.effectBoundaryCrossed === false && !providerReferenceId;
  if (preDispatchRefusal) {
    const refusalCodes = Array.isArray(providerResult.reasonCodes)
      ? providerResult.reasonCodes.filter(code => typeof code === 'string').slice(0, 6).map(code => code.slice(0, 120))
      : [];
    const receipt = {
      provider: 'smtp-relay', classification: 'NOT_SENT', providerAccepted: false,
      providerReferenceId: null, providerMessageId: null,
      executedAt, recipient, sender: exactEmail(claim.account.email),
      authorizedDigest: digest, routeClass: participants.route.routeClass,
      deliveryState: 'NOT_SENT',
      dispatchAdapterCalls: 1, providerCallAttempted: false, effectBoundaryCrossed: false,
      effectLedger: { dispatchAdapterCalls: 1, providerCalls: 0, customerMessages: 0 },
      remainingEffectCap: 1,
      refusalReasonCodes: refusalCodes.length ? refusalCodes : ['smtp-dispatch-refused'],
      automaticRetryAuthorized: false
    };
    try {
      await store.transaction(async tx => {
        if (tx.pool) await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`frozen-prospect-effect:${digest}`]);
        const currentSettings = await tx.getSettings();
        const current = currentSettings[executionKey(digest)];
        if (!current || current.status !== 'DISPATCHING' || current.effectDigest !== digest) throw new Error('frozen-effect-dispatch-claim-lost-before-release');
        await tx.markOutboundReservation(claim.reservation.id, 'cancelled', { provider: 'smtp-relay', effectDigest: digest, reconciledAt: executedAt });
        await tx.setSetting(executionKey(digest), {
          ...current,
          status: 'NOT_SENT',
          dispatchAdapterCalls: 1,
          providerCallAttempted: false,
          effectBoundaryCrossed: false,
          effectCapRemaining: 1,
          releasedAt: executedAt,
          receipt
        });
      });
    } catch (error) {
      console.error('FROZEN_EFFECT_RELEASE_RECONCILIATION_REQUIRED ' + JSON.stringify({
        effectDigest: digest,
        error: String(error?.message || error).slice(0, 300),
        automaticRetryAuthorized: false
      }));
      // The claim was not released, so it still blocks a replay. Fail closed and surface the reconciliation need.
      return {
        ok: false,
        state: 'RECEIPT_PERSISTENCE_RECONCILIATION_REQUIRED',
        providerCalls: 0, dispatchAdapterCalls: 1,
        receipt,
        sendAuthority: false,
        automaticRetryAuthorized: false,
        reconciliationRequired: true
      };
    }
    return { ok: false, state: 'NOT_SENT', providerCalls: 0, dispatchAdapterCalls: 1, receipt, sendAuthority: false, automaticRetryAuthorized: false };
  }

  const accepted = rawClassification === 'ACCEPTED' && Boolean(providerReferenceId)
    && providerResult?.providerCallAttempted !== false && providerResult?.effectBoundaryCrossed !== false;
  const definitelyRejectedBeforeEffect = rawClassification === 'REJECTED'
    && providerResult?.providerCallAttempted === false && providerResult?.effectBoundaryCrossed === false;
  // Everything other than a receipt-backed acceptance or an explicit
  // pre-effect rejection is ambiguous. Keep recipient history blocking so a
  // different digest cannot turn a malformed provider result into a duplicate.
  const uncertain = !accepted && !definitelyRejectedBeforeEffect;
  const classification = accepted ? 'ACCEPTED' : definitelyRejectedBeforeEffect ? 'REJECTED' : 'UNCERTAIN';
  const providerCallAttempted = accepted ? true : definitelyRejectedBeforeEffect ? false
    : rawClassification === 'ACCEPTED' ? null
    : providerResult?.providerCallAttempted === true && providerResult?.effectBoundaryCrossed === true ? true
      : providerResult?.providerCallAttempted === false && providerResult?.effectBoundaryCrossed === false ? false : null;
  const effectBoundaryCrossed = providerCallAttempted;
  const providerCalls = providerCallAttempted === true ? 1 : providerCallAttempted === false ? 0 : null;
  const reasonCodes = Array.isArray(providerResult?.reasonCodes)
    ? providerResult.reasonCodes.filter(code => typeof code === 'string').slice(0, 6).map(code => code.slice(0, 120))
    : [];
  const providerMessageId = typeof providerResult?.messageId === 'string' && providerResult.messageId.trim()
    ? providerResult.messageId.trim().slice(0, 500) : candidate.messageId;
  const receipt = {
    provider: 'smtp-relay', classification, providerAccepted: accepted,
    providerReferenceId: providerReferenceId || null,
    providerMessageId,
    executedAt, recipient, sender: exactEmail(claim.account.email),
    authorizedDigest: digest, routeClass: participants.route.routeClass,
    deliveryState: accepted ? 'ACCEPTED_DELIVERY_NOT_CONFIRMED' : uncertain ? 'UNCERTAIN_REQUIRES_RECONCILIATION' : 'REJECTED',
    dispatchAdapterCalls: 1, providerCallAttempted, effectBoundaryCrossed,
    effectLedger: accepted ? { dispatchAdapterCalls: 1, providerCalls: 1, customerMessages: 1 }
      : uncertain ? { dispatchAdapterCalls: 1, providerCalls, customerMessages: 'UNKNOWN' }
        : { dispatchAdapterCalls: 1, providerCalls: 0, customerMessages: 0 },
    remainingEffectCap: 0,
    providerError: accepted || definitelyRejectedBeforeEffect ? null : {
      classification: 'UNCERTAIN',
      rawClassification: rawClassification.slice(0, 40) || null,
      reasonCodes: reasonCodes.length ? reasonCodes : ['provider-result-unconfirmed'],
      dispatchError: typeof providerResult?.dispatchError === 'string' ? providerResult.dispatchError.slice(0, 300) : null
    },
    automaticRetryAuthorized: false
  };

  // The provider result is the irrecoverable side of the effect boundary. Log a
  // minimal reconciliation receipt before any further database writes. No body,
  // subject, credentials, recipient, or sender address is included.
  console.info('FROZEN_EFFECT_PROVIDER_RESULT ' + JSON.stringify({
    effectDigest: digest,
    classification,
    providerAccepted: accepted,
    dispatchAdapterCalls: 1,
    providerCallAttempted,
    effectBoundaryCrossed,
    providerReferenceId: receipt.providerReferenceId,
    providerMessageId: receipt.providerMessageId,
    executedAt,
    automaticRetryAuthorized: false
  }));

  const checkpointStatus = accepted ? 'PROVIDER_ACCEPTED_CHECKPOINTED'
    : uncertain ? 'PROVIDER_UNCERTAIN_CHECKPOINTED' : 'PROVIDER_REJECTED_CHECKPOINTED';
  try {
    // Commit the provider result independently. A later reservation/event-ledger
    // failure must never erase the one fact that cannot safely be replayed.
    await store.transaction(async tx => {
      if (tx.pool) await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`frozen-prospect-effect:${digest}`]);
      const currentSettings = await tx.getSettings();
      const current = currentSettings[executionKey(digest)];
      if (!current || current.status !== 'DISPATCHING' || current.effectDigest !== digest) throw new Error('frozen-effect-dispatch-claim-lost-after-provider-call');
      await tx.setSetting(executionKey(digest), {
        ...current,
        status: checkpointStatus,
        dispatchAdapterCalls: 1,
        providerCallAttempted,
        effectBoundaryCrossed,
        effectCapRemaining: 0,
        receipt
      });
    });
  } catch (error) {
    console.error('FROZEN_EFFECT_PROVIDER_CHECKPOINT_FAILED ' + JSON.stringify({
      effectDigest: digest,
      classification: classification || 'UNKNOWN',
      providerReferenceId: receipt.providerReferenceId,
      providerMessageId: receipt.providerMessageId,
      error: String(error?.message || error).slice(0, 300),
      automaticRetryAuthorized: false
    }));
    return {
      ok: false,
      state: 'RECEIPT_PERSISTENCE_RECONCILIATION_REQUIRED',
      providerCalls, dispatchAdapterCalls: 1,
      receipt,
      sendAuthority: false,
      automaticRetryAuthorized: false,
      reconciliationRequired: true
    };
  }

  try {
    // Secondary ledgers are reconciled only after the provider result is already
    // durable. Their failure cannot reopen the effect cap or authorize a replay.
    await store.transaction(async tx => {
      if (tx.pool) await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`frozen-prospect-effect:${digest}`]);
      const currentSettings = await tx.getSettings();
      const current = currentSettings[executionKey(digest)];
      if (!current || current.status !== checkpointStatus || current.effectDigest !== digest) throw new Error('frozen-effect-provider-checkpoint-lost-before-ledger-reconcile');
      await tx.markOutboundReservation(claim.reservation.id, accepted ? 'sent' : uncertain ? 'uncertain' : 'cancelled', {
        provider: 'smtp-relay', providerReferenceId: providerReferenceId || null,
        providerMessageId, effectDigest: digest, reconciledAt: executedAt
      });
      await tx.recordOutboundEvent({
        id: `frozen-${digest}`, inbox: senderSlot, eventType: accepted ? 'sent' : uncertain ? 'send_uncertain' : 'send_failed',
        providerEventId: providerReferenceId || null,
        recipientEmail: recipient, occurredAt: executedAt,
        detail: { effectDigest: digest, routeClass: participants.route.routeClass, provider: 'smtp-relay', providerReferenceId: providerReferenceId || null, providerMessageId }
      }, thresholds);
      await tx.setSetting(executionKey(digest), {
        ...current,
        status: accepted ? 'SENT' : uncertain ? 'UNCERTAIN' : 'PROVIDER_REJECTED',
        dispatchAdapterCalls: 1,
        providerCallAttempted,
        effectBoundaryCrossed,
        effectCapRemaining: 0,
        ledgerReconciledAt: executedAt,
        receipt
      });
    });
  } catch (error) {
    console.error('FROZEN_EFFECT_LEDGER_RECONCILIATION_REQUIRED ' + JSON.stringify({
      effectDigest: digest,
      checkpointStatus,
      error: String(error?.message || error).slice(0, 300),
      automaticRetryAuthorized: false
    }));
    return {
      ok: false,
      state: 'LEDGER_RECONCILIATION_REQUIRED',
      providerCalls, dispatchAdapterCalls: 1,
      receipt,
      sendAuthority: false,
      automaticRetryAuthorized: false,
      reconciliationRequired: true
    };
  }

  return { ok: accepted, state: accepted ? 'SENT_EXACTLY_ONCE' : uncertain ? 'PROVIDER_RESULT_UNCERTAIN' : 'PROVIDER_REJECTED', providerCalls, dispatchAdapterCalls: 1, receipt, sendAuthority: false, automaticRetryAuthorized: false };
}
