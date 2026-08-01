// Canon/V3 integration -- premerge audit P0-002 (dispatch) and P1-013 (reserved domains).
//
// V3's runRevenueCycle dispatched like this:
//   dispatch = await adapters.dispatchOutbound?.(...) || jobs.map(job => ({ type: 'sent', ... }))
// -- when no live adapter was wired in (the ordinary case for every environment that has not
// explicitly configured a real sender), it silently fabricated 'sent' events for every planned
// send. Production code must never be able to record delivery that never happened.
//
// This module's contract: outside an explicitly-typed simulation provider, a missing live adapter
// produces a 'blocked' reservation and a canonical audit event -- never a 'sent' outboundEvent.
// A simulation provider is only ever allowed to write a distinctly-named 'simulated_sent' event,
// so a synthetic result can never be mistaken for (or accidentally reused as) real delivery.
import { isReservedDomain } from './reserved-domains.mjs';
import { emailDomain } from './send-safety.mjs';

export const CANONICAL_DISPATCH_AUDIT_EVENTS = Object.freeze({
  BLOCKED_NO_PROVIDER: 'canon_dispatch_blocked_no_live_provider',
  BLOCKED_RESERVED_DOMAIN: 'canon_dispatch_blocked_reserved_domain',
  DISPATCHED_LIVE: 'canon_dispatch_live_sent',
  DISPATCHED_SIMULATED: 'canon_dispatch_simulated_sent',
  DISPATCH_FAILED: 'canon_dispatch_failed'
});

/**
 * Dispatches one already-reserved outbound send (store.reserveOutboundSend's result -- see
 * send-eligibility.mjs). `provider` must be `{ send: async (reservation) => ({...}) }` and is only
 * ever invoked when `simulation !== true`; when `simulation === true`, `provider` is ignored
 * entirely and a `simulated_sent` outcome is recorded instead. Never both.
 */
export async function dispatchReservation(store, reservation, { provider = null, simulation = false } = {}) {
  const domain = emailDomain(reservation.recipientEmail);
  if (isReservedDomain(domain) && simulation !== true) {
    await store.markOutboundReservation(reservation.id, 'blocked', { blockReason: 'reserved-domain-outside-simulation' });
    await store.log(CANONICAL_DISPATCH_AUDIT_EVENTS.BLOCKED_RESERVED_DOMAIN, { reservationId: reservation.id, domain });
    return { status: 'blocked', reason: 'reserved-domain-outside-simulation' };
  }

  if (simulation === true) {
    const occurredAt = new Date().toISOString();
    await store.markOutboundReservation(reservation.id, 'simulated_sent', { dispatchedAt: occurredAt });
    // Deliberately NOT store.recordOutboundEvent('sent', ...) -- 'simulated_sent' is its own event
    // type below so it can never feed sender-health pause thresholds (hard_bounce/complaint/sent)
    // meant to reflect only real delivery.
    await store.recordOutboundEvent({ inbox: reservation.inbox, eventType: 'simulated_sent', prospectId: reservation.prospectId, recipientEmail: reservation.recipientEmail, occurredAt, detail: { reservationId: reservation.id } });
    await store.log(CANONICAL_DISPATCH_AUDIT_EVENTS.DISPATCHED_SIMULATED, { reservationId: reservation.id });
    return { status: 'simulated_sent' };
  }

  if (!provider || typeof provider.send !== 'function') {
    await store.markOutboundReservation(reservation.id, 'blocked', { blockReason: 'no-live-provider' });
    await store.log(CANONICAL_DISPATCH_AUDIT_EVENTS.BLOCKED_NO_PROVIDER, { reservationId: reservation.id });
    return { status: 'blocked', reason: 'no-live-provider' };
  }

  await store.markOutboundReservation(reservation.id, 'dispatching', {});
  try {
    const result = await provider.send(reservation);
    const occurredAt = new Date().toISOString();
    await store.markOutboundReservation(reservation.id, 'sent', { sentAt: occurredAt, providerMessageId: result?.messageId || null });
    await store.recordOutboundEvent({ inbox: reservation.inbox, eventType: 'sent', prospectId: reservation.prospectId, recipientEmail: reservation.recipientEmail, occurredAt, detail: { reservationId: reservation.id, messageId: result?.messageId || null } });
    await store.log(CANONICAL_DISPATCH_AUDIT_EVENTS.DISPATCHED_LIVE, { reservationId: reservation.id });
    return { status: 'sent', result };
  } catch (error) {
    const occurredAt = new Date().toISOString();
    await store.markOutboundReservation(reservation.id, 'uncertain', { lastError: String(error?.message || error) });
    await store.recordOutboundEvent({ inbox: reservation.inbox, eventType: 'send_uncertain', prospectId: reservation.prospectId, recipientEmail: reservation.recipientEmail, occurredAt, detail: { reservationId: reservation.id, error: String(error?.message || error) } });
    await store.log(CANONICAL_DISPATCH_AUDIT_EVENTS.DISPATCH_FAILED, { reservationId: reservation.id, error: String(error?.message || error) });
    return { status: 'uncertain', error };
  }
}
