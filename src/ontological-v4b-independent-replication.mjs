import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ONTOLOGICAL_V4B_INDEPENDENT_REPLICATION_VERSION =
  'uberbond.ontological-v4b-independent-replication.v1';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const MIN_X = 2;
const MAX_X = 2049;
const COUNT = MAX_X - MIN_X + 1;

function xs() {
  return Array.from({ length: COUNT }, (_, i) => i + MIN_X);
}

function indexOfX(x) {
  return x - MIN_X;
}

function splitBucket(x) {
  let z = (x + 0x9e3779b9) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  z = Math.imul(z, 0x85ebca6b) >>> 0;
  z = (z ^ (z >>> 13)) >>> 0;
  z = Math.imul(z, 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return z % 5;
}

function negativeHash(x) {
  let z = (x + 0x7f4a7c15) >>> 0;
  z = (z ^ (z >>> 15)) >>> 0;
  z = Math.imul(z, 0x2c1b3c6d) >>> 0;
  z = (z ^ (z >>> 12)) >>> 0;
  z = Math.imul(z, 0x297a2d39) >>> 0;
  z = (z ^ (z >>> 15)) >>> 0;
  return (z >>> 29) & 1;
}

function buildSmallestPrimeFactor(limit) {
  const spf = new Uint32Array(limit + 1);
  for (let p = 2; p <= limit; p += 1) {
    if (spf[p] !== 0) continue;
    for (let multiple = p; multiple <= limit; multiple += p) {
      if (spf[multiple] === 0) spf[multiple] = p;
    }
  }
  return spf;
}

function buildOmegaParityBySieve(limit, spf) {
  const parity = new Uint8Array(limit + 1);
  for (let n = 2; n <= limit; n += 1) {
    const p = spf[n];
    parity[n] = parity[Math.floor(n / p)] ^ 1;
  }
  return parity;
}

function popcount(x) {
  let n = x >>> 0;
  let count = 0;
  while (n) {
    count += n & 1;
    n >>>= 1;
  }
  return count;
}

function vectorFrom(fn) {
  const out = new Uint8Array(COUNT);
  for (let x = MIN_X; x <= MAX_X; x += 1) out[indexOfX(x)] = fn(x);
  return out;
}

function notVector(a) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] ? 0 : 1;
  return out;
}

function combineVectors(a, b, op) {
  const out = new Uint8Array(a.length);
  if (op === 'AND') {
    for (let i = 0; i < a.length; i += 1) out[i] = a[i] && b[i] ? 1 : 0;
  } else if (op === 'OR') {
    for (let i = 0; i < a.length; i += 1) out[i] = a[i] || b[i] ? 1 : 0;
  } else {
    for (let i = 0; i < a.length; i += 1) out[i] = a[i] !== b[i] ? 1 : 0;
  }
  return out;
}

function buildBaseLiterals() {
  const atoms = [];
  for (let bit = 0; bit <= 5; bit += 1) {
    atoms.push({
      id: 'BIT(' + bit + ')',
      complexity: 1,
      outputs: vectorFrom(x => (x >> bit) & 1)
    });
  }
  for (let k = 2; k <= 7; k += 1) {
    for (let residue = 0; residue < k; residue += 1) {
      atoms.push({
        id: 'RESIDUE_EQ(' + k + ',' + residue + ')',
        complexity: 2,
        outputs: vectorFrom(x => x % k === residue ? 1 : 0)
      });
    }
  }
  for (let threshold = 1; threshold <= 5; threshold += 1) {
    atoms.push({
      id: 'POPCOUNT_GE(' + threshold + ')',
      complexity: 3,
      outputs: vectorFrom(x => popcount(x) >= threshold ? 1 : 0)
    });
  }

  const literals = [];
  for (const atom of atoms) {
    literals.push(atom);
    literals.push({
      id: 'NOT(' + atom.id + ')',
      complexity: atom.complexity + 1,
      outputs: notVector(atom.outputs)
    });
  }
  return { atoms, literals };
}

function labelVectors(omegaParity) {
  return {
    DISCOVERY: vectorFrom(x => omegaParity[x]),
    OMEGA_XOR_BIT3: vectorFrom(x => omegaParity[x] ^ ((x >> 3) & 1)),
    OMEGA_XOR_MOD5_EQ2: vectorFrom(x => omegaParity[x] ^ (x % 5 === 2 ? 1 : 0)),
    OMEGA_AND_NOT_BIT2: vectorFrom(x => omegaParity[x] & (((x >> 2) & 1) ? 0 : 1)),
    NEGATIVE_HASH_CONTROL_V4B: vectorFrom(x => negativeHash(x))
  };
}

function bucketIndices() {
  const buckets = [[],[],[],[],[]];
  for (let x = MIN_X; x <= MAX_X; x += 1) buckets[splitBucket(x)].push(indexOfX(x));
  return {
    train: buckets[0].concat(buckets[1]),
    validation: buckets[2],
    discoveryHeldOut: buckets[3],
    transferHeldOut: buckets[4],
    counts: buckets.map(bucket => bucket.length)
  };
}

function accuracyOnIndices(outputs, labels, indices) {
  let correct = 0;
  for (const index of indices) if (outputs[index] === labels[index]) correct += 1;
  return indices.length ? correct / indices.length : 0;
}

function considerBest(current, row) {
  if (!current ||
      row.trainAccuracy > current.trainAccuracy ||
      (row.trainAccuracy === current.trainAccuracy && row.validationAccuracy > current.validationAccuracy) ||
      (row.trainAccuracy === current.trainAccuracy && row.validationAccuracy === current.validationAccuracy && row.complexity < current.complexity) ||
      (row.trainAccuracy === current.trainAccuracy && row.validationAccuracy === current.validationAccuracy && row.complexity === current.complexity && row.id < current.id)) {
    return row;
  }
  return current;
}

function scanBaseOntology(literals, labels, indices, omegaParity) {
  const taskIds = Object.keys(labels);
  const best = Object.fromEntries(taskIds.map(id => [id, null]));
  let nearest = null;
  const exact = [];
  let candidates = 0;
  let rowEvaluations = 0;
  const noveltyIndices = [];
  for (let x = 2; x <= 1023; x += 1) noveltyIndices.push(indexOfX(x));

  const visit = (id, complexity, outputs) => {
    candidates += 1;
    let mismatches = 0;
    for (const index of noveltyIndices) {
      const x = index + MIN_X;
      if (outputs[index] !== omegaParity[x]) mismatches += 1;
    }
    const mismatchRate = mismatches / noveltyIndices.length;
    if (mismatches === 0) exact.push(id);
    if (!nearest || mismatchRate < nearest.mismatchRate ||
        (mismatchRate === nearest.mismatchRate && id < nearest.id)) {
      nearest = { id, mismatchRate };
    }

    for (const taskId of taskIds) {
      const trainAccuracy = accuracyOnIndices(outputs, labels[taskId], indices.train);
      const validationAccuracy = accuracyOnIndices(outputs, labels[taskId], indices.validation);
      rowEvaluations += indices.train.length + indices.validation.length;
      best[taskId] = considerBest(best[taskId], {
        id,
        complexity,
        outputs: new Uint8Array(outputs),
        trainAccuracy,
        validationAccuracy
      });
    }
  };

  for (const literal of literals) visit(literal.id, literal.complexity, literal.outputs);

  const ops = ['AND','OR','XOR'];
  for (let i = 0; i < literals.length; i += 1) {
    for (let j = i + 1; j < literals.length; j += 1) {
      const left = literals[i];
      const right = literals[j];
      for (const op of ops) {
        visit(
          op + '(' + left.id + ',' + right.id + ')',
          left.complexity + right.complexity + 1,
          combineVectors(left.outputs, right.outputs, op)
        );
      }
    }
  }

  return {
    featureCount: candidates,
    bestByTask: best,
    rowEvaluations,
    semanticNovelty: {
      fixtureId: 'integers-2-1023',
      fixtureSize: noveltyIndices.length,
      exactEquivalentIds: exact,
      exactEquivalentFound: exact.length > 0,
      nearest: {
        id: nearest.id,
        mismatchRate: Number(nearest.mismatchRate.toFixed(8))
      },
      candidatesCompared: candidates
    }
  };
}

function applyStructuralEvent(state, update) {
  if (update === 'TOGGLE_PER_DIVISION_EVENT') return state ^ 1;
  if (update === 'SET_ONE_ON_EVENT') return 1;
  if (update === 'SET_ZERO_ON_EVENT') return 0;
  return state;
}

function evaluateStructuralProgram(x, spec) {
  let work = x;
  let state = spec.initialState;

  const consume = divisor => {
    let hit = false;
    if (spec.divisionPolicy === 'SINGLE_IF_DIVISIBLE') {
      if (work % divisor === 0) {
        hit = true;
        work = Math.floor(work / divisor);
        if (spec.stateUpdate !== 'TOGGLE_ON_DIVISOR_HIT') {
          state = applyStructuralEvent(state, spec.stateUpdate);
        }
      }
    } else {
      while (work % divisor === 0) {
        hit = true;
        work = Math.floor(work / divisor);
        if (spec.stateUpdate !== 'TOGGLE_ON_DIVISOR_HIT') {
          state = applyStructuralEvent(state, spec.stateUpdate);
        }
      }
    }
    if (hit && spec.stateUpdate === 'TOGGLE_ON_DIVISOR_HIT') state ^= 1;
  };

  if (spec.divisorOrder === 'ASCENDING_2_TO_DYNAMIC_SQRT') {
    for (let d = 2; d * d <= work; d += 1) consume(d);
  } else {
    for (let d = Math.floor(Math.sqrt(x)); d >= 2; d -= 1) consume(d);
  }

  if (work > 1) {
    if (spec.leftoverPolicy === 'TOGGLE_IF_WORKING_GT_1') state ^= 1;
    else if (spec.leftoverPolicy === 'SET_ONE_IF_WORKING_GT_1') state = 1;
  }
  return state;
}

function structuralCandidates() {
  const rows = [];
  for (const divisorOrder of ['ASCENDING_2_TO_DYNAMIC_SQRT','DESCENDING_FROM_ORIGINAL_SQRT']) {
    for (const divisionPolicy of ['SINGLE_IF_DIVISIBLE','REPEAT_WHILE_DIVISIBLE']) {
      for (const stateUpdate of ['TOGGLE_PER_DIVISION_EVENT','TOGGLE_ON_DIVISOR_HIT','SET_ONE_ON_EVENT','SET_ZERO_ON_EVENT']) {
        for (const leftoverPolicy of ['IGNORE_LEFTOVER','TOGGLE_IF_WORKING_GT_1','SET_ONE_IF_WORKING_GT_1']) {
          for (const initialState of [0,1]) {
            const descriptionCost =
              1 +
              (divisorOrder === 'ASCENDING_2_TO_DYNAMIC_SQRT' ? 1 : 2) +
              (divisionPolicy === 'REPEAT_WHILE_DIVISIBLE' ? 1 : 2) +
              (stateUpdate.indexOf('TOGGLE') === 0 ? 1 : 2) +
              (leftoverPolicy === 'IGNORE_LEFTOVER' ? 1 : 2) +
              initialState;
            const id = [
              divisorOrder,
              divisionPolicy,
              stateUpdate,
              leftoverPolicy,
              'INIT_' + initialState
            ].join('__');
            rows.push({
              id,
              descriptionCost,
              spec:{ divisorOrder, divisionPolicy, stateUpdate, leftoverPolicy, initialState }
            });
          }
        }
      }
    }
  }
  return rows;
}

function selectStructural(labels, indices) {
  let best = null;
  let evaluated = 0;
  for (const candidate of structuralCandidates()) {
    evaluated += 1;
    const outputs = vectorFrom(x => evaluateStructuralProgram(x, candidate.spec));
    const row = {
      id: candidate.id,
      descriptionCost: candidate.descriptionCost,
      spec: candidate.spec,
      outputs,
      trainAccuracy: accuracyOnIndices(outputs, labels, indices.train),
      validationAccuracy: accuracyOnIndices(outputs, labels, indices.validation)
    };
    if (!best ||
        row.trainAccuracy > best.trainAccuracy ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy > best.validationAccuracy) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.descriptionCost < best.descriptionCost) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.descriptionCost === best.descriptionCost && row.id < best.id)) {
      best = row;
    }
  }
  return { ...best, evaluated };
}

function majorityBaseline(labels, indices, heldOut) {
  let positives = 0;
  for (const index of indices.train) positives += labels[index];
  const predicted = positives * 2 >= indices.train.length ? 1 : 0;
  let correct = 0;
  for (const index of heldOut) if (labels[index] === predicted) correct += 1;
  return correct / heldOut.length;
}

function rawThresholdBaseline(labels, indices, heldOut) {
  const trainXs = indices.train.map(index => index + MIN_X).sort((a,b) => a-b);
  const thresholds = [trainXs[0] - 1];
  for (let i = 0; i < trainXs.length - 1; i += 1) thresholds.push((trainXs[i] + trainXs[i + 1]) / 2);
  thresholds.push(trainXs.at(-1) + 1);
  let best = null;
  let evaluated = 0;

  for (const threshold of thresholds) {
    for (const direction of ['GE','LE']) {
      evaluated += 1;
      let correct = 0;
      for (const index of indices.train) {
        const x = index + MIN_X;
        const prediction = direction === 'GE' ? (x >= threshold ? 1 : 0) : (x <= threshold ? 1 : 0);
        if (prediction === labels[index]) correct += 1;
      }
      const trainAccuracy = correct / indices.train.length;
      if (!best || trainAccuracy > best.trainAccuracy ||
          (trainAccuracy === best.trainAccuracy && threshold < best.threshold) ||
          (trainAccuracy === best.trainAccuracy && threshold === best.threshold && direction < best.direction)) {
        best = { threshold, direction, trainAccuracy };
      }
    }
  }

  let correct = 0;
  for (const index of heldOut) {
    const x = index + MIN_X;
    const prediction = best.direction === 'GE' ? (x >= best.threshold ? 1 : 0) : (x <= best.threshold ? 1 : 0);
    if (prediction === labels[index]) correct += 1;
  }
  return { accuracy: correct / heldOut.length, evaluated };
}

function knnBaseline(labels, indices, heldOut, k = 3) {
  let correct = 0;
  const train = indices.train.map(index => ({ x:index + MIN_X, y:labels[index] }));
  for (const testIndex of heldOut) {
    const x = testIndex + MIN_X;
    const nearest = train
      .map(row => ({ x:row.x, y:row.y, distance:Math.abs(row.x - x) }))
      .sort((a,b) => a.distance - b.distance || a.x - b.x)
      .slice(0,k);
    const prediction = nearest.reduce((sum,row) => sum + row.y, 0) * 2 >= nearest.length ? 1 : 0;
    if (prediction === labels[testIndex]) correct += 1;
  }
  return correct / heldOut.length;
}

function fixedOrientedBaseline(labels, indices, heldOut, outputs) {
  const directTrain = accuracyOnIndices(outputs, labels, indices.train);
  const inverseOutputs = notVector(outputs);
  const inverseTrain = accuracyOnIndices(inverseOutputs, labels, indices.train);
  const directValidation = accuracyOnIndices(outputs, labels, indices.validation);
  const inverseValidation = accuracyOnIndices(inverseOutputs, labels, indices.validation);
  const selected = inverseTrain > directTrain ||
    (inverseTrain === directTrain && inverseValidation > directValidation)
      ? inverseOutputs : outputs;
  return accuracyOnIndices(selected, labels, heldOut);
}

function baselineBundle(taskId, labels, indices, heldOut, selectedBase, spf) {
  const threshold = rawThresholdBaseline(labels, indices, heldOut);
  const squareParity = vectorFrom(x => Number.isInteger(Math.sqrt(x)) ? 1 : 0);
  const primes = vectorFrom(x => spf[x] === x ? 1 : 0);
  const scores = {
    BEST_8626_BASE_BOOLEAN_GRAMMAR_FEATURE: accuracyOnIndices(selectedBase.outputs, labels, heldOut),
    RAW_THRESHOLD: threshold.accuracy,
    KNN_RAW_K3: knnBaseline(labels, indices, heldOut, 3),
    MAJORITY_CLASS: majorityBaseline(labels, indices, heldOut),
    DIVISOR_COUNT_PARITY: fixedOrientedBaseline(labels, indices, heldOut, squareParity),
    PRIME_INDICATOR: fixedOrientedBaseline(labels, indices, heldOut, primes)
  };
  return {
    taskId,
    scores,
    bestAccuracy: Math.max(...Object.values(scores)),
    rawThresholdEvaluations: threshold.evaluated
  };
}

function transferCandidateScan(primitiveOutputs, primitiveId, primitiveCost, literals, labels, indices) {
  const primitive = {
    id:'SYNTH(' + primitiveId + ')',
    complexity:primitiveCost,
    outputs:primitiveOutputs
  };
  const notPrimitive = {
    id:'NOT(' + primitive.id + ')',
    complexity:primitiveCost + 1,
    outputs:notVector(primitiveOutputs)
  };
  const primaries = [primitive, notPrimitive];
  const ops = ['AND','OR','XOR'];
  let best = null;
  let candidates = 0;

  const visit = (id, complexity, outputs) => {
    candidates += 1;
    const row = {
      id,
      complexity,
      outputs,
      trainAccuracy:accuracyOnIndices(outputs, labels, indices.train),
      validationAccuracy:accuracyOnIndices(outputs, labels, indices.validation)
    };
    best = considerBest(best, row);
  };

  for (const primary of primaries) visit(primary.id, primary.complexity, primary.outputs);
  for (const primary of primaries) {
    for (const literal of literals) {
      for (const op of ops) {
        visit(
          op + '(' + primary.id + ',' + literal.id + ')',
          primary.complexity + literal.complexity + 1,
          combineVectors(primary.outputs, literal.outputs, op)
        );
      }
    }
  }
  return { ...best, candidates };
}

function nearlyEqual(a,b,tolerance) {
  return Math.abs(a-b) <= tolerance;
}

export function runOntologicalV4BIndependentReplication() {
  const spf = buildSmallestPrimeFactor(MAX_X);
  const omegaParity = buildOmegaParityBySieve(MAX_X, spf);
  const labels = labelVectors(omegaParity);
  const indices = bucketIndices();
  const baseParts = buildBaseLiterals();
  const baseScan = scanBaseOntology(baseParts.literals, labels, indices, omegaParity);
  const structural = selectStructural(labels.DISCOVERY, indices);

  const discoveryBaseline = baselineBundle(
    'DISCOVERY',
    labels.DISCOVERY,
    indices,
    indices.discoveryHeldOut,
    baseScan.bestByTask.DISCOVERY,
    spf
  );
  const discoveryHeldOutAccuracy =
    accuracyOnIndices(structural.outputs, labels.DISCOVERY, indices.discoveryHeldOut);
  const discoveryImprovement =
    Number((discoveryHeldOutAccuracy - discoveryBaseline.bestAccuracy).toFixed(6));

  const transferIds = ['OMEGA_XOR_BIT3','OMEGA_XOR_MOD5_EQ2','OMEGA_AND_NOT_BIT2'];
  const transfers = {};
  for (const taskId of transferIds) {
    const selected = transferCandidateScan(
      structural.outputs,
      structural.id,
      structural.descriptionCost,
      baseParts.literals,
      labels[taskId],
      indices
    );
    const baseline = baselineBundle(
      taskId,
      labels[taskId],
      indices,
      indices.transferHeldOut,
      baseScan.bestByTask[taskId],
      spf
    );
    const heldOutAccuracy =
      accuracyOnIndices(selected.outputs, labels[taskId], indices.transferHeldOut);
    transfers[taskId] = {
      selectedRepresentation:selected.id,
      heldOutAccuracy,
      bestBaselineAccuracy:baseline.bestAccuracy,
      improvement:Number((heldOutAccuracy - baseline.bestAccuracy).toFixed(6)),
      candidateCount:selected.candidates
    };
  }

  const negativeSelected = transferCandidateScan(
    structural.outputs,
    structural.id,
    structural.descriptionCost,
    baseParts.literals,
    labels.NEGATIVE_HASH_CONTROL_V4B,
    indices
  );
  const negativeHeldOutAccuracy = accuracyOnIndices(
    negativeSelected.outputs,
    labels.NEGATIVE_HASH_CONTROL_V4B,
    indices.transferHeldOut
  );

  const expected = {
    nearestId:'XOR(NOT(RESIDUE_EQ(3,0)),RESIDUE_EQ(4,2))',
    nearestMismatchRate:0.4295499,
    selectedProgramId:'ASCENDING_2_TO_DYNAMIC_SQRT__REPEAT_WHILE_DIVISIBLE__TOGGLE_PER_DIVISION_EVENT__TOGGLE_IF_WORKING_GT_1__INIT_0',
    discoveryBestBaseline:0.6255707762557078,
    discoveryImprovement:0.374429,
    transfers:{
      OMEGA_XOR_BIT3:{bestBaseline:0.5472154963680388,improvement:0.452785},
      OMEGA_XOR_MOD5_EQ2:{bestBaseline:0.5786924939467313,improvement:0.421308},
      OMEGA_AND_NOT_BIT2:{bestBaseline:0.7675544794188862,improvement:0.232446}
    },
    negativeHeldOut:0.4745762711864407
  };

  const mismatches = [];
  const requireMatch = (condition, code) => { if (!condition) mismatches.push(code); };
  requireMatch(baseScan.featureCount === 8626, 'base-feature-count');
  requireMatch(baseScan.semanticNovelty.exactEquivalentFound === false, 'semantic-equivalence');
  requireMatch(baseScan.semanticNovelty.nearest.id === expected.nearestId, 'nearest-base-id');
  requireMatch(nearlyEqual(baseScan.semanticNovelty.nearest.mismatchRate, expected.nearestMismatchRate, 1e-8), 'nearest-mismatch-rate');
  requireMatch(structural.id === expected.selectedProgramId, 'selected-program-id');
  requireMatch(structural.evaluated === 96, 'structural-candidate-count');
  requireMatch(indices.train.length === 794, 'train-count');
  requireMatch(indices.validation.length === 403, 'validation-count');
  requireMatch(indices.discoveryHeldOut.length === 438, 'discovery-heldout-count');
  requireMatch(indices.transferHeldOut.length === 413, 'transfer-heldout-count');
  requireMatch(nearlyEqual(discoveryHeldOutAccuracy, 1, 1e-12), 'discovery-heldout-accuracy');
  requireMatch(nearlyEqual(discoveryBaseline.bestAccuracy, expected.discoveryBestBaseline, 1e-12), 'discovery-best-baseline');
  requireMatch(nearlyEqual(discoveryImprovement, expected.discoveryImprovement, 1e-6), 'discovery-improvement');
  for (const taskId of transferIds) {
    requireMatch(nearlyEqual(transfers[taskId].heldOutAccuracy, 1, 1e-12), taskId + '-heldout');
    requireMatch(nearlyEqual(transfers[taskId].bestBaselineAccuracy, expected.transfers[taskId].bestBaseline, 1e-12), taskId + '-baseline');
    requireMatch(nearlyEqual(transfers[taskId].improvement, expected.transfers[taskId].improvement, 1e-6), taskId + '-improvement');
  }
  requireMatch(nearlyEqual(negativeHeldOutAccuracy, expected.negativeHeldOut, 1e-12), 'negative-heldout');

  return envelope({
    ok:true,
    status:mismatches.length
      ? 'V4B_INDEPENDENT_REPLICATION_MISMATCH'
      : 'V4B_INDEPENDENT_REPLICATION_MATCHED',
    preregistration:
      'artifacts/research/ONTOLOGICAL_COMPUTING_CANARY_V4B_REPLICATION_PREREGISTRATION_20260920.json',
    importsPrimaryV4BModule:false,
    implementationPath:{
      targetLabels:'SMALLEST_PRIME_FACTOR_SIEVE',
      baseOntology:'BOOLEAN_VECTOR_SIGNATURES',
      structuralSearch:'INDEPENDENT_STATE_MACHINE_INTERPRETER'
    },
    semanticNovelty:baseScan.semanticNovelty,
    selectedProgram:{
      id:structural.id,
      descriptionCost:structural.descriptionCost,
      candidateCount:structural.evaluated
    },
    splitCounts:{
      train:indices.train.length,
      validation:indices.validation.length,
      discoveryHeldOut:indices.discoveryHeldOut.length,
      transferHeldOut:indices.transferHeldOut.length
    },
    discovery:{
      heldOutAccuracy:discoveryHeldOutAccuracy,
      bestBaselineAccuracy:discoveryBaseline.bestAccuracy,
      improvement:discoveryImprovement
    },
    transfers,
    negativeControl:{heldOutAccuracy:negativeHeldOutAccuracy},
    comparison:{
      allMatch:mismatches.length === 0,
      mismatches
    },
    searchAccounting:{
      baseFeatureCount:baseScan.featureCount,
      baseSelectionRowEvaluations:baseScan.rowEvaluations,
      structuralCandidates:structural.evaluated,
      transferCandidateCountPerTask:transfers.OMEGA_XOR_BIT3.candidateCount
    },
    promotionBoundary:
      'MATCHING_SECOND_IMPLEMENTATION_CAN_SUPPORT_NARROW_SOFTWARE_DEMONSTRATED_REVIEW_ONLY__NOT_GRAND_MOONSHOT_PROMOTION'
  });
}
