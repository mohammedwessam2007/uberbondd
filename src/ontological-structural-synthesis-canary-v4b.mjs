import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ONTOLOGICAL_STRUCTURAL_SYNTHESIS_CANARY_V4B_VERSION =
  'uberbond.ontological-structural-synthesis-canary.v4b';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

function popcount(x) {
  let n = x >>> 0;
  let count = 0;
  while (n) {
    count += n & 1;
    n >>>= 1;
  }
  return count;
}

function trueHiddenTarget(x) {
  let n = x;
  let parity = 0;
  for (let d = 2; d * d <= n; d += 1) {
    while (n % d === 0) {
      parity ^= 1;
      n = Math.floor(n / d);
    }
  }
  if (n > 1) parity ^= 1;
  return parity;
}

function divisorCountParity(x) {
  let count = 0;
  for (let d = 1; d * d <= x; d += 1) {
    if (x % d !== 0) continue;
    count += d * d === x ? 1 : 2;
  }
  return count & 1;
}

function primeIndicator(x) {
  if (x < 2) return 0;
  for (let d = 2; d * d <= x; d += 1) if (x % d === 0) return 0;
  return 1;
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

function splitBucket(x) {
  let z = (x + 0x9e3779b9) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  z = Math.imul(z, 0x85ebca6b) >>> 0;
  z = (z ^ (z >>> 13)) >>> 0;
  z = Math.imul(z, 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return z % 5;
}

function baseAtoms() {
  const atoms = [];
  for (let bit = 0; bit <= 5; bit += 1) {
    atoms.push({ id: `BIT(${bit})`, complexity: 1, evaluate: x => (x >> bit) & 1 });
  }
  for (let k = 2; k <= 7; k += 1) {
    for (let residue = 0; residue < k; residue += 1) {
      atoms.push({
        id: `RESIDUE_EQ(${k},${residue})`,
        complexity: 2,
        evaluate: x => x % k === residue ? 1 : 0
      });
    }
  }
  for (let threshold = 1; threshold <= 5; threshold += 1) {
    atoms.push({
      id: `POPCOUNT_GE(${threshold})`,
      complexity: 3,
      evaluate: x => popcount(x) >= threshold ? 1 : 0
    });
  }
  return atoms;
}

function baseLiterals(atoms) {
  const literals = [];
  for (const atom of atoms) {
    literals.push(atom);
    literals.push({
      id: `NOT(${atom.id})`,
      complexity: atom.complexity + 1,
      evaluate: x => atom.evaluate(x) ? 0 : 1
    });
  }
  return literals;
}

function baseGrammar() {
  const atoms = baseAtoms();
  const literals = baseLiterals(atoms);
  const features = [...literals];
  const operators = [
    ['AND', (a,b) => a && b ? 1 : 0],
    ['OR', (a,b) => a || b ? 1 : 0],
    ['XOR', (a,b) => a !== b ? 1 : 0]
  ];
  for (let i = 0; i < literals.length; i += 1) {
    for (let j = i + 1; j < literals.length; j += 1) {
      const left = literals[i];
      const right = literals[j];
      for (const [op, combine] of operators) {
        features.push({
          id: `${op}(${left.id},${right.id})`,
          complexity: left.complexity + right.complexity + 1,
          evaluate: x => combine(left.evaluate(x), right.evaluate(x))
        });
      }
    }
  }
  return { atoms, literals, features };
}

function applyEvent(state, update) {
  if (update === 'TOGGLE_PER_DIVISION_EVENT') return state ^ 1;
  if (update === 'SET_ONE_ON_EVENT') return 1;
  if (update === 'SET_ZERO_ON_EVENT') return 0;
  return state;
}

function applyLeftover(state, policy, working) {
  if (working <= 1 || policy === 'IGNORE_LEFTOVER') return state;
  if (policy === 'TOGGLE_IF_WORKING_GT_1') return state ^ 1;
  if (policy === 'SET_ONE_IF_WORKING_GT_1') return 1;
  return state;
}

function runStructuralProgram(x, spec) {
  let working = x;
  let state = spec.initialState;

  const processDivisor = d => {
    let hit = false;
    if (spec.divisionPolicy === 'SINGLE_IF_DIVISIBLE') {
      if (working % d === 0) {
        hit = true;
        working = Math.floor(working / d);
        if (spec.stateUpdate !== 'TOGGLE_ON_DIVISOR_HIT') {
          state = applyEvent(state, spec.stateUpdate);
        }
      }
    } else {
      while (working % d === 0) {
        hit = true;
        working = Math.floor(working / d);
        if (spec.stateUpdate !== 'TOGGLE_ON_DIVISOR_HIT') {
          state = applyEvent(state, spec.stateUpdate);
        }
      }
    }
    if (hit && spec.stateUpdate === 'TOGGLE_ON_DIVISOR_HIT') state ^= 1;
  };

  if (spec.divisorOrder === 'ASCENDING_2_TO_DYNAMIC_SQRT') {
    for (let d = 2; d * d <= working; d += 1) processDivisor(d);
  } else {
    for (let d = Math.floor(Math.sqrt(x)); d >= 2; d -= 1) processDivisor(d);
  }

  return applyLeftover(state, spec.leftoverPolicy, working);
}

function structuralProgramGrammar() {
  const rows = [];
  for (const divisorOrder of ['ASCENDING_2_TO_DYNAMIC_SQRT','DESCENDING_FROM_ORIGINAL_SQRT']) {
    for (const divisionPolicy of ['SINGLE_IF_DIVISIBLE','REPEAT_WHILE_DIVISIBLE']) {
      for (const stateUpdate of ['TOGGLE_PER_DIVISION_EVENT','TOGGLE_ON_DIVISOR_HIT','SET_ONE_ON_EVENT','SET_ZERO_ON_EVENT']) {
        for (const leftoverPolicy of ['IGNORE_LEFTOVER','TOGGLE_IF_WORKING_GT_1','SET_ONE_IF_WORKING_GT_1']) {
          for (const initialState of [0,1]) {
            const spec = { divisorOrder, divisionPolicy, stateUpdate, leftoverPolicy, initialState };
            const descriptionCost =
              1 +
              (divisorOrder === 'ASCENDING_2_TO_DYNAMIC_SQRT' ? 1 : 2) +
              (divisionPolicy === 'REPEAT_WHILE_DIVISIBLE' ? 1 : 2) +
              (stateUpdate.startsWith('TOGGLE') ? 1 : 2) +
              (leftoverPolicy === 'IGNORE_LEFTOVER' ? 1 : 2) +
              initialState;
            const id = [
              divisorOrder,
              divisionPolicy,
              stateUpdate,
              leftoverPolicy,
              `INIT_${initialState}`
            ].join('__');
            rows.push({
              id,
              descriptionCost,
              evaluate: x => runStructuralProgram(x, spec),
              spec
            });
          }
        }
      }
    }
  }
  return rows;
}

const TASKS = Object.freeze({
  DISCOVERY: { id: 'OMEGA_MULTIPLICITY_PARITY', label: x => trueHiddenTarget(x) },
  OMEGA_XOR_BIT3: {
    id: 'OMEGA_XOR_BIT3',
    label: x => trueHiddenTarget(x) ^ ((x >> 3) & 1)
  },
  OMEGA_XOR_MOD5_EQ2: {
    id: 'OMEGA_XOR_MOD5_EQ2',
    label: x => trueHiddenTarget(x) ^ (x % 5 === 2 ? 1 : 0)
  },
  OMEGA_AND_NOT_BIT2: {
    id: 'OMEGA_AND_NOT_BIT2',
    label: x => trueHiddenTarget(x) & (((x >> 2) & 1) ? 0 : 1)
  },
  NEGATIVE_HASH_CONTROL_V4B: {
    id: 'NEGATIVE_HASH_CONTROL_V4B',
    label: x => negativeHash(x)
  }
});

function universe() {
  return Array.from({ length: 2048 }, (_, i) => i + 2);
}

function splitFor(task) {
  const rows = universe().map(x => ({ x, y: task.label(x), bucket: splitBucket(x) }));
  return {
    train: rows.filter(row => row.bucket === 0 || row.bucket === 1),
    validation: rows.filter(row => row.bucket === 2),
    discoveryHeldOut: rows.filter(row => row.bucket === 3),
    transferHeldOut: rows.filter(row => row.bucket === 4)
  };
}

function accuracy(rows, predict) {
  let correct = 0;
  for (const row of rows) if (predict(row.x) === row.y) correct += 1;
  return rows.length ? correct / rows.length : 0;
}

function selectFeature({ train, validation, features, costKey = 'complexity' }) {
  let best = null;
  let evaluated = 0;
  for (const feature of features) {
    evaluated += 1;
    const trainAccuracy = accuracy(train, feature.evaluate);
    const validationAccuracy = accuracy(validation, feature.evaluate);
    const cost = Number(feature[costKey] ?? feature.complexity ?? 0);
    const row = { feature, trainAccuracy, validationAccuracy, cost };
    if (!best ||
        row.trainAccuracy > best.trainAccuracy ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy > best.validationAccuracy) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.cost < best.cost) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.cost === best.cost && row.feature.id < best.feature.id)) {
      best = row;
    }
  }
  return { ...best, evaluated };
}

function majorityBaseline(train, heldOut) {
  const positives = train.reduce((sum,row) => sum + row.y, 0);
  const label = positives * 2 >= train.length ? 1 : 0;
  return accuracy(heldOut, () => label);
}

function rawThresholdBaseline(train, heldOut) {
  const xs = [...new Set(train.map(row => row.x))].sort((a,b) => a-b);
  const thresholds = [xs[0] - 1];
  for (let i = 0; i < xs.length - 1; i += 1) thresholds.push((xs[i] + xs[i + 1]) / 2);
  thresholds.push(xs.at(-1) + 1);
  let best = null;
  let evaluated = 0;
  for (const threshold of thresholds) {
    for (const direction of ['GE','LE']) {
      evaluated += 1;
      const predict = x => direction === 'GE' ? (x >= threshold ? 1 : 0) : (x <= threshold ? 1 : 0);
      const trainAccuracy = accuracy(train, predict);
      if (!best || trainAccuracy > best.trainAccuracy ||
          (trainAccuracy === best.trainAccuracy && threshold < best.threshold) ||
          (trainAccuracy === best.trainAccuracy && threshold === best.threshold && direction < best.direction)) {
        best = { threshold, direction, trainAccuracy, predict };
      }
    }
  }
  return { accuracy: accuracy(heldOut, best.predict), evaluated };
}

function knnBaseline(train, heldOut, k = 3) {
  const predict = x => {
    const nearest = train
      .map(row => ({ x: row.x, y: row.y, distance: Math.abs(row.x - x) }))
      .sort((a,b) => a.distance - b.distance || a.x - b.x)
      .slice(0, k);
    return nearest.reduce((sum,row) => sum + row.y, 0) * 2 >= nearest.length ? 1 : 0;
  };
  return accuracy(heldOut, predict);
}

function orientedFixedBaseline(train, validation, heldOut, evaluator) {
  const direct = {
    inverted: false,
    trainAccuracy: accuracy(train, evaluator),
    validationAccuracy: accuracy(validation, evaluator),
    predict: evaluator
  };
  const invertedEvaluator = x => evaluator(x) ? 0 : 1;
  const inverse = {
    inverted: true,
    trainAccuracy: accuracy(train, invertedEvaluator),
    validationAccuracy: accuracy(validation, invertedEvaluator),
    predict: invertedEvaluator
  };
  const best = inverse.trainAccuracy > direct.trainAccuracy ||
    (inverse.trainAccuracy === direct.trainAccuracy && inverse.validationAccuracy > direct.validationAccuracy)
      ? inverse : direct;
  return { accuracy: accuracy(heldOut, best.predict), inverted: best.inverted };
}

function semanticNovelty(base) {
  const fixtures = Array.from({ length: 1022 }, (_, i) => i + 2);
  let nearest = null;
  const equivalents = [];
  for (const feature of base.features) {
    let mismatches = 0;
    for (const x of fixtures) if (feature.evaluate(x) !== trueHiddenTarget(x)) mismatches += 1;
    const mismatchRate = mismatches / fixtures.length;
    if (mismatches === 0) equivalents.push(feature.id);
    if (!nearest || mismatchRate < nearest.mismatchRate ||
        (mismatchRate === nearest.mismatchRate && feature.id < nearest.id)) {
      nearest = { id: feature.id, mismatchRate };
    }
  }
  return {
    fixtureId: 'integers-2-1023',
    fixtureSize: fixtures.length,
    candidatesCompared: base.features.length,
    exactEquivalentIds: equivalents,
    exactEquivalentFound: equivalents.length > 0,
    nearest: {
      id: nearest.id,
      mismatchRate: Number(nearest.mismatchRate.toFixed(8))
    },
    noveltyOnFixture: equivalents.length === 0
  };
}

function selectBaseForTasks(base, taskSplits) {
  const taskIds = Object.keys(taskSplits);
  const bestByTask = Object.fromEntries(taskIds.map(id => [id, null]));
  let featureEvaluations = 0;

  for (const feature of base.features) {
    for (const taskId of taskIds) {
      const split = taskSplits[taskId];
      featureEvaluations += split.train.length + split.validation.length;
      const trainAccuracy = accuracy(split.train, feature.evaluate);
      const validationAccuracy = accuracy(split.validation, feature.evaluate);
      const row = { feature, trainAccuracy, validationAccuracy };
      const best = bestByTask[taskId];
      if (!best ||
          trainAccuracy > best.trainAccuracy ||
          (trainAccuracy === best.trainAccuracy && validationAccuracy > best.validationAccuracy) ||
          (trainAccuracy === best.trainAccuracy && validationAccuracy === best.validationAccuracy && feature.complexity < best.feature.complexity) ||
          (trainAccuracy === best.trainAccuracy && validationAccuracy === best.validationAccuracy && feature.complexity === best.feature.complexity && feature.id < best.feature.id)) {
        bestByTask[taskId] = row;
      }
    }
  }

  return { bestByTask, featureEvaluations };
}

function baselineBundle(taskId, split, selectedBase, heldOutKey) {
  const heldOut = split[heldOutKey];
  const raw = rawThresholdBaseline(split.train, heldOut);
  const scores = {
    BEST_8626_BASE_BOOLEAN_GRAMMAR_FEATURE: accuracy(heldOut, selectedBase.feature.evaluate),
    RAW_THRESHOLD: raw.accuracy,
    KNN_RAW_K3: knnBaseline(split.train, heldOut, 3),
    MAJORITY_CLASS: majorityBaseline(split.train, heldOut),
    DIVISOR_COUNT_PARITY: orientedFixedBaseline(split.train, split.validation, heldOut, divisorCountParity).accuracy,
    PRIME_INDICATOR: orientedFixedBaseline(split.train, split.validation, heldOut, primeIndicator).accuracy
  };
  return {
    taskId,
    scores,
    bestAccuracy: Math.max(...Object.values(scores)),
    selectedBaseFeature: selectedBase.feature.id,
    rawThresholdEvaluations: raw.evaluated
  };
}

function transferFeatures(primitive, baseLiterals) {
  const p = { id: `SYNTH(${primitive.id})`, complexity: primitive.descriptionCost, evaluate: primitive.evaluate };
  const notP = { id: `NOT(${p.id})`, complexity: p.complexity + 1, evaluate: x => p.evaluate(x) ? 0 : 1 };
  const primaries = [p, notP];
  const rows = [...primaries];
  const operators = [
    ['AND', (a,b) => a && b ? 1 : 0],
    ['OR', (a,b) => a || b ? 1 : 0],
    ['XOR', (a,b) => a !== b ? 1 : 0]
  ];
  for (const primary of primaries) {
    for (const base of baseLiterals) {
      for (const [op, combine] of operators) {
        rows.push({
          id: `${op}(${primary.id},${base.id})`,
          complexity: primary.complexity + base.complexity + 1,
          evaluate: x => combine(primary.evaluate(x), base.evaluate(x))
        });
      }
    }
  }
  return rows;
}

export function runOntologicalStructuralSynthesisCanaryV4B() {
  const base = baseGrammar();
  const novelty = semanticNovelty(base);
  const grammar = structuralProgramGrammar();

  const discoverySplit = splitFor(TASKS.DISCOVERY);
  const structuralSelection = selectFeature({
    train: discoverySplit.train,
    validation: discoverySplit.validation,
    features: grammar,
    costKey: 'descriptionCost'
  });
  const frozenPrimitive = {
    id: structuralSelection.feature.id,
    descriptionCost: structuralSelection.feature.descriptionCost,
    evaluate: structuralSelection.feature.evaluate,
    spec: structuralSelection.feature.spec
  };

  const taskSplits = {
    DISCOVERY: discoverySplit,
    OMEGA_XOR_BIT3: splitFor(TASKS.OMEGA_XOR_BIT3),
    OMEGA_XOR_MOD5_EQ2: splitFor(TASKS.OMEGA_XOR_MOD5_EQ2),
    OMEGA_AND_NOT_BIT2: splitFor(TASKS.OMEGA_AND_NOT_BIT2),
    NEGATIVE_HASH_CONTROL_V4B: splitFor(TASKS.NEGATIVE_HASH_CONTROL_V4B)
  };

  const baseSelection = selectBaseForTasks(base, taskSplits);
  const discoveryBaseline = baselineBundle(
    'DISCOVERY',
    discoverySplit,
    baseSelection.bestByTask.DISCOVERY,
    'discoveryHeldOut'
  );
  const discoveryHeldOutAccuracy = accuracy(discoverySplit.discoveryHeldOut, frozenPrimitive.evaluate);
  const discoveryImprovement = Number((discoveryHeldOutAccuracy - discoveryBaseline.bestAccuracy).toFixed(6));
  const discoveryPassed =
    novelty.noveltyOnFixture &&
    novelty.nearest.mismatchRate >= 0.10 &&
    discoveryHeldOutAccuracy >= 0.95 &&
    discoveryImprovement >= 0.20;

  // Frozen here. Transfer labels cannot alter the synthesized structural program.
  const frozenTransferFeatures = transferFeatures(frozenPrimitive, base.literals);

  const transferIds = ['OMEGA_XOR_BIT3','OMEGA_XOR_MOD5_EQ2','OMEGA_AND_NOT_BIT2'];
  const transfers = transferIds.map(taskId => {
    const split = taskSplits[taskId];
    const selected = selectFeature({
      train: split.train,
      validation: split.validation,
      features: frozenTransferFeatures
    });
    const heldOutAccuracy = accuracy(split.transferHeldOut, selected.feature.evaluate);
    const baseline = baselineBundle(
      taskId,
      split,
      baseSelection.bestByTask[taskId],
      'transferHeldOut'
    );
    return {
      taskId,
      selectedRepresentation: selected.feature.id,
      heldOutAccuracy,
      baselineScores: baseline.scores,
      bestBaselineAccuracy: baseline.bestAccuracy,
      improvement: Number((heldOutAccuracy - baseline.bestAccuracy).toFixed(6)),
      transferExpressionsEvaluated: selected.evaluated,
      criterionPassed: heldOutAccuracy >= 0.95 &&
        heldOutAccuracy - baseline.bestAccuracy >= 0.15
    };
  });

  const negativeSplit = taskSplits.NEGATIVE_HASH_CONTROL_V4B;
  const selectedNegative = selectFeature({
    train: negativeSplit.train,
    validation: negativeSplit.validation,
    features: frozenTransferFeatures
  });
  const negativeHeldOutAccuracy = accuracy(
    negativeSplit.transferHeldOut,
    selectedNegative.feature.evaluate
  );
  const negativeBaseline = baselineBundle(
    'NEGATIVE_HASH_CONTROL_V4B',
    negativeSplit,
    baseSelection.bestByTask.NEGATIVE_HASH_CONTROL_V4B,
    'transferHeldOut'
  );
  const negativeControlPassed = negativeHeldOutAccuracy <= 0.85;

  const passingTransfers = transfers.filter(row => row.criterionPassed);
  const forbidden = /(OMEGA|LIOUVILLE|PRIME_FACTOR_COUNT|PRIME_FACTOR_MULTIPLICITY)/i;
  const selectedProgramContainsForbiddenPrimitive = forbidden.test(frozenPrimitive.id);
  const success =
    !selectedProgramContainsForbiddenPrimitive &&
    discoveryPassed &&
    passingTransfers.length >= 2 &&
    negativeControlPassed;

  return envelope({
    ok: true,
    status: success
      ? 'V4B_TARGET_BLIND_STRUCTURAL_PRIMITIVE_SUPPORTED__REVIEW_REQUIRED'
      : 'V4B_PREREGISTERED_FALSIFIER_TRIGGERED_OR_NOT_SUPPORTED',
    preregistration:
      'artifacts/research/ONTOLOGICAL_COMPUTING_CANARY_V4B_PREREGISTRATION_20260920.json',
    supersededPreregistration:
      'artifacts/research/ONTOLOGICAL_COMPUTING_CANARY_V4_PREREGISTRATION_20260920.json',
    heldOutUsedForPrimitiveSelection: false,
    transferLabelsUsedForPrimitiveSelection: false,
    semanticNovelty: novelty,
    baseOntology: {
      atomCount: base.atoms.length,
      literalCount: base.literals.length,
      featureCount: base.features.length
    },
    structuralGrammar: {
      candidateCount: grammar.length,
      selectedProgramId: frozenPrimitive.id,
      selectedProgramDescriptionCost: frozenPrimitive.descriptionCost,
      selectedProgramSpec: frozenPrimitive.spec,
      selectedProgramContainsForbiddenPrimitive
    },
    splitCounts: {
      train: discoverySplit.train.length,
      validation: discoverySplit.validation.length,
      discoveryHeldOut: discoverySplit.discoveryHeldOut.length,
      transferHeldOut: taskSplits.OMEGA_XOR_BIT3.transferHeldOut.length
    },
    discovery: {
      trainAccuracy: structuralSelection.trainAccuracy,
      validationAccuracy: structuralSelection.validationAccuracy,
      heldOutAccuracy: discoveryHeldOutAccuracy,
      baselineScores: discoveryBaseline.scores,
      bestBaselineAccuracy: discoveryBaseline.bestAccuracy,
      improvement: discoveryImprovement,
      criterionPassed: discoveryPassed,
      structuralProgramsEvaluated: structuralSelection.evaluated
    },
    transfers,
    passingTransferCount: passingTransfers.length,
    requiredPassingTransferCount: 2,
    negativeControl: {
      taskId: 'NEGATIVE_HASH_CONTROL_V4B',
      selectedRepresentation: selectedNegative.feature.id,
      heldOutAccuracy: negativeHeldOutAccuracy,
      baselineScores: negativeBaseline.scores,
      bestBaselineAccuracy: negativeBaseline.bestAccuracy,
      negativeControlPassed
    },
    searchAccounting: {
      semanticNoveltyFeatureFixtureEvaluations: base.features.length * 1022,
      baseSelectionRowEvaluations: baseSelection.featureEvaluations,
      structuralProgramCandidates: grammar.length,
      transferCandidateCount: frozenTransferFeatures.length,
      totalTransferCandidateSelections:
        frozenTransferFeatures.length * 4,
      rawThresholdEvaluationBurden:
        discoveryBaseline.rawThresholdEvaluations +
        transferIds.reduce((sum, taskId) => {
          const split = taskSplits[taskId];
          return sum + (split.train.length + 1) * 2;
        }, 0)
    },
    falsifierTriggered: !success,
    promotionCandidate: success ? {
      scope: 'FINITE_SYNTHETIC_TARGET_BLIND_STRUCTURAL_PRIMITIVE_SYNTHESIS_AND_TRANSFER',
      from: 'SIMULATION_READY',
      to: 'SOFTWARE_DEMONSTRATED',
      authority: 'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    } : null,
    claimBoundary:
      'V4B_IS_A_FINITE_SYNTHETIC_TARGET_BLIND_PROGRAM_SEARCH__IT_DOES_NOT_PROVE_OPEN_ENDED_ONTOLOGY_INVENTION_NEW_MATHEMATICS_SCIENTIFIC_DISCOVERY_OR_GENERAL_INTELLIGENCE'
  });
}

export const ONTOLOGICAL_STRUCTURAL_SYNTHESIS_V4B_TASK_IDS =
  Object.freeze(Object.values(TASKS).map(task => task.id));
