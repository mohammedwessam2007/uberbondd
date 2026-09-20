import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ONTOLOGICAL_REPRESENTATION_CANARY_VERSION = 'uberbond.ontological-representation-canary.v1';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const REPRESENTATIONS = Object.freeze([
  { id: 'RAW_SCALAR', cost: 1, map: x => x },
  { id: 'PARITY', cost: 2, map: x => x % 2 },
  { id: 'MOD3_EQUALS_ONE', cost: 3, map: x => x % 3 === 1 ? 1 : 0 },
  { id: 'BIT2', cost: 2, map: x => (x >> 2) & 1 },
  { id: 'BIT4', cost: 2, map: x => (x >> 4) & 1 },
  { id: 'POPCOUNT', cost: 4, map: x => {
    let n = x >>> 0;
    let count = 0;
    while (n) { count += n & 1; n >>>= 1; }
    return count;
  }},
  { id: 'LOW_NIBBLE', cost: 2, map: x => x & 15 }
]);

const TASKS = Object.freeze([
  { id: 'EVENNESS', label: x => x % 2 === 0 ? 1 : 0 },
  { id: 'MOD3_EQUALS_ONE', label: x => x % 3 === 1 ? 1 : 0 },
  { id: 'BIT2_SET', label: x => ((x >> 2) & 1) === 1 ? 1 : 0 },
  { id: 'BIT4_SET', label: x => ((x >> 4) & 1) === 1 ? 1 : 0 }
]);

function range(start, endInclusive) {
  return Array.from({ length: endInclusive - start + 1 }, (_, i) => start + i);
}

function dataset(xs, label) {
  return xs.map(x => ({ x, y: label(x) }));
}

function thresholdCandidates(values) {
  const unique = [...new Set(values)].sort((a,b) => a-b);
  if (unique.length === 0) return [];
  const out = [unique[0] - 1];
  for (let i = 0; i < unique.length - 1; i += 1) out.push((unique[i] + unique[i + 1]) / 2);
  out.push(unique[unique.length - 1] + 1);
  return out;
}

function predict(value, threshold, direction) {
  return direction === 'GE' ? (value >= threshold ? 1 : 0) : (value <= threshold ? 1 : 0);
}

function accuracy(rows, representation, model) {
  let correct = 0;
  for (const row of rows) {
    const value = representation.map(row.x);
    if (predict(value, model.threshold, model.direction) === row.y) correct += 1;
  }
  return rows.length ? correct / rows.length : 0;
}

function fitThreshold(rows, representation) {
  const values = rows.map(row => representation.map(row.x));
  const thresholds = thresholdCandidates(values);
  let best = null;
  let modelCandidatesEvaluated = 0;
  for (const threshold of thresholds) {
    for (const direction of ['GE','LE']) {
      modelCandidatesEvaluated += 1;
      const model = { threshold, direction };
      const trainAccuracy = accuracy(rows, representation, model);
      const candidate = { ...model, trainAccuracy };
      if (!best ||
          candidate.trainAccuracy > best.trainAccuracy ||
          (candidate.trainAccuracy === best.trainAccuracy && candidate.threshold < best.threshold) ||
          (candidate.trainAccuracy === best.trainAccuracy && candidate.threshold === best.threshold && candidate.direction < best.direction)) {
        best = candidate;
      }
    }
  }
  return { model: best, modelCandidatesEvaluated };
}

function evaluateRepresentation({ task, representation, train, validation }) {
  const fit = fitThreshold(train, representation);
  return {
    representationId: representation.id,
    representationCost: representation.cost,
    model: fit.model,
    trainAccuracy: fit.model.trainAccuracy,
    validationAccuracy: accuracy(validation, representation, fit.model),
    thresholdModelsEvaluated: fit.modelCandidatesEvaluated
  };
}

function selectRepresentation({ task, train, validation }) {
  const candidates = REPRESENTATIONS.map(representation =>
    evaluateRepresentation({ task, representation, train, validation })
  );
  candidates.sort((a,b) =>
    b.validationAccuracy - a.validationAccuracy ||
    a.representationCost - b.representationCost ||
    a.thresholdModelsEvaluated - b.thresholdModelsEvaluated ||
    a.representationId.localeCompare(b.representationId)
  );
  return { selected: candidates[0], ranked: candidates };
}

function evaluateTask(task) {
  const train = dataset(range(0,47), task.label);
  const validation = dataset(range(48,63), task.label);
  const heldOut = dataset(range(64,127), task.label);

  const raw = REPRESENTATIONS.find(row => row.id === 'RAW_SCALAR');
  const rawFit = fitThreshold(train, raw);
  const rawValidationAccuracy = accuracy(validation, raw, rawFit.model);
  const rawHeldOutAccuracy = accuracy(heldOut, raw, rawFit.model);

  const search = selectRepresentation({ task, train, validation });
  const selectedRepresentation = REPRESENTATIONS.find(row => row.id === search.selected.representationId);
  const selectedHeldOutAccuracy = accuracy(heldOut, selectedRepresentation, search.selected.model);

  return {
    taskId: task.id,
    selectedRepresentation: search.selected.representationId,
    selectedTrainAccuracy: search.selected.trainAccuracy,
    selectedValidationAccuracy: search.selected.validationAccuracy,
    selectedHeldOutAccuracy,
    rawTrainAccuracy: rawFit.model.trainAccuracy,
    rawValidationAccuracy,
    rawHeldOutAccuracy,
    heldOutImprovement: Number((selectedHeldOutAccuracy - rawHeldOutAccuracy).toFixed(6)),
    representationCandidatesEvaluated: REPRESENTATIONS.length,
    searchThresholdModelsEvaluated: search.ranked.reduce((sum,row) => sum + row.thresholdModelsEvaluated, 0),
    baselineThresholdModelsEvaluated: rawFit.modelCandidatesEvaluated,
    selectedRepresentationCost: search.selected.representationCost
  };
}

export function runOntologicalRepresentationCanary() {
  const taskResults = TASKS.map(evaluateTask);
  const supported = taskResults.filter(row =>
    row.selectedHeldOutAccuracy >= 0.95 &&
    row.heldOutImprovement >= 0.20
  );
  const success = supported.length >= 3;
  const totalSearchThresholdModels = taskResults.reduce((sum,row) => sum + row.searchThresholdModelsEvaluated, 0);
  const totalBaselineThresholdModels = taskResults.reduce((sum,row) => sum + row.baselineThresholdModelsEvaluated, 0);

  return envelope({
    ok: true,
    status: success
      ? 'SOFTWARE_DEMONSTRATION_SUPPORTED__EXTERNAL_REVIEW_REQUIRED'
      : 'PREREGISTERED_CANARY_FALSIFIED_OR_NOT_SUPPORTED',
    preregistration: 'artifacts/research/ONTOLOGICAL_COMPUTING_CANARY_PREREGISTRATION_20260920.json',
    heldOutUsedForSelection: false,
    taskResults,
    supportedFamilyCount: supported.length,
    requiredSupportedFamilyCount: 3,
    resourceAccounting: {
      representationCandidatesPerTask: REPRESENTATIONS.length,
      totalSearchThresholdModels,
      totalBaselineThresholdModels,
      explicitSearchOverheadThresholdModels: totalSearchThresholdModels - totalBaselineThresholdModels
    },
    falsifierTriggered: !success,
    promotionCandidate: success ? {
      from: 'SIMULATION_READY',
      to: 'SOFTWARE_DEMONSTRATED',
      requiredEvidenceKind: 'SOFTWARE_RECEIPT',
      authority: 'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    } : null,
    claimBoundary: 'THIS_IS_A_SYNTHETIC_SOFTWARE_REPRESENTATION_SEARCH_CANARY__NOT_PROOF_OF_NEW_MATHEMATICS_ONTOLOGY_OR_GENERAL_INTELLIGENCE'
  });
}

export const ONTOLOGICAL_REPRESENTATION_CANARY_TASKS = Object.freeze(TASKS.map(row => row.id));
export const ONTOLOGICAL_REPRESENTATION_CANDIDATES = Object.freeze(REPRESENTATIONS.map(row => row.id));
