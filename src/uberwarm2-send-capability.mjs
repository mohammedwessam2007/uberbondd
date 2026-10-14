// One-shot authority to transmit exactly one owner-seed probe.
//
// The executor issues this only after the durable PostgreSQL claim has been
// taken, and revokes it when the transport call returns or throws. The SMTP
// bridge consumes it before any socket is opened. Without a live capability the
// bridge sends nothing, so a caller holding the bridge object cannot send
// around the claim, the approval, or the daily caps.
//
// A capability is bound to the exact send it authorizes: sender, seed, probe
// identity, subject, body, purpose and reservation key. The adversarial review
// minted a capability for probe A and spent it on probe B. The binding digest
// closes that. Consumption requires a matching binding.
//
// This is process-local. The durable claim remains the cross-process boundary.
// In-process code that imports this module is inside the trust boundary, which
// the review recorded as a residual.
import { createHash } from 'node:crypto';

export const UBERWARM2_SEND_CAPABILITY_VERSION = 'uberbond.uberwarm2-send-capability.v2';

const RESERVATION_KEY = /^uberwarm2-seed:[a-f0-9]{64}$/;
const DEFAULT_TTL_MS = 60 * 1000;
const issued = new Map();

function validKey(reservationKey) {
  return typeof reservationKey === 'string' && RESERVATION_KEY.test(reservationKey);
}

// Every field is coerced to a string before hashing, so a binding cannot be
// satisfied by an object whose string conversion changes between reads.
export function sendBindingDigest(binding = {}) {
  const field = name => (typeof binding[name] === 'string' ? binding[name] : '\u0000');
  return createHash('sha256').update(JSON.stringify({
    from: field('from'), to: field('to'), probeId: field('probeId'),
    subject: field('subject'), body: field('body'),
    permittedPurpose: field('permittedPurpose'), reservationKey: field('reservationKey'),
  })).digest('hex');
}

export function issueSendCapability(reservationKey, binding, { ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!validKey(reservationKey)) throw new Error('invalid-reservation-key');
  if (!binding || binding.reservationKey !== reservationKey) throw new Error('binding-does-not-match-reservation');
  if (issued.has(reservationKey)) throw new Error('send-capability-already-issued');
  issued.set(reservationKey, {
    digest: sendBindingDigest(binding),
    expiresAt: Date.now() + Math.max(1, Math.floor(Number(ttlMs) || DEFAULT_TTL_MS)),
  });
  return true;
}

// Consumes the capability only when the binding matches and it is still live.
// A mismatch leaves the capability in place for the send it was issued for.
// Success consumes it, so one claim yields at most one transmission.
export function consumeSendCapability(reservationKey, binding) {
  if (!validKey(reservationKey)) return false;
  const entry = issued.get(reservationKey);
  if (!entry || Date.now() > entry.expiresAt) { issued.delete(reservationKey); return false; }
  if (entry.digest !== sendBindingDigest({ ...binding, reservationKey })) return false;
  issued.delete(reservationKey);
  return true;
}

export function revokeSendCapability(reservationKey) {
  if (validKey(reservationKey)) issued.delete(reservationKey);
  return true;
}

export function hasSendCapability(reservationKey, binding) {
  if (!validKey(reservationKey)) return false;
  const entry = issued.get(reservationKey);
  return Boolean(entry) && Date.now() <= entry.expiresAt
    && entry.digest === sendBindingDigest({ ...binding, reservationKey });
}
