import crypto from 'node:crypto';

const clean = v => String(v ?? '').trim();
const sha256 = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uniq = xs => [...new Set(xs)];

export function compileAttentionStake(raw = {}, { now = new Date() } = {}) {
  const reasons = [];
  const stakeId = clean(raw.stakeId);
  const requestId = clean(raw.requestId);
  const senderId = clean(raw.senderId);
  const recipientId = clean(raw.recipientId);
  const amount = Number(raw.amount);
  if (!stakeId) reasons.push('stake-id-required');
  if (!requestId) reasons.push('request-id-required');
  if (!senderId || !recipientId) reasons.push('sender-and-recipient-required');
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000) reasons.push('stake-amount-invalid');
  if (raw.senderAuthorized !== true) reasons.push('sender-stake-authorization-required');
  if (raw.recipientTermsAccepted !== true) reasons.push('recipient-stake-terms-required');
  if (!clean(raw.termsRef)) reasons.push('stake-terms-reference-required');
  const expiresAt = Date.parse(String(raw.expiresAt || ''));
  if (!Number.isFinite(expiresAt) || expiresAt <= new Date(now).getTime()) reasons.push('stake-expired-or-undated');
  const payload = { stakeId: stakeId || null, requestId: requestId || null, senderId: senderId || null, recipientId: recipientId || null, amount: Number.isFinite(amount) ? amount : null, currency: clean(raw.currency).toUpperCase() || null, expiresAt: Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : null };
  return {
    ...payload,
    stakeDigest: `ubstake_${sha256(payload)}`,
    valid: reasons.length === 0,
    reasonCodes: uniq(reasons),
    settlementState: 'PROPOSAL_ONLY',
    automaticMoneyMovementAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'This object models attention economics only. It cannot transfer money, escrow value, create a wallet, or settle funds without separate authorized payment infrastructure.'
  };
}

export function settleAttentionStakeProposal({ stake, outcome } = {}) {
  if (!stake?.valid) return { state:'REFUSED', reasonCodes:['valid-stake-required'], automaticMoneyMovementAuthority:false };
  const normalized = clean(outcome).toUpperCase();
  if (!['ENGAGED','REJECTED_IRRELEVANT','EXPIRED'].includes(normalized)) return { state:'REFUSED', reasonCodes:['recognized-outcome-required'], automaticMoneyMovementAuthority:false };
  const proposedDisposition = normalized === 'ENGAGED' ? 'RETURN_TO_SENDER' : normalized === 'REJECTED_IRRELEVANT' ? 'TRANSFER_TO_RECIPIENT' : 'RETURN_TO_SENDER';
  return { state:'SETTLEMENT_PROPOSED', stakeId:stake.stakeId, outcome:normalized, proposedDisposition, automaticMoneyMovementAuthority:false, externalEffectAuthority:'NONE' };
}
