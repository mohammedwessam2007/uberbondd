import crypto from 'node:crypto';
import {
  GENESIS_MECHANISM_COMPILER_VERSION,
  causalSignature,
  compileGenesisMechanisms
} from './genesis-mechanism-compiler.mjs';
import {
  compileSelfImprovementCausalAdmission,
  SELF_IMPROVEMENT_CAUSAL_ADMISSION_VERSION
} from './self-improvement-causal-admission.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_SELF_IMPROVEMENT_BRIDGE_VERSION = 'uberbond.genesis-self-improvement-bridge.v1.1';

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, max = 1800) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const unique = values => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
const normalizedSet = values => [...new Set((Array.isArray(values) ? values : []).map(String))].sort();
const sameSet = (left, right) => {
  const a = normalizedSet(left);
  const b = normalizedSet(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
};
const provenanceKey = row => JSON.stringify({
  donorId: String(row?.donorId || ''),
  sourceKind: String(row?.sourceKind || ''),
  evidenceClass: String(row?.evidenceClass || '')
});

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: GENESIS_SELF_IMPROVEMENT_BRIDGE_VERSION,
    status: 'GENESIS_SELF_IMPROVEMENT_BRIDGE_REFUSED',
    reasonCodes: unique(reasonCodes),
    writeAuthority: 'NONE',
    promotionAuthority: 'NONE',
    selfModificationAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function validateCandidate(compilation, candidateId) {
  const reasons = [];
  if (compilation?.ok !== true || compilation?.status !== 'MECHANISMS_COMPILED') {
    reasons.push('canonical-genesis-compilation-required');
  }
  if (compilation?.version !== GENESIS_MECHANISM_COMPILER_VERSION) reasons.push('genesis-compiler-version-mismatch');
  if (compilation?.businessEffectAuthority !== 'NONE') reasons.push('genesis-compilation-must-not-carry-authority');

  const id = text(candidateId, 220);
  const candidates = Array.isArray(compilation?.candidates) ? compilation.candidates : [];
  const candidate = id ? candidates.find(row => row?.candidateId === id) : null;
  if (!id || !candidate) reasons.push('exact-genesis-candidate-required');
  if (candidate?.status !== 'HYPOTHESIS' || candidate?.validated !== false) reasons.push('genesis-candidate-must-remain-unvalidated-hypothesis');
  if (candidate?.businessEffectAuthority !== 'NONE') reasons.push('genesis-candidate-must-not-carry-authority');

  const primitiveIds = Array.isArray(candidate?.primitiveIds) ? candidate.primitiveIds.map(String) : [];
  const primitives = (Array.isArray(compilation?.primitives) ? compilation.primitives : [])
    .filter(row => primitiveIds.includes(String(row?.primitiveId)));
  if (!primitiveIds.length || primitives.length !== primitiveIds.length) reasons.push('candidate-primitives-must-resolve-exactly');
  if (!sameSet(primitiveIds, primitives.map(row => row?.primitiveId))) reasons.push('candidate-primitive-set-mismatch');

  const donorIds = normalizedSet(primitives.map(row => text(row?.donorId, 220)).filter(Boolean));
  const donorDomains = normalizedSet(primitives.map(row => text(row?.donorDomain, 220)).filter(Boolean));
  if (donorIds.length < 2) reasons.push('cross-donor-genesis-candidate-required');
  if (!sameSet(candidate?.donorIds, donorIds)) reasons.push('candidate-donor-set-mismatch');
  if (!sameSet(candidate?.donorDomains, donorDomains)) reasons.push('candidate-donor-domain-set-mismatch');
  if (primitives.some(row => !row?.semanticIdentity || !row?.provenance?.sourceRef || !row?.provenance?.observedAt)) {
    reasons.push('primitive-provenance-and-semantic-identity-required');
  }
  if (primitives.some(row => row?.businessEffectAuthority !== 'NONE')) reasons.push('genesis-primitives-must-not-carry-authority');

  const expectedProvenance = primitives.map(row => provenanceKey({
    donorId: row.donorId,
    sourceKind: row.provenance?.sourceKind,
    evidenceClass: row.evidenceClass
  })).sort();
  const declaredProvenance = (Array.isArray(candidate?.inheritedProvenance) ? candidate.inheritedProvenance : []).map(provenanceKey).sort();
  if (expectedProvenance.length !== declaredProvenance.length || expectedProvenance.some((value, index) => value !== declaredProvenance[index])) {
    reasons.push('candidate-inherited-provenance-mismatch');
  }

  if (candidate) {
    const expectedSignature = causalSignature({ primitiveIds, exploits: primitives.map(row => row.exploits).filter(Boolean) });
    if (candidate.causalSignature !== expectedSignature) reasons.push('genesis-causal-signature-integrity-mismatch');
    if (candidate.candidateId !== `candidate_${expectedSignature.slice(0, 24)}`) reasons.push('genesis-candidate-id-integrity-mismatch');
  }

  return { ok: reasons.length === 0, reasonCodes: unique(reasons), candidate, primitives, donorIds, donorDomains };
}

function mechanismStatement(primitives) {
  return primitives
    .map(row => ({ role: String(row.role || ''), id: String(row.primitiveId || ''), statement: text(row.statement, 900) }))
    .filter(row => row.role && row.id && row.statement)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(row => `${row.role}:${row.statement}`)
    .join(' | ');
}

export function compileGenesisSelfImprovementAdmission({
  donors = [],
  maxCandidates = 50,
  candidateId,
  predictedObservations = [],
  falsifier,
  rivals = [],
  evaluatedAt,
  ...causalArgs
} = {}) {
  const evaluationDate = evaluatedAt instanceof Date ? evaluatedAt : new Date(evaluatedAt ?? NaN);
  if (Number.isNaN(evaluationDate.getTime())) return fail(['valid-genesis-evaluation-time-required']);
  const evaluationIso = evaluationDate.toISOString();
  const futureDatedDonors = (Array.isArray(donors) ? donors : []).filter(row => {
    const raw = row?.source?.observedAt;
    const observed = raw instanceof Date ? raw : new Date(raw ?? NaN);
    return !Number.isNaN(observed.getTime()) && observed.getTime() > evaluationDate.getTime();
  });
  if (futureDatedDonors.length) return fail(['future-dated-donor-evidence-prohibited'], { evaluatedAt: evaluationIso });

  const genesisCompilation = compileGenesisMechanisms({ donors, maxCandidates });
  if (!genesisCompilation.ok) {
    return fail(['canonical-genesis-compilation-refused'], { genesisCompilation });
  }

  const validated = validateCandidate(genesisCompilation, candidateId);
  if (!validated.ok) return fail(validated.reasonCodes);

  const predictions = unique((Array.isArray(predictedObservations) ? predictedObservations : [])
    .map(value => text(value, 700)).filter(Boolean));
  const falsifierText = text(falsifier, 1200);
  if (!predictions.length || !falsifierText) return fail(['predeclared-genesis-predictions-and-falsifier-required']);

  const mechanism = mechanismStatement(validated.primitives);
  if (!mechanism) return fail(['genesis-mechanism-statement-could-not-be-derived']);

  const genesisBinding = {
    compilerVersion: genesisCompilation.version,
    evaluatedAt: evaluationIso,
    candidateId: validated.candidate.candidateId,
    causalSignature: validated.candidate.causalSignature,
    primitiveIds: [...validated.candidate.primitiveIds].sort(),
    donorIds: validated.donorIds,
    donorDomains: validated.donorDomains,
    evidenceClass: validated.candidate.evidenceClass,
    inheritedProvenance: structuredClone(validated.candidate.inheritedProvenance || []),
    compilationDigest: digest({
      version: genesisCompilation.version,
      normalized: genesisCompilation.normalized,
      primitives: genesisCompilation.primitives,
      variants: genesisCompilation.variants,
      candidates: genesisCompilation.candidates
    })
  };
  const genesisBindingDigest = digest(genesisBinding);

  const causal = compileSelfImprovementCausalAdmission({
    ...causalArgs,
    hypothesis: {
      id: `genesis:${validated.candidate.candidateId}`,
      mechanismId: validated.candidate.candidateId,
      mechanism,
      predictedObservations: predictions,
      falsifier: falsifierText
    },
    rivals
  });
  if (!causal.ok) {
    return fail(['canonical-self-improvement-causal-admission-refused'], {
      genesisBinding,
      genesisBindingDigest,
      causalAdmission: causal
    });
  }
  if (causal.policyVersion !== SELF_IMPROVEMENT_CAUSAL_ADMISSION_VERSION) return fail(['self-improvement-causal-policy-version-mismatch']);
  if (causal.selectedHypothesis?.mechanismId !== validated.candidate.candidateId) return fail(['causal-admission-genesis-candidate-binding-mismatch']);

  const bridgeDigest = digest({
    genesisBindingDigest,
    causalAdmissionDigest: causal.causalAdmissionDigest,
    selectedMechanismId: causal.selectedHypothesis.mechanismId,
    baseRevision: causal.baseRevision,
    taskId: causal.taskId
  });

  return {
    ok: true,
    policyVersion: GENESIS_SELF_IMPROVEMENT_BRIDGE_VERSION,
    status: 'GENESIS_MECHANISM_CAUSALLY_ADMISSIBLE_FOR_EXISTING_SELF_IMPROVEMENT_PIPELINE',
    bridgeDigest,
    genesisBinding,
    genesisBindingDigest,
    causalAdmission: causal,
    maintainerTask: {
      ...causal.maintainerTask,
      genesisCandidateId: validated.candidate.candidateId,
      genesisCausalSignature: validated.candidate.causalSignature,
      genesisBindingDigest,
      bridgeDigest
    },
    truthBoundary: 'GENESIS_PROVENANCE_PLUS_CAUSAL_ADMISSION_ONLY__GENESIS_HYPOTHESIS_IS_NOT_VALIDATED_BY_COMPILATION__CAPABILITY_ADMISSION_C13_C26_RECURSIVE_GOVERNANCE_AND_LATER_EMPIRICAL_RETENTION_STILL_APPLY',
    writeAuthority: 'NONE',
    promotionAuthority: 'NONE',
    selfModificationAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    externalEffectLedger: zeroEffects()
  };
}
