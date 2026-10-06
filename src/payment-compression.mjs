// Payment compression + cleared-payment truth.
// Compression = shortest lawful path from "yes" to a payable request, chosen
// from rails that the existing payment-rail doctor reports as ready.
// Truth = a payment is CLEARED only with provider-origin evidence; nothing in
// this module can mark anything paid.
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PAYMENT_COMPRESSION_VERSION = 'uberbond.payment-compression.v1';
const READY = new Set(['LIVE_READY', 'READY_FOR_LIVE', 'COLLECTION_READY']);

/** rails: [{ provider, state, regions?, frictionSteps? }] from a verified rail/account readiness surface.
 * COLLECTION_READY is admitted only for the manual Contra workflow; it means the
 * account can accept a payment request, never that cash is cleared. */
export function compressPayment({ rails = [], buyerRegion = null, amountCents = 0, currency = 'USD' } = {}) {
  const usable = rails.filter(r => READY.has(r.state) && (!buyerRegion || !r.regions || r.regions.includes(buyerRegion)));
  const sandboxOnly = rails.filter(r => r.state === 'READY_FOR_SANDBOX');
  if (!(amountCents > 0)) return { ok: false, state: 'NO_AMOUNT', outboundAuthority: 'NONE' };
  if (!usable.length) return { ok: false, state: sandboxOnly.length ? 'ONLY_SANDBOX_RAILS_READY' : 'NO_LIVE_RAIL_READY', blockers: rails.map(r => ({ provider: r.provider, state: r.state })), note: 'Do not quote a payment link until a live rail is ready; sandbox links are never revenue.', outboundAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } };
  const best = [...usable].sort((a, b) => (a.frictionSteps ?? 3) - (b.frictionSteps ?? 3) || String(a.provider).localeCompare(String(b.provider)))[0];
  return { ok: true, state: 'PAYMENT_PATH_COMPRESSED', provider: best.provider, amountCents, currency, buyerSteps: best.frictionSteps ?? 3,
    plan: ['send fixed scope + price in writing', `send ${best.provider} payment request`, 'wait for provider evidence (never self-report)', 'start delivery only after cleared evidence'],
    fallbackProviders: usable.filter(r => r !== best).map(r => r.provider), outboundAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } };
}

/** Cleared truth. Anything short of full provider evidence is NOT cleared. */
export function assessPaymentEvidence(e = {}) {
  const reasons = [];
  if (!e.provider) reasons.push('provider-missing');
  if (!e.providerTransactionId) reasons.push('provider-transaction-id-missing');
  if (!(Number(e.grossCents) > 0)) reasons.push('gross-amount-missing');
  if (!e.currency) reasons.push('currency-missing');
  if (e.status !== 'cleared') reasons.push('status-not-cleared');
  if (!e.clearedAt || !Number.isFinite(Date.parse(e.clearedAt)) || Date.parse(e.clearedAt) > Date.now() + 60000) reasons.push('cleared-timestamp-invalid');
  if (e.source !== 'provider') reasons.push('evidence-not-provider-origin');
  const reversed = Boolean(e.refundedCents > 0 || e.disputed);
  const gross = Number(e.grossCents) || 0;
  const net = Math.max(0, gross - (Number(e.feeCents) || 0) - (Number(e.refundedCents) || 0));
  return { cleared: reasons.length === 0 && !reversed, reasons: reversed ? [...reasons, 'reversed-or-disputed'] : reasons, grossCents: gross, netCents: net, reversed, note: 'Original payment is preserved; reversals subtract, never erase.' };
}
