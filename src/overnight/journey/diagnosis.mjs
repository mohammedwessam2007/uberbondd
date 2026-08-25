import { sha256 } from '../../../src/omnia-v9/canonical.mjs';
import { classifyEffectLedger, EFFECT_STATES } from '../../../src/effect-ledgers.mjs';
import { normalizeEpistemicStatement } from './epistemic.mjs';
import { JOURNEY_OBSERVATION_POLICY_VERSION } from './observation.mjs';

export const JOURNEY_DIAGNOSTIC_POLICY_VERSION = 'overnight-journey-diagnostic-1.0.0';

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function rejected(reasonCodes) {
  return {
    ok: false,
    policyVersion: JOURNEY_DIAGNOSTIC_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: unique(reasonCodes)
  };
}

function findingForStep({ observation, receiptId, runDigest, index }) {
  const problem = observation.status === 'FAIL'
    ? 'failed'
    : observation.status === 'UNKNOWN' ? 'unknown' : 'not run';
  const relation = 'DERIVED';
  const derivationRule = observation.status === 'FAIL'
    ? 'synthetic-step-status-fail'
    : observation.status === 'UNKNOWN' ? 'synthetic-step-status-unknown' : 'required-step-not-complete';
  const statement = normalizeEpistemicStatement({
    statement: `${observation.stepType} was ${problem} in the authorized synthetic journey run.`,
    relation,
    evidenceRefs: [observation.observationId, receiptId],
    derivationRule,
    confidence: 1,
    statementId: `finding_statement_${sha256({ runDigest, stepId: observation.stepId, status: observation.status }).slice(0, 24)}`
  });
  if (!statement.ok) return statement;

  return {
    findingId: `finding_${sha256({ runDigest, stepId: observation.stepId }).slice(0, 24)}`,
    code: observation.status === 'FAIL' ? 'JOURNEY_STEP_FAILED' : 'JOURNEY_EVIDENCE_GAP',
    sequence: index + 1,
    stepId: observation.stepId,
    stepType: observation.stepType,
    observedStatus: observation.status,
    severity: 'REVIEW_REQUIRED',
    statement: statement.statement,
    evidenceRefs: [observation.observationId, receiptId],
    scope: 'THIS_SYNTHETIC_RUN_ONLY',
    customerImpact: {
      status: 'NOT_MEASURED',
      revenueImpact: 'NOT_MEASURED',
      conversionImpact: 'NOT_MEASURED',
      note: 'No customer, production, conversion, or revenue outcome was supplied or inferred as fact.'
    },
    recommendedNextStep: 'Review the referenced witness and authorize a separate live verification only if appropriate.'
  };
}

function normalizeOptionalReasoning(reasoning = {}, { runDigest, receiptId }) {
  const inferences = [];
  const predictions = [];
  const reasonCodes = [];
  const items = Array.isArray(reasoning) ? reasoning : [
    ...(Array.isArray(reasoning.inferences) ? reasoning.inferences.map(item => ({ ...item, relation: 'INFERRED' })) : []),
    ...(Array.isArray(reasoning.predictions) ? reasoning.predictions.map(item => ({ ...item, relation: 'PREDICTED' })) : [])
  ];

  for (const [index, item] of items.entries()) {
    const relation = text(item?.relation, 30).toUpperCase();
    const statement = normalizeEpistemicStatement({
      statement: item?.statement,
      relation,
      evidenceRefs: [receiptId, ...(Array.isArray(item?.evidenceRefs) ? item.evidenceRefs : [])],
      inferenceBasis: item?.inferenceBasis,
      modelRef: item?.modelRef,
      confidence: item?.confidence,
      statementId: `reasoning_${sha256({ runDigest, index, item }).slice(0, 24)}`
    });
    if (!statement.ok) {
      reasonCodes.push(`reasoning-${index}:${statement.reasonCodes.join(',')}`);
      continue;
    }
    if (relation === 'INFERRED') inferences.push(statement.statement);
    else if (relation === 'PREDICTED') predictions.push(statement.statement);
    else reasonCodes.push(`reasoning-${index}:only-inferred-or-predicted-allowed`);
  }
  return { inferences, predictions, reasonCodes };
}

/**
 * Turn a normalized synthetic run into findings without laundering its scope.
 * Inferences and predictions are retained as internal hypotheses only; they
 * are never promoted into the diagnostic proof points used by the offer.
 */
export function diagnoseSyntheticJourney({ observation, reasoning = {}, date = new Date() } = {}) {
  const at = iso(date);
  if (!at) return rejected(['diagnostic-time-required']);
  if (!observation?.ok) return rejected(['normalized-observation-required']);
  if (observation.policyVersion !== JOURNEY_OBSERVATION_POLICY_VERSION) return rejected(['observation-policy-version-mismatch']);

  const effect = classifyEffectLedger('externalEffectLedger', observation.externalEffectLedger);
  if (!effect.ok || effect.state !== EFFECT_STATES.ZERO_EFFECT || !effect.provenZero) {
    return rejected(['diagnostic-requires-proven-zero-effect', ...(effect.reasonCodes || [])]);
  }

  const findings = observation.observations
    .filter(item => ['FAIL', 'UNKNOWN', 'NOT_RUN'].includes(item.status))
    .map((item, index) => findingForStep({ observation: item, receiptId: observation.receipt.receiptId, runDigest: observation.runDigest, index }));
  const invalidFinding = findings.find(item => item?.ok === false);
  if (invalidFinding) return rejected(['finding-statement-invalid', ...invalidFinding.reasonCodes]);

  const normalizedReasoning = normalizeOptionalReasoning(reasoning, {
    runDigest: observation.runDigest,
    receiptId: observation.receipt.receiptId
  });
  if (normalizedReasoning.reasonCodes.length) return rejected(normalizedReasoning.reasonCodes);

  const status = findings.length ? 'ACTIONABLE_FINDINGS_PRESENT' : 'NO_FAILURE_OBSERVED_IN_THIS_RUN';
  const summaryStatement = normalizeEpistemicStatement({
    statement: status === 'ACTIONABLE_FINDINGS_PRESENT'
      ? `${findings.length} journey finding(s) were derived from this synthetic run.`
      : 'No failed or incomplete step was observed in this synthetic run.',
    relation: 'DERIVED',
    evidenceRefs: [observation.runDigest, observation.receipt.receiptId],
    derivationRule: 'aggregate-normalized-step-statuses',
    confidence: 1,
    statementId: `diagnostic_summary_${sha256({ runDigest: observation.runDigest, status, findings }).slice(0, 24)}`
  });
  if (!summaryStatement.ok) return rejected(['summary-statement-invalid', ...summaryStatement.reasonCodes]);

  return {
    ok: true,
    policyVersion: JOURNEY_DIAGNOSTIC_POLICY_VERSION,
    status,
    diagnosticId: `diagnostic_${sha256({ observation: observation.runDigest, findings }).slice(0, 24)}`,
    checkId: observation.checkId,
    journeyId: observation.journeyId,
    subjectRef: observation.subjectRef,
    observedAt: observation.observedAt,
    runDigest: observation.runDigest,
    receipt: observation.receipt,
    summary: summaryStatement.statement,
    findings,
    internalInferences: normalizedReasoning.inferences,
    internalPredictions: normalizedReasoning.predictions,
    evidenceBoundary: {
      scope: 'SYNTHETIC_RUN_ONLY',
      customerStatus: 'UNVERIFIED',
      customerImpact: 'NOT_MEASURED',
      revenueOutcome: 'NOT_MEASURED',
      productionState: 'NOT_VERIFIED'
    },
    externalEffectLedger: { ...effect.ledger },
    effectState: EFFECT_STATES.ZERO_EFFECT
  };
}

