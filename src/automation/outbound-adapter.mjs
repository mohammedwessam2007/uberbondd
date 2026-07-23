import crypto from 'node:crypto';

export class OutboundAdapterError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'OutboundAdapterError';
    this.code = code;
  }
}

/**
 * The provider-agnostic contract every outbound adapter must satisfy (spec section F). Real
 * providers (Gmail today, via src/gmail.mjs) are wired in separately; this module defines the
 * shape everything -- fake or real -- must honor, plus the one fake provider this session builds.
 * The safe-by-default posture (provider=test, enabled=false, dryRun=true, liveSendApproved=false)
 * already lives in src/config.mjs and is not duplicated here; this module is about the send-path
 * contract itself: idempotency, reservation-before-send, duplicate prevention, and honest
 * uncertain-result handling.
 */
export const OUTBOUND_ADAPTER_CONTRACT = Object.freeze([
  'reserve', // (idempotencyKey, envelope) -> { ok, reservationId, duplicate }
  'send',    // (reservationId, envelope) -> { status: 'sent' | 'uncertain' | 'failed', providerMessageId? }
  'name'     // provider identity string, must equal cfg.outbound.provider for the active adapter
]);

export function assertAdapterContract(adapter) {
  for (const method of OUTBOUND_ADAPTER_CONTRACT) {
    if (adapter[method] === undefined) throw new OutboundAdapterError('adapter-contract-violation', `Adapter is missing required member: ${method}`);
  }
  if (typeof adapter.reserve !== 'function' || typeof adapter.send !== 'function') {
    throw new OutboundAdapterError('adapter-contract-violation', 'reserve and send must be functions');
  }
  return true;
}

/**
 * A deterministic in-memory fake outbound provider for tests and shadow/dry-run automation. It
 * never performs network I/O. Reservations are keyed by idempotencyKey so a duplicate reserve for
 * the same key returns the original reservation instead of creating a second one -- this is the
 * fake-provider half of duplicate-send prevention; the persistent half (across process restarts)
 * is store.reserveOutboundSend, already exercised by the existing pipeline and its tests.
 */
export function createFakeOutboundProvider({ uncertainRate = 0, failRate = 0, clock = () => new Date() } = {}) {
  const reservations = new Map();
  const sent = new Map();
  return {
    name: 'test',
    async reserve(idempotencyKey, envelope = {}) {
      if (!idempotencyKey) throw new OutboundAdapterError('reservation-key-required');
      const existing = reservations.get(idempotencyKey);
      if (existing) return { ok: true, reservationId: existing.reservationId, duplicate: true };
      const reservationId = `fake_res_${crypto.randomBytes(8).toString('hex')}`;
      reservations.set(idempotencyKey, { reservationId, envelope, reservedAt: clock().toISOString(), consumed: false });
      return { ok: true, reservationId, duplicate: false };
    },
    async send(reservationId) {
      const reservation = [...reservations.values()].find(item => item.reservationId === reservationId);
      if (!reservation) throw new OutboundAdapterError('reservation-not-found');
      if (reservation.consumed) {
        const previous = sent.get(reservationId);
        return { ...previous, duplicate: true };
      }
      reservation.consumed = true;
      const roll = crypto.randomBytes(4).readUInt32BE(0) / 0xffffffff;
      let result;
      if (roll < failRate) result = { status: 'failed', providerMessageId: null, code: 'fake-provider-simulated-failure' };
      else if (roll < failRate + uncertainRate) result = { status: 'uncertain', providerMessageId: null, code: 'fake-provider-simulated-timeout' };
      else result = { status: 'sent', providerMessageId: `fake_msg_${crypto.randomBytes(8).toString('hex')}`, sentAt: clock().toISOString() };
      sent.set(reservationId, result);
      return { ...result, duplicate: false };
    },
    _debug: { reservations, sent }
  };
}
