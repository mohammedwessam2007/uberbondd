import crypto from 'node:crypto';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value ?? '').trim();
const uniq = values => [...new Set(values)];

export function issueRecipientAttentionPermit(raw = {}, { now = new Date() } = {}) {
  const reasons = [];
  const recipientId = clean(raw.recipientId);
  const permitId = clean(raw.permitId);
  const expiresAt = Date.parse(String(raw.expiresAt || ''));
  const current = new Date(now).getTime();
  if (!recipientId) reasons.push('recipient-id-required');
  if (!permitId) reasons.push('permit-id-required');
  if (raw.recipientAuthorized !== true) reasons.push('recipient-authorization-required');
  if (!clean(raw.authorizationEvidenceRef)) reasons.push('recipient-authorization-evidence-required');
  if (!Number.isFinite(expiresAt) || expiresAt <= current) reasons.push('permit-expired-or-undated');
  if (!Array.isArray(raw.acceptedPurposes) || !raw.acceptedPurposes.length) reasons.push('accepted-purpose-required');
  const permit = {
    permitId: permitId || null,
    recipientId: recipientId || null,
    acceptedPurposes: uniq((raw.acceptedPurposes || []).map(clean).filter(Boolean)).sort(),
    maxMessages: Number.isFinite(Number(raw.maxMessages)) ? Math.max(1, Math.floor(Number(raw.maxMessages))) : 1,
    expiresAt: Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : null,
    authorizationEvidenceRef: clean(raw.authorizationEvidenceRef) || null,
    valid: reasons.length === 0,
    reasonCodes: uniq(reasons)
  };
  return { ...permit, permitDigest: `ubpermit_${sha256(permit)}` };
}

export function evaluateAttentionRequest({ permit, request = {}, now = new Date() } = {}) {
  const normalized = issueRecipientAttentionPermit(permit || {}, { now });
  const reasons = [...normalized.reasonCodes];
  const purpose = clean(request.purpose);
  const requestId = clean(request.requestId);
  const evidenceRefs = uniq((request.evidenceRefs || []).map(clean).filter(Boolean)).sort();
  if (!requestId) reasons.push('request-id-required');
  if (!purpose || !normalized.acceptedPurposes.includes(purpose)) reasons.push('purpose-not-permitted');
  if (!evidenceRefs.length) reasons.push('request-evidence-required');
  if (request.senderIdentityVerified !== true) reasons.push('sender-identity-proof-required');
  if (request.relevanceScore != null && (!Number.isFinite(Number(request.relevanceScore)) || Number(request.relevanceScore) < 0 || Number(request.relevanceScore) > 1)) reasons.push('relevance-score-out-of-range');
  if (request.stakeAmount != null && Number(request.stakeAmount) < 0) reasons.push('invalid-stake');
  const accepted = reasons.length === 0;
  const seed = { permitDigest: normalized.permitDigest, requestId, purpose, evidenceRefs, accepted, reasons: uniq(reasons) };
  return {
    ...seed,
    decisionId: `ubattention_${sha256(seed)}`,
    state: accepted ? 'RECIPIENT_PERMIT_MATCHED' : 'REFUSED',
    automaticDeliveryAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'This protocol proves only that a recipient-issued permit and a request are structurally compatible. Delivery still requires an adopted transport and an independently authorized external effect.'
  };
}
