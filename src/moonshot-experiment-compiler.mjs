import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { chooseMinimumRealityProbe } from './moonshot-reality-compiler.mjs';
import { compileFeasibleBoundedExperiment } from './genesis-experiment-feasibility.mjs';

export const MOONSHOT_EXPERIMENT_COMPILER_VERSION = 'uberbond.moonshot-experiment-compiler.v1';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const text = (value, max = 2400) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => envelope({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...extra
});

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function normalizeProbe(raw, claimId) {
  const id = text(raw?.id, 160);
  const description = text(raw?.description, 2400);
  const measurement = text(raw?.measurement, 1600);
  const decisionRule = text(raw?.decisionRule, 1600);
  const supportsHypothesis = text(raw?.supportsHypothesis, 1600);
  const falsifiesHypothesis = text(raw?.falsifiesHypothesis, 1600);
  const costCents = integer(raw?.costCents ?? 0, 0, 1_000_000_000);
  const timeMinutes = integer(raw?.timeMinutes ?? 0, 0, 60 * 24 * 365);
  const reversibility = text(raw?.reversibility, 80) || 'REVERSIBLE';
  const effects = raw?.effects && typeof raw.effects === 'object' ? raw.effects : {};
  const bounded = ['informationGain','cost','risk','irreversibility','delay']
    .map(key => Number(raw?.[key]));
  if (!id || !description || !measurement || !decisionRule || !supportsHypothesis ||
      !falsifiesHypothesis || costCents == null || timeMinutes == null ||
      bounded.some(value => !Number.isFinite(value) || value < 0 || value > 100)) return null;

  return {
    id,
    claimId,
    description,
    measurement,
    decisionRule,
    supportsHypothesis,
    falsifiesHypothesis,
    informationGain: bounded[0],
    cost: bounded[1],
    risk: bounded[2],
    irreversibility: bounded[3],
    delay: bounded[4],
    authorityReady: raw?.authorityReady === true,
    costCents,
    timeMinutes,
    reversibility,
    effects
  };
}

export function compileMoonshotExperiment({
  moonshotId,
  claimId,
  hypothesis,
  falsifier,
  candidateProbes = [],
  costCeilingCents = 0,
  timeCeilingMinutes = 60,
  blastRadius = 'LOCAL_ONLY',
  authority = null
} = {}) {
  const mid = text(moonshotId, 160);
  const cid = text(claimId, 160);
  const h = text(hypothesis, 4000);
  const f = text(falsifier, 4000);
  const costCeiling = integer(costCeilingCents, 0, 1_000_000_000);
  const timeCeiling = integer(timeCeilingMinutes, 0, 60 * 24 * 365);
  if (!mid || !cid || !h || !f || costCeiling == null || timeCeiling == null ||
      !Array.isArray(candidateProbes) || candidateProbes.length === 0 || candidateProbes.length > 256) {
    return fail('MOONSHOT_EXPERIMENT_INVALID', ['moonshot-claim-hypothesis-falsifier-probes-and-bounds-required']);
  }

  const normalized = [];
  for (const raw of candidateProbes) {
    const probe = normalizeProbe(raw, cid);
    if (!probe) return fail('MOONSHOT_EXPERIMENT_INVALID', ['every-probe-must-have-measure-rule-outcomes-bounds-and-economics']);
    normalized.push(probe);
  }

  const selection = chooseMinimumRealityProbe({
    candidates: normalized.map(probe => ({
      id: probe.id,
      claimId: probe.claimId,
      measurement: probe.measurement,
      falsifier: probe.falsifiesHypothesis,
      informationGain: probe.informationGain,
      cost: probe.cost,
      risk: probe.risk,
      irreversibility: probe.irreversibility,
      delay: probe.delay,
      authorityReady: probe.authorityReady
    }))
  });
  if (!selection.ok) return selection;

  const selected = normalized.find(probe => probe.id === selection.selected.id);
  const feasibility = compileFeasibleBoundedExperiment({
    mission: `${mid} / ${cid}: ${h}`,
    hypothesis: h,
    falsifier: f,
    probes: [{
      description: selected.description,
      costCents: selected.costCents,
      timeMinutes: selected.timeMinutes,
      reversibility: selected.reversibility,
      measure: selected.measurement,
      decisionRule: selected.decisionRule,
      supportsHypothesis: selected.supportsHypothesis,
      falsifiesHypothesis: selected.falsifiesHypothesis
    }],
    costCeilingCents: costCeiling,
    timeCeilingMinutes: timeCeiling,
    reversibility: selected.reversibility,
    blastRadius,
    effects: selected.effects,
    authority
  });
  if (!feasibility.ok) return envelope({
    ok: false,
    status: 'MOONSHOT_EXPERIMENT_NOT_FEASIBLE',
    reasonCodes: feasibility.reasonCodes || ['bounded-experiment-policy-refused'],
    selectedProbeId: selected.id,
    boundedExperiment: feasibility
  });

  const preregistration = {
    schemaVersion: MOONSHOT_EXPERIMENT_COMPILER_VERSION,
    moonshotId: mid,
    claimId: cid,
    hypothesis: h,
    falsifier: f,
    selectedProbe: {
      id: selected.id,
      description: selected.description,
      measurement: selected.measurement,
      decisionRule: selected.decisionRule,
      supportsHypothesis: selected.supportsHypothesis,
      falsifiesHypothesis: selected.falsifiesHypothesis,
      costCents: selected.costCents,
      timeMinutes: selected.timeMinutes,
      reversibility: selected.reversibility
    },
    selectionEvidence: {
      selectedScore: selection.selected.score,
      rankedProbeIds: selection.ranked.map(row => row.id),
      scoreBoundary: selection.scoreBoundary
    },
    bounds: { costCeilingCents: costCeiling, timeCeilingMinutes: timeCeiling, blastRadius },
    boundedExperimentStatus: feasibility.status,
    runnable: feasibility.runnable === true,
    requiredAuthority: feasibility.requiredAuthority || [],
    executionAuthority: 'NONE_AT_COMPILATION',
    truthBoundary: 'PREREGISTRATION_AND_FEASIBILITY_DO_NOT_CREATE_EVIDENCE__ONLY_OBSERVED_RESULTS_CAN_UPDATE_THE_CLAIM'
  };

  return envelope({
    ok: true,
    status: feasibility.runnable
      ? 'MOONSHOT_ZERO_EFFECT_EXPERIMENT_READY'
      : 'MOONSHOT_EXPERIMENT_COMPILED_WITH_AUTHORITY_GATE',
    experimentId: `moonshot_exp_${digest(preregistration).slice(0,24)}`,
    preregistration,
    boundedExperiment: feasibility,
    executionAuthority: 'NONE',
    law: 'CHEAPEST_DISCRIMINATING_REVERSIBLE_PROBE_FIRST__CAPABILITY_NEVER_CREATES_AUTHORITY'
  });
}

export function compileReplicationContract({
  experimentId,
  originalResultRef,
  independentImplementationRequired = true,
  heldOutRequired = true,
  minimumReplications = 1
} = {}) {
  const id = text(experimentId, 200);
  const ref = text(originalResultRef, 1200);
  const count = integer(minimumReplications, 1, 20);
  if (!id || !ref || count == null) return fail('REPLICATION_CONTRACT_INVALID', ['experiment-result-ref-and-count-required']);
  return envelope({
    ok: true,
    status: 'REPLICATION_CONTRACT_READY',
    experimentId: id,
    originalResultRef: ref,
    independentImplementationRequired: Boolean(independentImplementationRequired),
    heldOutRequired: Boolean(heldOutRequired),
    minimumReplications: count,
    promotionAuthority: 'NONE',
    successBoundary: 'REPLICATION_IS_REQUIRED_EVIDENCE__NOT_AUTOMATIC_PROMOTION'
  });
}
