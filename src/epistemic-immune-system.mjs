// Epistemic Immune System + Model Ecology.
//
// An ensemble is not independent because its rows have different model names,
// and a large evidence set is not strong because it has many citations. This
// module audits ancestry, leakage, selection and benchmark contamination before
// a conclusion is allowed to call its support diverse.
export const EPISTEMIC_IMMUNE_SYSTEM_VERSION = 'uberbond.epistemic-immune-system.v1';

export const EPISTEMIC_RISKS = Object.freeze([
  'CONFIRMATION_BIAS', 'SURVIVORSHIP_BIAS', 'SELECTION_BIAS', 'PUBLICATION_BIAS',
  'MOTIVATED_REASONING', 'BASE_RATE_NEGLECT', 'CORRELATED_SOURCES', 'DATA_LEAKAGE',
  'HINDSIGHT_BIAS', 'NARRATIVE_FALLACY', 'BENCHMARK_GAMING', 'MODEL_COLLUSION',
  'CONSENSUS_MASQUERADING_AS_INDEPENDENCE'
]);

const text = (value, max = 500) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'EPISTEMIC_IMMUNE_REFUSED',
  reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

function normalizeEvidence(row, index) {
  return {
    id: text(row?.id, 160) || `evidence-${index + 1}`,
    lineage: text(row?.lineage, 240),
    origin: text(row?.origin, 160),
    kind: text(row?.kind, 120)?.toUpperCase(),
    direction: text(row?.direction, 40)?.toUpperCase() || 'UNKNOWN',
    selectedAfterOutcome: row?.selectedAfterOutcome === true,
    trainingContamination: row?.trainingContamination === true,
    benchmarkKnownToModel: row?.benchmarkKnownToModel === true,
    publicationOnly: row?.publicationOnly === true,
    survivedSelection: row?.survivedSelection === true,
    counterevidenceSearched: row?.counterevidenceSearched === true,
    ref: text(row?.ref || row?.evidenceRef, 300)
  };
}

/**
 * Audit an evidence set before it is allowed to support a conclusion.
 *
 * Explicit leakage/hindsight/benchmark contamination is quarantined. Other
 * risks remain visible warnings because the module cannot infer a study's
 * hidden sampling process from a few fields. Missing ancestry is itself a
 * warning rather than silently treating every row as independent.
 */
export function auditEvidenceSet({
  claim,
  evidence = [],
  claimKind = 'GENERAL',
  baseRateRef = null,
  selectionProcessDeclared = false,
  motivatedStakeDeclared = false
} = {}) {
  const namedClaim = text(claim, 1000);
  if (!namedClaim) return fail(['claim-required']);
  const raw = Array.isArray(evidence) ? evidence : [];
  if (!raw.length) return fail(['evidence-required']);
  const rows = raw.map(normalizeEvidence);
  if (rows.some(row => !row.ref)) return fail(['every-evidence-row-needs-ref']);

  const risks = new Set();
  const quarantine = new Set();
  const lineages = new Map();
  for (const row of rows) {
    const lineage = row.lineage || `UNKNOWN:${row.id}`;
    if (!row.lineage) risks.add('CORRELATED_SOURCES');
    if (!lineages.has(lineage)) lineages.set(lineage, []);
    lineages.get(lineage).push(row.id);

    if (row.selectedAfterOutcome) { risks.add('HINDSIGHT_BIAS'); quarantine.add(row.id); }
    if (row.trainingContamination) { risks.add('DATA_LEAKAGE'); quarantine.add(row.id); }
    if (row.benchmarkKnownToModel) { risks.add('BENCHMARK_GAMING'); quarantine.add(row.id); }
    if (row.publicationOnly) risks.add('PUBLICATION_BIAS');
    if (row.survivedSelection) risks.add('SURVIVORSHIP_BIAS');
    if (!row.counterevidenceSearched && row.direction === 'SUPPORTS') risks.add('CONFIRMATION_BIAS');
  }
  if ([...lineages.values()].some(ids => ids.length > 1)) {
    risks.add('CORRELATED_SOURCES');
    risks.add('CONSENSUS_MASQUERADING_AS_INDEPENDENCE');
  }
  if (!selectionProcessDeclared) risks.add('SELECTION_BIAS');
  if (motivatedStakeDeclared) risks.add('MOTIVATED_REASONING');
  if (String(claimKind).toUpperCase() === 'FREQUENCY' && !text(baseRateRef, 300)) risks.add('BASE_RATE_NEGLECT');

  const usable = rows.filter(row => !quarantine.has(row.id));
  const usableLineages = new Set(usable.map(row => row.lineage || `UNKNOWN:${row.id}`));
  const supportLineages = new Set(usable.filter(row => row.direction === 'SUPPORTS').map(row => row.lineage || `UNKNOWN:${row.id}`));
  const opposeLineages = new Set(usable.filter(row => row.direction === 'OPPOSES').map(row => row.lineage || `UNKNOWN:${row.id}`));

  return {
    ok: true,
    status: quarantine.size ? 'EPISTEMIC_REVIEW_REQUIRED' : risks.size ? 'EVIDENCE_USABLE_WITH_VISIBLE_RISKS' : 'EVIDENCE_SET_CLEAN_ON_DECLARED_FIELDS',
    claim: namedClaim,
    evidenceCount: rows.length,
    usableEvidenceCount: usable.length,
    independentUsableLineages: usableLineages.size,
    supportLineages: supportLineages.size,
    opposeLineages: opposeLineages.size,
    risks: [...risks].sort(),
    quarantinedEvidenceIds: [...quarantine],
    lineageClusters: [...lineages.entries()].map(([lineage, ids]) => ({ lineage, evidenceIds: ids })),
    baseRateRef: text(baseRateRef, 300),
    businessEffectAuthority: 'NONE',
    truthBoundary: 'AN_EPISTEMIC_AUDIT_CAN_DOWNGRADE_SUPPORT_OR_REQUIRE_REVIEW__IT_CANNOT_DECLARE_THE_CLAIM_TRUE'
  };
}

/**
 * Model Ecology: diversity by failure lineage, not by vendor/model count.
 */
export function modelEcology(models = []) {
  const rows = (Array.isArray(models) ? models : []).map((row, index) => ({
    id: text(row?.id, 160) || `model-${index + 1}`,
    provider: text(row?.provider, 160) || 'UNKNOWN',
    lineage: text(row?.lineage, 240),
    trainingFamily: text(row?.trainingFamily, 240),
    toolchain: text(row?.toolchain, 240),
    position: text(row?.position, 120)
  }));
  if (!rows.length) return fail(['models-required']);

  // A failure lineage is explicit ancestry when supplied; otherwise use the
  // strongest known shared substrate rather than pretending ignorance means
  // independence.
  const failureLineage = row => row.lineage
    || (row.trainingFamily ? `training:${row.trainingFamily}` : null)
    || (row.provider ? `provider:${row.provider}` : `unknown:${row.id}`);
  const clusters = new Map();
  for (const row of rows) {
    const lineage = failureLineage(row);
    if (!clusters.has(lineage)) clusters.set(lineage, []);
    clusters.get(lineage).push(row.id);
  }
  const providers = new Set(rows.map(row => row.provider));
  const trainingFamilies = new Set(rows.map(row => row.trainingFamily).filter(Boolean));
  const independentLineages = clusters.size;

  return {
    ok: true,
    status: 'MODEL_ECOLOGY_ASSESSED',
    modelCount: rows.length,
    providerCount: providers.size,
    trainingFamilyCount: trainingFamilies.size,
    independentFailureLineages: independentLineages,
    apparentDiversityInflation: rows.length - independentLineages,
    lineageClusters: [...clusters.entries()].map(([lineage, modelIds]) => ({ lineage, modelIds })),
    epistemicBiodiversity: independentLineages === 1 && rows.length > 1 ? 'LOW__APPARENT_ENSEMBLE_IS_ONE_FAILURE_LINEAGE' : 'VISIBLE_AS_LINEAGES__NOT_A_SCALAR_QUALITY_SCORE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'MODEL_COUNT_AND_PROVIDER_COUNT_DO_NOT_PROVE_INDEPENDENT_REASONING'
  };
}

/**
 * Require an attacked conclusion to preserve counterevidence and ancestry.
 */
export function immuneVerdict({ audit, ecology = null } = {}) {
  if (!audit?.ok) return fail(['valid-evidence-audit-required']);
  if (ecology && !ecology.ok) return fail(['valid-model-ecology-required']);
  const severe = new Set(['DATA_LEAKAGE', 'HINDSIGHT_BIAS', 'BENCHMARK_GAMING']);
  const severePresent = audit.risks.some(risk => severe.has(risk));
  const oneLineageEnsemble = ecology && ecology.modelCount > 1 && ecology.independentFailureLineages === 1;
  const status = severePresent || oneLineageEnsemble
    ? 'CONCLUSION_REQUIRES_REBUILD_OR_INDEPENDENT_EVIDENCE'
    : audit.opposeLineages > 0
      ? 'CONCLUSION_MUST_PRESERVE_LIVE_COUNTEREVIDENCE'
      : 'CONCLUSION_MAY_PROCEED_WITH_DECLARED_RISKS';
  return {
    ok: true,
    status,
    severeContamination: severePresent,
    oneLineageEnsemble: Boolean(oneLineageEnsemble),
    risks: audit.risks,
    quarantinedEvidenceIds: audit.quarantinedEvidenceIds,
    businessEffectAuthority: 'NONE'
  };
}
