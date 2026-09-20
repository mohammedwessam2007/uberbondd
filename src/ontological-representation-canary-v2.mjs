import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ONTOLOGICAL_REPRESENTATION_CANARY_V2_VERSION = 'uberbond.ontological-representation-canary.v2';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

function range(start, endInclusive) {
  return Array.from({ length: endInclusive - start + 1 }, (_, index) => start + index);
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

function hashControl(x) {
  let z = (x + 0x9e3779b9) >>> 0;
  z ^= z >>> 16;
  z = Math.imul(z, 0x85ebca6b) >>> 0;
  z ^= z >>> 13;
  z = Math.imul(z, 0xc2b2ae35) >>> 0;
  z ^= z >>> 16;
  return (z >>> 31) & 1;
}

function atomDefinitions() {
  const atoms = [];
  for (let bit = 0; bit <= 5; bit += 1) {
    atoms.push({
      id: `BIT(${bit})`,
      complexity: 1,
      evaluate: x => (x >> bit) & 1
    });
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

function literalDefinitions(atoms) {
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

function representationGrammar() {
  const atoms = atomDefinitions();
  const literals = literalDefinitions(atoms);
  const features = [...literals];
  const operators = [
    ['AND', (a, b) => a && b ? 1 : 0],
    ['OR', (a, b) => a || b ? 1 : 0],
    ['XOR', (a, b) => a !== b ? 1 : 0]
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

const TASKS = Object.freeze([
  {
    id: 'XOR_BITS_1_3',
    representableByGrammar: true,
    label: x => (((x >> 1) & 1) !== ((x >> 3) & 1)) ? 1 : 0
  },
  {
    id: 'BIT2_AND_NOT_BIT5',
    representableByGrammar: true,
    label: x => (((x >> 2) & 1) && !((x >> 5) & 1)) ? 1 : 0
  },
  {
    id: 'NOT_BIT4_OR_MOD7_EQ3',
    representableByGrammar: true,
    label: x => (!((x >> 4) & 1) || x % 7 === 3) ? 1 : 0
  },
  {
    id: 'XOR_MOD3_EQ2_BIT0',
    representableByGrammar: true,
    label: x => ((x % 3 === 2) !== (((x >> 0) & 1) === 1)) ? 1 : 0
  },
  {
    id: 'NEGATIVE_HASH_CONTROL',
    representableByGrammar: false,
    label: x => hashControl(x)
  }
]);

function splitRows(task) {
  const all = range(0, 255).map(x => ({ x, y: task.label(x) }));
  return {
    train: all.filter(row => row.x % 4 === 0 || row.x % 4 === 1),
    validation: all.filter(row => row.x % 4 === 2),
    heldOut: all.filter(row => row.x % 4 === 3)
  };
}

function accuracy(rows, predict) {
  let correct = 0;
  for (const row of rows) if (predict(row.x) === row.y) correct += 1;
  return rows.length ? correct / rows.length : 0;
}

function majorityBaseline(train, heldOut) {
  const positives = train.reduce((sum, row) => sum + row.y, 0);
  const predicted = positives * 2 >= train.length ? 1 : 0;
  return accuracy(heldOut, () => predicted);
}

function rawThresholdModel(train) {
  const xs = [...new Set(train.map(row => row.x))].sort((a,b) => a-b);
  const thresholds = [xs[0] - 1];
  for (let i = 0; i < xs.length - 1; i += 1) thresholds.push((xs[i] + xs[i + 1]) / 2);
  thresholds.push(xs.at(-1) + 1);
  let best = null;
  for (const threshold of thresholds) {
    for (const direction of ['GE','LE']) {
      const predict = x => direction === 'GE' ? (x >= threshold ? 1 : 0) : (x <= threshold ? 1 : 0);
      const score = accuracy(train, predict);
      if (!best || score > best.trainAccuracy ||
          (score === best.trainAccuracy && threshold < best.threshold) ||
          (score === best.trainAccuracy && threshold === best.threshold && direction < best.direction)) {
        best = { threshold, direction, trainAccuracy: score, evaluations: thresholds.length * 2 };
      }
    }
  }
  return best;
}

function rawThresholdBaseline(train, heldOut) {
  const model = rawThresholdModel(train);
  return {
    accuracy: accuracy(heldOut, x =>
      model.direction === 'GE' ? (x >= model.threshold ? 1 : 0) : (x <= model.threshold ? 1 : 0)
    ),
    evaluations: model.evaluations
  };
}

function knnRawBaseline(train, heldOut, k = 3) {
  const predict = x => {
    const neighbors = train
      .map(row => ({ distance: Math.abs(row.x - x), x: row.x, y: row.y }))
      .sort((a,b) => a.distance - b.distance || a.x - b.x)
      .slice(0, k);
    const positives = neighbors.reduce((sum, row) => sum + row.y, 0);
    return positives * 2 >= neighbors.length ? 1 : 0;
  };
  return accuracy(heldOut, predict);
}

function atomicStumpBaseline(train, validation, heldOut, literals) {
  let best = null;
  let evaluated = 0;
  for (const feature of literals) {
    evaluated += 1;
    const trainAccuracy = accuracy(train, feature.evaluate);
    const validationAccuracy = accuracy(validation, feature.evaluate);
    const row = { feature, trainAccuracy, validationAccuracy };
    if (!best ||
        row.trainAccuracy > best.trainAccuracy ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy > best.validationAccuracy) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.feature.complexity < best.feature.complexity) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.feature.complexity === best.feature.complexity && row.feature.id < best.feature.id)) {
      best = row;
    }
  }
  return {
    accuracy: accuracy(heldOut, best.feature.evaluate),
    selectedFeature: best.feature.id,
    evaluations: evaluated
  };
}

function searchComposite(train, validation, features) {
  let best = null;
  let evaluated = 0;
  for (const feature of features) {
    for (const inverted of [false, true]) {
      evaluated += 1;
      const predict = inverted
        ? x => feature.evaluate(x) ? 0 : 1
        : x => feature.evaluate(x);
      const trainAccuracy = accuracy(train, predict);
      const validationAccuracy = accuracy(validation, predict);
      const row = {
        feature,
        inverted,
        trainAccuracy,
        validationAccuracy,
        predict
      };
      if (!best ||
          row.trainAccuracy > best.trainAccuracy ||
          (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy > best.validationAccuracy) ||
          (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.feature.complexity < best.feature.complexity) ||
          (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.feature.complexity === best.feature.complexity && row.feature.id < best.feature.id) ||
          (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.feature.complexity === best.feature.complexity && row.feature.id === best.feature.id && Number(row.inverted) < Number(best.inverted))) {
        best = row;
      }
    }
  }
  return { ...best, evaluated };
}

function evaluateTask(task, grammar) {
  const { train, validation, heldOut } = splitRows(task);
  const search = searchComposite(train, validation, grammar.features);
  const candidateHeldOutAccuracy = accuracy(heldOut, search.predict);
  const majority = majorityBaseline(train, heldOut);
  const rawThreshold = rawThresholdBaseline(train, heldOut);
  const atomic = atomicStumpBaseline(train, validation, heldOut, grammar.literals);
  const knn = knnRawBaseline(train, heldOut, 3);
  const baselineAccuracies = {
    MAJORITY_CLASS: majority,
    RAW_THRESHOLD: rawThreshold.accuracy,
    ATOMIC_FEATURE_STUMP: atomic.accuracy,
    KNN_RAW_K3: knn
  };
  const bestBaselineAccuracy = Math.max(...Object.values(baselineAccuracies));

  return {
    taskId: task.id,
    representableByGrammar: task.representableByGrammar,
    selectedRepresentation: search.feature.id,
    inverted: search.inverted,
    trainAccuracy: search.trainAccuracy,
    validationAccuracy: search.validationAccuracy,
    heldOutAccuracy: candidateHeldOutAccuracy,
    baselineAccuracies,
    bestBaselineAccuracy,
    heldOutImprovementOverBestBaseline: Number((candidateHeldOutAccuracy - bestBaselineAccuracy).toFixed(6)),
    candidateExpressionsEvaluated: search.evaluated,
    atomicBaselineExpressionsEvaluated: atomic.evaluations,
    rawThresholdEvaluations: rawThreshold.evaluations
  };
}

export function runOntologicalRepresentationCanaryV2() {
  const grammar = representationGrammar();
  const taskResults = TASKS.map(task => evaluateTask(task, grammar));
  const representable = taskResults.filter(row => row.representableByGrammar);
  const supported = representable.filter(row =>
    row.heldOutAccuracy >= 0.90 &&
    row.heldOutImprovementOverBestBaseline >= 0.10
  );
  const negative = taskResults.find(row => row.taskId === 'NEGATIVE_HASH_CONTROL');
  const negativeControlPassed = Boolean(negative && negative.heldOutAccuracy < 0.90);
  const success = supported.length >= 3 && negativeControlPassed;

  return envelope({
    ok: true,
    status: success
      ? 'V2_NARROW_REPRESENTATION_DISCOVERY_SUPPORTED__REVIEW_REQUIRED'
      : 'V2_PREREGISTERED_FALSIFIER_TRIGGERED_OR_NOT_SUPPORTED',
    preregistration: 'artifacts/research/ONTOLOGICAL_COMPUTING_CANARY_V2_PREREGISTRATION_20260920.json',
    heldOutUsedForSelection: false,
    frozenGrammar: {
      atomCount: grammar.atoms.length,
      literalCount: grammar.literals.length,
      expressionCount: grammar.features.length,
      maxCompositionDepth: 2
    },
    taskResults,
    supportedRepresentableTaskCount: supported.length,
    requiredSupportedRepresentableTaskCount: 3,
    negativeControlPassed,
    falsifierTriggered: !success,
    searchAccounting: {
      totalCandidateExpressionsEvaluated: taskResults.reduce((sum,row) => sum + row.candidateExpressionsEvaluated, 0),
      totalAtomicBaselineExpressionsEvaluated: taskResults.reduce((sum,row) => sum + row.atomicBaselineExpressionsEvaluated, 0),
      totalRawThresholdEvaluations: taskResults.reduce((sum,row) => sum + row.rawThresholdEvaluations, 0)
    },
    promotionCandidate: success ? {
      scope: 'GENERIC_COMPOSITIONAL_REPRESENTATION_SEARCH_IN_SYNTHETIC_REGIME',
      from: 'SIMULATION_READY',
      to: 'SOFTWARE_DEMONSTRATED',
      authority: 'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    } : null,
    claimBoundary: 'V2_TESTS_A_FROZEN_SYNTHETIC_GRAMMAR__IT_DOES_NOT_PROVE_NEW_MATHEMATICS_SCIENTIFIC_ONTOLOGY_OR_GENERAL_INTELLIGENCE'
  });
}

export const ONTOLOGICAL_REPRESENTATION_CANARY_V2_TASKS = Object.freeze(TASKS.map(row => row.id));
