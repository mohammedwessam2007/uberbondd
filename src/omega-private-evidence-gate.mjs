import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_PRIVATE_EVIDENCE_GATE_VERSION = 'uberbond.omega-private-evidence-gate.v1';

const REQUIRED = Object.freeze([
  'semanticCompilation',
  'sealedHiddenHoldouts',
  'crossFamilyTransfer',
  'crossDomainTransfer',
  'verifierIndependence',
  'leakageResistance',
  'fullCostAccounting',
  'robustness',
  'replication',
  'realitySettlement',
  'compoundingReduction',
  'metaGeneralization'
]);

const CRITICAL = new Set([
  'sealedHiddenHoldouts',
  'crossDomainTransfer',
  'verifierIndependence',
  'leakageResistance',
  'replication',
  'realitySettlement'
]);

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

function normalizedDimension(raw = {}) {
  const passed = raw.passed === true;
  const evidenceRefs = Array.isArray(raw.evidenceRefs)
    ? [...new Set(raw.evidenceRefs.map(String).map(v => v.trim()).filter(Boolean))]
    : [];
  const independent = raw.independent === true;
  const replicated = raw.replicated === true;
  return { passed, evidenceRefs, independent, replicated };
}

export function evaluateOmegaPrivateEvidence(input = {}) {
  const dimensions = {};
  const reasons = [];

  for (const name of REQUIRED) {
    const dimension = normalizedDimension(input?.dimensions?.[name]);
    dimensions[name] = dimension;
    if (!dimension.passed) reasons.push(`${name}:not-passed`);
    if (!dimension.evidenceRefs.length) reasons.push(`${name}:missing-evidence`);
  }

  for (const name of CRITICAL) {
    const dimension = dimensions[name];
    if (!dimension.independent) reasons.push(`${name}:independence-required`);
  }

  if (!dimensions.replication.replicated) reasons.push('replication:replicated-run-required');

  const score = REQUIRED.filter(name => dimensions[name].passed && dimensions[name].evidenceRefs.length).length;
  const criticalGreen = [...CRITICAL].every(name => {
    const d = dimensions[name];
    return d.passed && d.independent && d.evidenceRefs.length > 0;
  });

  const e10 = score === REQUIRED.length && criticalGreen && dimensions.replication.replicated;

  let grade = 'E0';
  if (score >= 1) grade = 'E1';
  if (score >= 3) grade = 'E2';
  if (dimensions.sealedHiddenHoldouts.passed && dimensions.crossFamilyTransfer.passed) grade = 'E3';
  if (grade === 'E3' && dimensions.robustness.passed) grade = 'E4';
  if (grade === 'E4' && dimensions.semanticCompilation.passed) grade = 'E5';
  if (dimensions.crossDomainTransfer.passed && dimensions.verifierIndependence.passed) grade = 'E6';
  if (grade === 'E6' && dimensions.leakageResistance.passed && dimensions.fullCostAccounting.passed && dimensions.robustness.passed) grade = 'E7';
  if (grade === 'E7' && dimensions.compoundingReduction.passed) grade = 'E8';
  if (grade === 'E8' && dimensions.replication.passed && dimensions.replication.replicated && dimensions.realitySettlement.passed) grade = 'E9';
  if (e10 && dimensions.metaGeneralization.passed) grade = 'E10';

  return envelope({
    ok: true,
    status: e10 ? 'OMEGA_PRIVATE_EVIDENCE_E10' : 'OMEGA_PRIVATE_EVIDENCE_NOT_E10',
    version: OMEGA_PRIVATE_EVIDENCE_GATE_VERSION,
    grade,
    score,
    totalDimensions: REQUIRED.length,
    criticalGreen,
    e10,
    dimensions,
    reasonCodes: [...new Set(reasons)],
    truthBoundary: 'E10 is a private evidence grade for the declared evaluation program. It is not a proof of ASI, unlimited compute, or a technological singularity.'
  });
}
