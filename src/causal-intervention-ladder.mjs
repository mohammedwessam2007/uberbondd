// Causal Intervention Ladder + bounded N-of-1 evidence guard.
//
// A correlation, a plausible mechanism and a temporal sequence can all be true
// while the causal conclusion is false. The ladder exists so stronger language
// is impossible until stronger evidence exists. No rung is promoted merely
// because several weaker sources agree.
export const CAUSAL_INTERVENTION_LADDER_VERSION = 'uberbond.causal-intervention-ladder.v1';

export const CAUSAL_RUNGS = Object.freeze({
  CORRELATION: { rank: 1, ceiling: 'ASSOCIATION_ONLY' },
  TEMPORAL_ASSOCIATION: { rank: 2, ceiling: 'TEMPORAL_ASSOCIATION_ONLY' },
  MECHANISTIC_PLAUSIBILITY: { rank: 3, ceiling: 'MECHANISM_PLAUSIBLE__CAUSALITY_UNPROVEN' },
  NATURAL_EXPERIMENT: { rank: 4, ceiling: 'CAUSAL_SUGGESTIVE__UNCONTROLLED' },
  CONTROLLED_INTERVENTION: { rank: 5, ceiling: 'INTERVENTION_EFFECT_OBSERVED' },
  REPLICATION: { rank: 6, ceiling: 'REPLICATED_INTERVENTION_EFFECT' },
  PERSONAL_REPLICATION: { rank: 7, ceiling: 'PERSONAL_REPLICATED_INTERVENTION_EFFECT' }
});

const text = (value, max = 400) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'CAUSAL_EVIDENCE_REFUSED',
  reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

function normalizeEvidence(row, index) {
  const rung = text(row?.rung, 80)?.toUpperCase();
  const ref = text(row?.evidenceRef || row?.ref, 300);
  if (!rung || !CAUSAL_RUNGS[rung] || !ref) return null;
  return {
    id: text(row?.id, 120) || `evidence-${index + 1}`,
    rung,
    evidenceRef: ref,
    lineage: text(row?.lineage, 200) || ref,
    personRef: text(row?.personRef, 160),
    interventionRef: text(row?.interventionRef, 200),
    outcomeRef: text(row?.outcomeRef, 200),
    episodeRef: text(row?.episodeRef, 200)
  };
}

/**
 * Assess the strongest causal language the supplied evidence can license.
 *
 * Replication is not a label the caller may self-award. REPLICATION requires at
 * least two independent CONTROLLED_INTERVENTION lineages. PERSONAL_REPLICATION
 * additionally requires at least two distinct episodes for the same person and
 * intervention, each with an observed outcome reference.
 */
export function assessCausalEvidence(evidence = []) {
  const raw = Array.isArray(evidence) ? evidence : [];
  const rows = raw.map(normalizeEvidence).filter(Boolean);
  if (!rows.length) return fail(['valid-causal-evidence-required']);
  if (rows.length !== raw.length) return fail(['every-causal-evidence-row-needs-known-rung-and-evidence-ref']);

  const independentControlled = new Set(
    rows.filter(row => row.rung === 'CONTROLLED_INTERVENTION')
      .map(row => row.lineage)
  );

  const validReplication = rows.some(row => row.rung === 'REPLICATION')
    && independentControlled.size >= 2;

  const personalRows = rows.filter(row => row.rung === 'PERSONAL_REPLICATION');
  const personalGroups = new Map();
  for (const row of personalRows) {
    const key = row.personRef && row.interventionRef ? `${row.personRef}::${row.interventionRef}` : null;
    if (!key || !row.episodeRef || !row.outcomeRef) continue;
    if (!personalGroups.has(key)) personalGroups.set(key, new Set());
    personalGroups.get(key).add(row.episodeRef);
  }
  const validPersonalReplication = [...personalGroups.values()].some(episodes => episodes.size >= 2);

  const effectiveRows = rows.filter(row => {
    if (row.rung === 'REPLICATION') return validReplication;
    if (row.rung === 'PERSONAL_REPLICATION') return validPersonalReplication;
    return true;
  });
  const strongest = effectiveRows
    .map(row => CAUSAL_RUNGS[row.rung])
    .sort((a, b) => b.rank - a.rank)[0];

  const rejectedClaims = [];
  if (rows.some(row => row.rung === 'REPLICATION') && !validReplication) rejectedClaims.push('replication-label-without-two-independent-controlled-lineages');
  if (personalRows.length && !validPersonalReplication) rejectedClaims.push('personal-replication-without-two-bound-episodes');

  return {
    ok: true,
    status: 'CAUSAL_EVIDENCE_ASSESSED',
    strongestRank: strongest.rank,
    causalClaimCeiling: strongest.ceiling,
    evidenceCount: rows.length,
    independentControlledLineages: independentControlled.size,
    validReplication,
    validPersonalReplication,
    rejectedClaims,
    evidence: rows,
    businessEffectAuthority: 'NONE',
    truthBoundary: 'WEAKER_RUNGS_NEVER_COMBINE_BY_VOTE_INTO_A_STRONGER_CAUSAL_RUNG'
  };
}

/**
 * Compile a bounded N-of-1 experiment contract.
 *
 * This does not recommend an intervention or execute one. It only checks that a
 * caller-supplied experiment is structured enough for its result to be
 * interpretable later. High-stakes domains remain review-only.
 */
export function compileNOf1Experiment({
  question,
  intervention,
  outcome,
  personRef,
  reversible = null,
  riskClass = 'LOW',
  baselineWindow = null,
  interventionWindow = null,
  confounders = [],
  stopConditions = [],
  measurementMethod = null
} = {}) {
  const reasons = [];
  const q = text(question, 500);
  const action = text(intervention, 500);
  const measured = text(outcome, 300);
  const person = text(personRef, 160);
  const method = text(measurementMethod, 300);
  if (!q) reasons.push('question-required');
  if (!action) reasons.push('intervention-required');
  if (!measured) reasons.push('outcome-required');
  if (!person) reasons.push('person-ref-required');
  if (reversible !== true) reasons.push('reversible-intervention-required');
  if (!Number.isFinite(Number(baselineWindow)) || Number(baselineWindow) <= 0) reasons.push('positive-baseline-window-required');
  if (!Number.isFinite(Number(interventionWindow)) || Number(interventionWindow) <= 0) reasons.push('positive-intervention-window-required');
  if (!method) reasons.push('measurement-method-required');
  if (!Array.isArray(stopConditions) || !stopConditions.map(item => text(item, 300)).filter(Boolean).length) reasons.push('stop-conditions-required');
  if (reasons.length) return fail(reasons);

  const risk = text(riskClass, 80)?.toUpperCase() || 'UNKNOWN';
  const highStakes = new Set(['MEDICAL', 'MENTAL_HEALTH', 'LEGAL', 'FINANCIAL', 'SAFETY_CRITICAL', 'HIGH']);
  const status = highStakes.has(risk)
    ? 'N_OF_1_PROFESSIONAL_REVIEW_REQUIRED'
    : 'N_OF_1_PROTOCOL_READY_FOR_FOUNDER_REVIEW';

  return {
    ok: true,
    status,
    protocol: {
      question: q,
      personRef: person,
      intervention: action,
      outcome: measured,
      measurementMethod: method,
      reversible: true,
      riskClass: risk,
      baselineWindow: Number(baselineWindow),
      interventionWindow: Number(interventionWindow),
      confounders: (Array.isArray(confounders) ? confounders : []).map(item => text(item, 300)).filter(Boolean),
      stopConditions: stopConditions.map(item => text(item, 300)).filter(Boolean)
    },
    causalClaimCeilingBeforeObservation: 'NO_CAUSAL_CLAIM__PROTOCOL_ONLY',
    founderReviewRequired: true,
    professionalReviewRequired: highStakes.has(risk),
    businessEffectAuthority: 'NONE',
    truthBoundary: 'A_PROTOCOL_IS_NOT_AN_INTERVENTION_AND_A_SINGLE_RESULT_IS_NOT_PERSONAL_REPLICATION'
  };
}

/**
 * Convert completed caller-supplied episodes into evidence rows without
 * upgrading them beyond what their design supports.
 */
export function nOf1Evidence({ personRef, interventionRef, episodes = [] } = {}) {
  const person = text(personRef, 160);
  const intervention = text(interventionRef, 200);
  if (!person || !intervention) return fail(['person-ref-and-intervention-ref-required']);
  const rows = (Array.isArray(episodes) ? episodes : []).map((episode, index) => ({
    rung: episode?.controlled === true ? 'CONTROLLED_INTERVENTION' : 'TEMPORAL_ASSOCIATION',
    evidenceRef: text(episode?.evidenceRef, 300),
    lineage: text(episode?.lineage, 200) || `personal:${person}:${intervention}:${index + 1}`,
    personRef: person,
    interventionRef: intervention,
    episodeRef: text(episode?.episodeRef, 200),
    outcomeRef: text(episode?.outcomeRef, 200)
  }));
  if (!rows.length || rows.some(row => !row.evidenceRef || !row.episodeRef || !row.outcomeRef)) {
    return fail(['complete-episode-evidence-required']);
  }

  if (rows.filter(row => row.rung === 'CONTROLLED_INTERVENTION').length >= 2) {
    rows.push({
      rung: 'PERSONAL_REPLICATION',
      evidenceRef: `personal-replication:${person}:${intervention}`,
      lineage: `personal:${person}:${intervention}`,
      personRef: person,
      interventionRef: intervention,
      episodeRef: rows[0].episodeRef,
      outcomeRef: rows[0].outcomeRef
    });
    rows.push({
      rung: 'PERSONAL_REPLICATION',
      evidenceRef: `personal-replication:${person}:${intervention}:2`,
      lineage: `personal:${person}:${intervention}`,
      personRef: person,
      interventionRef: intervention,
      episodeRef: rows[1].episodeRef,
      outcomeRef: rows[1].outcomeRef
    });
  }
  return assessCausalEvidence(rows);
}
