import crypto from 'node:crypto';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value ?? '').trim();
const uniq = values => [...new Set(values)];

export function evaluateZeroCostResource(raw = {}, { now = new Date() } = {}) {
  const reasons = [];
  const resourceId = clean(raw.resourceId);
  const provider = clean(raw.provider);
  const expiresAtMs = raw.expiresAt ? Date.parse(String(raw.expiresAt)) : null;
  if (!resourceId) reasons.push('resource-id-required');
  if (!provider) reasons.push('provider-required');
  if (raw.eligibilityVerified !== true) reasons.push('eligibility-not-verified');
  if (!clean(raw.eligibilityEvidenceRef)) reasons.push('eligibility-evidence-required');
  if (raw.allowedUseVerified !== true) reasons.push('allowed-use-not-verified');
  if (raw.fakeAccountRequired === true || raw.fakeProjectRequired === true || raw.identityMisrepresentationRequired === true) reasons.push('false-eligibility-forbidden');
  if (raw.autoApplyWithoutOwnerAuthority === true) reasons.push('automatic-application-forbidden');
  if (expiresAtMs != null && (!Number.isFinite(expiresAtMs) || expiresAtMs <= new Date(now).getTime())) reasons.push('resource-expired');
  const units = Number(raw.availableUnits || 0);
  if (!Number.isFinite(units) || units < 0) reasons.push('available-units-invalid');
  const record = {
    resourceId: resourceId || null,
    provider: provider || null,
    kind: clean(raw.kind).toUpperCase() || null,
    availableUnits: Number.isFinite(units) && units >= 0 ? units : 0,
    unit: clean(raw.unit) || null,
    expiresAt: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : null,
    eligible: reasons.length === 0,
    reasonCodes: uniq(reasons),
    eligibilityEvidenceRef: clean(raw.eligibilityEvidenceRef) || null,
    allowedUseRef: clean(raw.allowedUseRef) || null
  };
  return { ...record, resourceReceiptId: `ubgrant_${sha256(record)}`, externalEffectAuthority: 'NONE' };
}

export function compileZeroCostPortfolio({ resources = [], now = new Date() } = {}) {
  const rows = resources.map(resource => evaluateZeroCostResource(resource, { now }));
  const eligible = rows.filter(row => row.eligible);
  const byKind = {};
  for (const row of eligible) byKind[row.kind || 'UNKNOWN'] = (byKind[row.kind || 'UNKNOWN'] || 0) + row.availableUnits;
  return {
    state: eligible.length ? 'ELIGIBLE_RESOURCES_FOUND' : 'NO_VERIFIED_RESOURCE',
    eligible,
    rejected: rows.filter(row => !row.eligible),
    totalsByKind: byKind,
    automaticApplicationAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'Discovery and eligibility verification do not create provider accounts, credits, applications, deployments, or spend authority.'
  };
}
