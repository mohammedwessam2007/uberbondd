import crypto from 'node:crypto';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value ?? '').trim();
const uniq = values => [...new Set(values)];
const MATURITY = new Set(['TODAY','NEAR_FUTURE','RESEARCH','SPECULATIVE']);

export function evaluateSubstitutionMechanism(raw = {}) {
  const reasons = [];
  const mechanismId = clean(raw.mechanismId);
  const scarceResource = clean(raw.scarceResource);
  const maturity = clean(raw.maturity).toUpperCase();
  if (!mechanismId) reasons.push('mechanism-id-required');
  if (!scarceResource) reasons.push('scarce-resource-required');
  if (!MATURITY.has(maturity)) reasons.push('maturity-required');
  if (!Array.isArray(raw.remainingExternalDependencies)) reasons.push('external-dependencies-must-be-explicit');
  if (!Array.isArray(raw.hardPhysicalBounds)) reasons.push('physical-bounds-must-be-explicit');
  if (!clean(raw.falsifier)) reasons.push('falsifier-required');
  if (raw.requiresPolicyEvasion === true) reasons.push('policy-evasion-forbidden');
  if (raw.requiresFalseEvidence === true) reasons.push('false-evidence-forbidden');
  if (raw.requiresUnauthorizedResources === true) reasons.push('unauthorized-resource-use-forbidden');
  const record = {
    mechanismId: mechanismId || null,
    scarceResource: scarceResource || null,
    maturity: maturity || null,
    remainingExternalDependencies: uniq((raw.remainingExternalDependencies || []).map(clean).filter(Boolean)).sort(),
    hardPhysicalBounds: uniq((raw.hardPhysicalBounds || []).map(clean).filter(Boolean)).sort(),
    falsifier: clean(raw.falsifier) || null,
    recurringCostReduction: Number.isFinite(Number(raw.recurringCostReduction)) ? Math.max(0, Math.min(1, Number(raw.recurringCostReduction))) : null,
    sovereigntyGain: Number.isFinite(Number(raw.sovereigntyGain)) ? Math.max(0, Math.min(1, Number(raw.sovereigntyGain))) : null,
    valid: reasons.length === 0,
    reasonCodes: uniq(reasons)
  };
  return { ...record, mechanismReceiptId: `ubzero_${sha256(record)}` };
}

export function rankSubstitutionMechanisms(rows = []) {
  return rows.map(evaluateSubstitutionMechanism)
    .filter(row => row.valid)
    .sort((a,b) => ((b.recurringCostReduction ?? 0) + (b.sovereigntyGain ?? 0)) - ((a.recurringCostReduction ?? 0) + (a.sovereigntyGain ?? 0)));
}
