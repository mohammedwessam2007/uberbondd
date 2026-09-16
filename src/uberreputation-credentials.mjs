import crypto from 'node:crypto';

const clean = v => String(v ?? '').trim();
const sha256 = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uniq = xs => [...new Set(xs)];

const ALLOWED_METRICS = new Set(['COMPLAINT_RATE_MAX','BOUNCE_RATE_MAX','ENGAGEMENT_RATE_MIN','AUTHENTICATED_OWNERSHIP','HISTORICAL_SEND_COUNT_MIN','SUPPRESSION_COMPLIANCE']);

export function compileReputationCredential(raw = {}, { now = new Date() } = {}) {
  const reasons = [];
  const subjectId = clean(raw.subjectId);
  const issuerId = clean(raw.issuerId);
  const expiresAt = Date.parse(String(raw.expiresAt || ''));
  if (!subjectId) reasons.push('subject-id-required');
  if (!issuerId) reasons.push('issuer-id-required');
  if (raw.issuerAuthorized !== true) reasons.push('issuer-authorization-required');
  if (!clean(raw.issuerEvidenceRef)) reasons.push('issuer-evidence-required');
  if (!Number.isFinite(expiresAt) || expiresAt <= new Date(now).getTime()) reasons.push('credential-expired-or-undated');
  const claims = (raw.claims || []).map(claim => ({ metric: clean(claim?.metric).toUpperCase(), comparator: clean(claim?.comparator), threshold: Number(claim?.threshold), evidenceRef: clean(claim?.evidenceRef) }));
  if (!claims.length) reasons.push('reputation-claims-required');
  for (const claim of claims) {
    if (!ALLOWED_METRICS.has(claim.metric)) reasons.push(`unsupported-metric:${claim.metric || 'unknown'}`);
    if (!claim.evidenceRef) reasons.push(`claim-evidence-required:${claim.metric || 'unknown'}`);
    if (!Number.isFinite(claim.threshold) && claim.metric !== 'AUTHENTICATED_OWNERSHIP' && claim.metric !== 'SUPPRESSION_COMPLIANCE') reasons.push(`claim-threshold-required:${claim.metric}`);
  }
  const payload = { subjectId: subjectId || null, issuerId: issuerId || null, claims, expiresAt: Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : null };
  return {
    ...payload,
    credentialId: `ubrep_${sha256(payload)}`,
    valid: reasons.length === 0,
    reasonCodes: uniq(reasons),
    receiverAdoptionAssumed: false,
    automaticTrustAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'This is a portable evidence credential canary. Existing mailbox providers are not assumed to understand or honor it, so it cannot replace current sender reputation or warmup by itself.'
  };
}
