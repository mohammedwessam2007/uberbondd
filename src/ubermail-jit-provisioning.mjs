import crypto from 'node:crypto';

const clean = v => String(v ?? '').trim();
const sha256 = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uniq = xs => [...new Set(xs)];

export function compileJitProvisioningPlan(raw = {}, { now = new Date() } = {}) {
  const reasons = [];
  const planId = clean(raw.planId);
  const rootDomain = clean(raw.rootDomain).toLowerCase();
  if (!planId) reasons.push('plan-id-required');
  if (!rootDomain) reasons.push('root-domain-required');
  if (raw.domainOwnerAuthorized !== true) reasons.push('domain-owner-authorization-required');
  if (!clean(raw.domainAuthorityRef)) reasons.push('domain-authority-receipt-required');
  if (raw.providerTermsCompatible !== true) reasons.push('provider-terms-compatibility-required');
  if (raw.persistentSenderIdentity !== true) reasons.push('persistent-sender-identity-required');
  if (raw.disposableIdentityRotation === true || raw.deleteAfterBatch === true) reasons.push('disposable-identity-rotation-forbidden');
  if (raw.dmarcConfigured !== true || raw.dkimConfigured !== true || raw.spfConfigured !== true) reasons.push('sender-authentication-plan-required');
  const requested = Number(raw.requestedMailboxes || 0);
  if (!Number.isFinite(requested) || requested < 1 || requested > 100000) reasons.push('requested-mailbox-count-invalid');
  const expiresAt = raw.authorizationExpiresAt ? Date.parse(String(raw.authorizationExpiresAt)) : null;
  if (expiresAt != null && (!Number.isFinite(expiresAt) || expiresAt <= new Date(now).getTime())) reasons.push('provisioning-authorization-expired');
  const payload = {
    planId: planId || null,
    rootDomain: rootDomain || null,
    requestedMailboxes: Number.isFinite(requested) ? Math.floor(requested) : 0,
    provider: clean(raw.provider).toLowerCase() || null,
    persistentSenderIdentity: raw.persistentSenderIdentity === true,
    dnsAuth: { spf: raw.spfConfigured === true, dkim: raw.dkimConfigured === true, dmarc: raw.dmarcConfigured === true }
  };
  return {
    ...payload,
    provisioningPlanDigest: `ubjit_${sha256(payload)}`,
    readyForAuthorizedExecution: reasons.length === 0,
    reasonCodes: uniq(reasons),
    automaticProvisioningAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'A valid plan is not a created mailbox or reputation asset. Provisioning, DNS changes, spend and provider mutations require separate authority and external receipts.'
  };
}
