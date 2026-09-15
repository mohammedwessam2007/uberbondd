import crypto from 'node:crypto';

const clean = v => String(v ?? '').trim();
const sha256 = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uniq = xs => [...new Set(xs)];

export function admitPermissionedGateway(raw = {}, { now = new Date(), maxEvidenceAgeHours = 24 } = {}) {
  const reasons = [];
  const nodeId = clean(raw.nodeId);
  const observed = Date.parse(String(raw.observedAt || ''));
  const ageHours = Number.isFinite(observed) ? (new Date(now).getTime() - observed) / 3_600_000 : Infinity;
  if (!nodeId) reasons.push('node-id-required');
  if (raw.operatorAuthorized !== true) reasons.push('operator-authorization-required');
  if (!clean(raw.operatorAuthorityRef)) reasons.push('operator-authority-receipt-required');
  if (raw.networkUsePermitted !== true) reasons.push('network-use-permission-required');
  if (raw.providerTermsCompatible !== true) reasons.push('provider-terms-compatibility-required');
  if (raw.cleanIpEvidenceVerified !== true) reasons.push('clean-ip-evidence-required');
  if (raw.residentialIpEvasion === true || raw.datacenterBlockBypassIntent === true) reasons.push('ip-evasion-forbidden');
  if (!Number.isFinite(ageHours) || ageHours < -0.05 || ageHours > maxEvidenceAgeHours) reasons.push('gateway-evidence-stale-or-undated');
  const allowedWorkloads = uniq((raw.allowedWorkloads || []).map(clean).filter(Boolean)).sort();
  if (!allowedWorkloads.length) reasons.push('allowed-workload-class-required');
  const record = { nodeId: nodeId || null, allowedWorkloads, ready: reasons.length === 0, reasonCodes: uniq(reasons), operatorAuthorityRef: clean(raw.operatorAuthorityRef) || null };
  return { ...record, admissionId: `ubdepin_${sha256(record)}`, externalEffectAuthority: 'NONE' };
}
