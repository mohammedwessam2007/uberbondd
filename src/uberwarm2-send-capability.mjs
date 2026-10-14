// One-shot authority to transmit exactly one owner-seed probe.
//
// The executor issues this only after the durable PostgreSQL claim has been
// taken, and revokes it when the transport call returns or throws. The SMTP
// bridge consumes it before any socket is opened. Without a live capability the
// bridge sends nothing, so a caller holding the bridge object cannot send
// around the claim, the approval, or the daily caps.
//
// This is process-local. The durable claim remains the cross-process boundary;
// this module makes a direct transport call without a claim impossible within a
// process, which is the bypass the adversarial review reproduced.
export const UBERWARM2_SEND_CAPABILITY_VERSION = 'uberbond.uberwarm2-send-capability.v1';

const RESERVATION_KEY = /^uberwarm2-seed:[a-f0-9]{64}$/;
const DEFAULT_TTL_MS = 60 * 1000;
const issued = new Map();

function validKey(reservationKey) {
  return typeof reservationKey === 'string' && RESERVATION_KEY.test(reservationKey);
}

export function issueSendCapability(reservationKey, { ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!validKey(reservationKey)) throw new Error('invalid-reservation-key');
  if (issued.has(reservationKey)) throw new Error('send-capability-already-issued');
  issued.set(reservationKey, Date.now() + Math.max(1, Math.floor(Number(ttlMs) || DEFAULT_TTL_MS)));
  return true;
}

// Consumes the capability. A second call for the same key returns false even
// if the first one succeeded, so one claim yields at most one transmission.
export function consumeSendCapability(reservationKey) {
  if (!validKey(reservationKey)) return false;
  const expiresAt = issued.get(reservationKey);
  issued.delete(reservationKey);
  return expiresAt !== undefined && Date.now() <= expiresAt;
}

export function revokeSendCapability(reservationKey) {
  if (validKey(reservationKey)) issued.delete(reservationKey);
  return true;
}

export function hasSendCapability(reservationKey) {
  if (!validKey(reservationKey)) return false;
  const expiresAt = issued.get(reservationKey);
  return expiresAt !== undefined && Date.now() <= expiresAt;
}
