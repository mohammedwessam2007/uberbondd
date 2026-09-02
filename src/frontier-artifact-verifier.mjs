import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_ARTIFACT_VERIFIER_VERSION = 'uberbond.frontier-artifact-verifier-1.0.0';

function text(value, max = 4000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function list(value, max = 128, itemMax = 1800) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
  }
  return out;
}
function iso(value) {
  const normalized = text(value, 80);
  const date = normalized ? new Date(normalized) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function envelope(extra = {}) {
  return { businessEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra };
}

export function normalizeArtifactReceipt(input = {}) {
  const artifactId = text(input.artifactId, 240)?.toLowerCase();
  const artifactType = text(input.artifactType, 100)?.toUpperCase();
  const artifactRef = text(input.artifactRef, 2000);
  const sourceRevision = text(input.sourceRevision, 300);
  const observedAt = iso(input.observedAt);
  const checks = Array.isArray(input.checks) && input.checks.length <= 256 ? input.checks.map(check => ({
    id: text(check?.id, 240)?.toLowerCase(),
    status: text(check?.status, 40)?.toUpperCase(),
    evidenceRef: text(check?.evidenceRef, 2000),
    observedAt: iso(check?.observedAt)
  })) : null;
  const uncertainty = list(input.uncertainty || [], 128, 1600);
  const reasonCodes = [];
  if (!artifactId || !artifactType || !artifactRef || !sourceRevision || !observedAt) reasonCodes.push('artifact-identity-revision-and-observation-required');
  if (!checks || checks.length === 0 || checks.some(check => !check.id || !['PASS', 'FAIL', 'UNCERTAIN'].includes(check.status) || !check.evidenceRef || !check.observedAt)) reasonCodes.push('complete-independent-checks-required');
  if (!uncertainty) reasonCodes.push('bounded-uncertainty-required');
  if (reasonCodes.length) return envelope({ ok: false, status: 'ARTIFACT_RECEIPT_INVALID', reasonCodes });
  return envelope({ ok: true, status: 'ARTIFACT_RECEIPT_NORMALIZED', receipt: { artifactId, artifactType, artifactRef, sourceRevision, observedAt, checks, uncertainty } });
}

export function verifyArtifactCompletion({ receipt, requiredChecks = [] } = {}) {
  const normalized = normalizeArtifactReceipt(receipt);
  if (!normalized.ok) return normalized;
  const required = list(requiredChecks, 256, 240)?.map(item => item.toLowerCase());
  if (!required || required.length === 0) return envelope({ ok: false, status: 'ARTIFACT_VERIFICATION_INVALID', reasonCodes: ['nonempty-required-checks-required'] });
  const byId = new Map(normalized.receipt.checks.map(check => [check.id, check]));
  const missing = required.filter(id => !byId.has(id));
  const failed = required.filter(id => byId.get(id)?.status === 'FAIL');
  const uncertain = required.filter(id => byId.get(id)?.status === 'UNCERTAIN');
  const complete = missing.length === 0 && failed.length === 0 && uncertain.length === 0;
  return envelope({
    ok: true,
    status: complete ? 'ARTIFACT_COMPLETION_PROVEN' : 'ARTIFACT_COMPLETION_NOT_PROVEN',
    complete,
    artifactId: normalized.receipt.artifactId,
    artifactType: normalized.receipt.artifactType,
    artifactRef: normalized.receipt.artifactRef,
    sourceRevision: normalized.receipt.sourceRevision,
    missing,
    failed,
    uncertain,
    uncertainty: normalized.receipt.uncertainty,
    completionClaimAuthorized: complete
  });
}

export function buildVisualVerificationContract(input = {}) {
  const id = text(input.id, 240)?.toLowerCase();
  const referenceRefs = list(input.referenceRefs || [], 128, 2000);
  const renderRefs = list(input.renderRefs || [], 128, 2000);
  const dimensions = list(input.dimensions || ['LAYOUT', 'CONTENT', 'RESPONSIVENESS', 'INTERACTION_STATE', 'ACCESSIBILITY_VISIBLE_STATE'], 64, 300)?.map(item => item.toUpperCase());
  const toleranceRule = text(input.toleranceRule || 'NO_UNEXPLAINED_MATERIAL_GAP', 1000);
  if (!id || !referenceRefs || referenceRefs.length === 0 || !renderRefs || renderRefs.length === 0 || !dimensions || dimensions.length === 0 || !toleranceRule) {
    return envelope({ ok: false, status: 'VISUAL_VERIFICATION_CONTRACT_INVALID', reasonCodes: ['complete-visual-reference-render-dimension-contract-required'] });
  }
  return envelope({
    ok: true,
    status: 'VISUAL_VERIFICATION_CONTRACT_READY',
    contract: { id, referenceRefs, renderRefs, dimensions, toleranceRule, verifierIndependenceRequired: true, mutationAuthority: 'NONE' }
  });
}

export function verifyVisualEvidence({ contract, observations = [] } = {}) {
  const normalized = buildVisualVerificationContract(contract);
  if (!normalized.ok) return normalized;
  if (!Array.isArray(observations) || observations.length === 0 || observations.length > 512) return envelope({ ok: false, status: 'VISUAL_EVIDENCE_INVALID', reasonCodes: ['bounded-visual-observations-required'] });
  const items = observations.map(item => ({
    dimension: text(item?.dimension, 300)?.toUpperCase(),
    status: text(item?.status, 40)?.toUpperCase(),
    evidenceRef: text(item?.evidenceRef, 2000),
    observedAt: iso(item?.observedAt),
    note: text(item?.note || 'none', 1200)
  }));
  if (items.some(item => !item.dimension || !['PASS', 'FAIL', 'UNCERTAIN'].includes(item.status) || !item.evidenceRef || !item.observedAt)) {
    return envelope({ ok: false, status: 'VISUAL_EVIDENCE_INVALID', reasonCodes: ['complete-visual-observation-fields-required'] });
  }
  const byDimension = new Map(items.map(item => [item.dimension, item]));
  const missing = normalized.contract.dimensions.filter(dimension => !byDimension.has(dimension));
  const failed = normalized.contract.dimensions.filter(dimension => byDimension.get(dimension)?.status === 'FAIL');
  const uncertain = normalized.contract.dimensions.filter(dimension => byDimension.get(dimension)?.status === 'UNCERTAIN');
  const pass = missing.length === 0 && failed.length === 0 && uncertain.length === 0;
  return envelope({ ok: true, status: pass ? 'VISUAL_MATCH_PROVEN' : 'VISUAL_MATCH_NOT_PROVEN', pass, missing, failed, uncertain, observations: items });
}
