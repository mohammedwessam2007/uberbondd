import { sha256 } from '../../../src/omnia-v9/canonical.mjs';

export const JOURNEY_EVIDENCE_VERSION = 'uberbond.overnight.journey.evidence.v1';

// These are epistemic relations, not confidence labels. A confidence score
// cannot turn an inference into an observation, or a prediction into history.
export const EPISTEMIC_RELATIONS = Object.freeze([
  'OBSERVED',
  'DERIVED',
  'INFERRED',
  'PREDICTED'
]);

const RELATION_SET = new Set(EPISTEMIC_RELATIONS);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function unique(values) {
  return [...new Set(values.map(value => text(value, 300)).filter(Boolean))].slice(0, 40);
}

function boundedConfidence(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Number(Math.max(0, Math.min(1, number)).toFixed(3));
}

/**
 * Normalize one typed statement without upgrading its epistemic relation.
 *
 * Every relation needs evidence references. Derived, inferred, and predicted
 * statements additionally name the rule, basis, or model that produced them.
 * This keeps the offer compiler from accidentally treating a model output as
 * a production observation.
 */
export function normalizeEpistemicStatement({
  statement,
  relation,
  evidenceRefs = [],
  source = '',
  derivationRule = '',
  inferenceBasis = '',
  modelRef = '',
  confidence,
  statementId = ''
} = {}) {
  const normalizedRelation = text(relation, 40).toUpperCase();
  const normalizedStatement = text(statement, 1000);
  const refs = unique(Array.isArray(evidenceRefs) ? evidenceRefs : []);
  const reasonCodes = [];

  if (!RELATION_SET.has(normalizedRelation)) reasonCodes.push('unsupported-epistemic-relation');
  if (!normalizedStatement) reasonCodes.push('statement-required');
  if (!refs.length) reasonCodes.push('evidence-reference-required');
  if (normalizedRelation === 'OBSERVED' && !text(source, 120)) reasonCodes.push('observed-source-required');
  if (normalizedRelation === 'DERIVED' && !text(derivationRule, 240)) reasonCodes.push('derivation-rule-required');
  if (normalizedRelation === 'INFERRED' && !text(inferenceBasis, 500)) reasonCodes.push('inference-basis-required');
  if (normalizedRelation === 'PREDICTED' && !text(modelRef, 180)) reasonCodes.push('prediction-model-required');

  if (reasonCodes.length) return { ok: false, reasonCodes };

  const normalized = {
    version: JOURNEY_EVIDENCE_VERSION,
    statementId: text(statementId, 180),
    relation: normalizedRelation,
    statement: normalizedStatement,
    evidenceRefs: refs,
    source: text(source, 120) || null,
    derivationRule: text(derivationRule, 240) || null,
    inferenceBasis: text(inferenceBasis, 500) || null,
    modelRef: text(modelRef, 180) || null,
    confidence: boundedConfidence(confidence, normalizedRelation === 'OBSERVED' ? 1 : 0.5),
    externallyVerified: false,
    externallyClaimable: false
  };

  normalized.statementId = normalized.statementId || `statement_${sha256(normalized).slice(0, 24)}`;
  return { ok: true, statement: normalized };
}

export function isPublishableDiagnosticStatement(statement) {
  return Boolean(
    statement &&
    statement.version === JOURNEY_EVIDENCE_VERSION &&
    statement.evidenceRefs?.length &&
    ['OBSERVED', 'DERIVED'].includes(statement.relation) &&
    statement.externallyVerified === false
  );
}
