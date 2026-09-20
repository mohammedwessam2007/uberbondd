import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const EXTERNAL_ARITHMETIC_FAMILY_CANARY_V5_VERSION =
  'uberbond.external-arithmetic-family-canary.v5';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const MIN_X = 2;
const MAX_X = 4097;
const COUNT = MAX_X - MIN_X + 1;

function popcount(x) {
  let n = x >>> 0;
  let count = 0;
  while (n) {
    count += n & 1;
    n >>>= 1;
  }
  return count;
}

function factorStats(x) {
  let n = x;
  let distinct = 0;
  let multiplicityParity = 0;
  let squarefree = 1;
  for (let p = 2; p * p <= n; p += 1) {
    if (n % p !== 0) continue;
    distinct += 1;
    let exponent = 0;
    while (n % p === 0) {
      n = Math.floor(n / p);
      exponent += 1;
      multiplicityParity ^= 1;
    }
    if (exponent > 1) squarefree = 0;
  }
  if (n > 1) {
    distinct += 1;
    multiplicityParity ^= 1;
  }
  return { distinct, multiplicityParity, squarefree };
}

const TARGETS = Object.freeze([
  {
    id: 'A008966_SQUAREFREE',
    source: 'OEIS A008966',
    label: x => factorStats(x).squarefree
  },
  {
    id: 'A001221_DISTINCT_PRIME_PARITY',
    source: 'OEIS A001221',
    label: x => factorStats(x).distinct & 1
  },
  {
    id: 'A008683_MOBIUS_POSITIVE',
    source: 'OEIS A008683',
    label: x => {
      const stats = factorStats(x);
      return stats.squarefree && (stats.distinct & 1) === 0 ? 1 : 0;
    }
  }
]);

function splitBucket(x) {
  let z = (x + 0x9e3779b9) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  z = Math.imul(z, 0x85ebca6b) >>> 0;
  z = (z ^ (z >>> 13)) >>> 0;
  z = Math.imul(z, 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return z % 5;
}

function rowsFor(target) {
  const buckets = [[], [], [], [], []];
  for (let x = MIN_X; x <= MAX_X; x += 1) {
    buckets[splitBucket(x)].push({ x, y: target.label(x) });
  }
  return {
    train: buckets[0].concat(buckets[1]),
    validation: buckets[2],
    heldOut: buckets[3],
    reserve: buckets[4]
  };
}

function accuracy(rows, evaluate) {
  let correct = 0;
  for (const row of rows) if (evaluate(row.x) === row.y) correct += 1;
  return rows.length ? correct / rows.length : 0;
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

function baseLiterals() {
  const literals = [];
  for (const atom of baseAtoms()) {
    literals.push(atom);
    literals.push({
      id: `NOT(${atom.id})`,
      complexity: atom.complexity + 1,
      evaluate: x => atom.evaluate(x) ? 0 : 1
    });
  }
  return literals;
}

function visitBaseFeatures(visitor) {
  const literals = baseLiterals();
  for (const literal of literals) visitor(literal);
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
        visitor({
          id: `${op}(${left.id},${right.id})`,
          complexity: left.complexity + right.complexity + 1,
          evaluate: x => combine(left.evaluate(x), right.evaluate(x))
        });
      }
    }
  }
}

function selectBaseFeature(split) {
  let best = null;
  let evaluated = 0;
  visitBaseFeatures(feature => {
    evaluated += 1;
    const row = {
      id: feature.id,
      complexity: feature.complexity,
      evaluate: feature.evaluate,
      trainAccuracy: accuracy(split.train, feature.evaluate),
      validationAccuracy: accuracy(split.validation, feature.evaluate)
    };
    if (!best ||
        row.trainAccuracy > best.trainAccuracy ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy > best.validationAccuracy) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.complexity < best.complexity) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.complexity === best.complexity && row.id < best.id)) {
      best = row;
    }
  });
  return { ...best, evaluated };
}

function applyEvent(state, update) {
  if (update === 'TOGGLE_PER_DIVISION_EVENT') return state ^ 1;
  if (update === 'SET_ONE_ON_EVENT') return 1;
  if (update === 'SET_ZERO_ON_EVENT') return 0;
  return state;
}

function structuralEvaluate(x, spec) {
  let working = x;
  let state = spec.initialState;

  const consume = divisor => {
    let hit = false;
    if (spec.divisionPolicy === 'SINGLE_IF_DIVISIBLE') {
      if (working % divisor === 0) {
        hit = true;
        working = Math.floor(working / divisor);
        if (spec.stateUpdate !== 'TOGGLE_ON_DIVISOR_HIT') {
          state = applyEvent(state, spec.stateUpdate);
        }
      }
    } else {
      while (working % divisor === 0) {
        hit = true;
        working = Math.floor(working / divisor);
        if (spec.stateUpdate !== 'TOGGLE_ON_DIVISOR_HIT') {
          state = applyEvent(state, spec.stateUpdate);
        }
      }
    }
    if (hit && spec.stateUpdate === 'TOGGLE_ON_DIVISOR_HIT') state ^= 1;
  };

  if (spec.divisorOrder === 'ASCENDING_2_TO_DYNAMIC_SQRT') {
    for (let divisor = 2; divisor * divisor <= working; divisor += 1) consume(divisor);
  } else {
    for (let divisor = Math.floor(Math.sqrt(x)); divisor >= 2; divisor -= 1) consume(divisor);
  }

  if (working > 1) {
    if (spec.leftoverPolicy === 'TOGGLE_IF_WORKING_GT_1') state ^= 1;
    else if (spec.leftoverPolicy === 'SET_ONE_IF_WORKING_GT_1') state = 1;
  }
  return state;
}

function structuralGrammar() {
  const programs = [];
  for (const divisorOrder of ['ASCENDING_2_TO_DYNAMIC_SQRT', 'DESCENDING_FROM_ORIGINAL_SQRT']) {
    for (const divisionPolicy of ['SINGLE_IF_DIVISIBLE', 'REPEAT_WHILE_DIVISIBLE']) {
      for (const stateUpdate of ['TOGGLE_PER_DIVISION_EVENT', 'TOGGLE_ON_DIVISOR_HIT', 'SET_ONE_ON_EVENT', 'SET_ZERO_ON_EVENT']) {
        for (const leftoverPolicy of ['IGNORE_LEFTOVER', 'TOGGLE_IF_WORKING_GT_1', 'SET_ONE_IF_WORKING_GT_1']) {
          for (const initialState of [0, 1]) {
            const spec = { divisorOrder, divisionPolicy, stateUpdate, leftoverPolicy, initialState };
            const descriptionCost =
              1 +
              (divisorOrder === 'ASCENDING_2_TO_DYNAMIC_SQRT' ? 1 : 2) +
              (divisionPolicy === 'REPEAT_WHILE_DIVISIBLE' ? 1 : 2) +
              (stateUpdate.startsWith('TOGGLE') ? 1 : 2) +
              (leftoverPolicy === 'IGNORE_LEFTOVER' ? 1 : 2) +
              initialState;
            const id = [divisorOrder, divisionPolicy, stateUpdate, leftoverPolicy, `INIT_${initialState}`].join('__');
            programs.push({
              id,
              descriptionCost,
              spec,
              evaluate: x => structuralEvaluate(x, spec)
            });
          }
        }
      }
    }
  }
  return programs;
}

function selectStructuralProgram(split) {
  let best = null;
  const programs = structuralGrammar();
  for (const program of programs) {
    const row = {
      id: program.id,
      descriptionCost: program.descriptionCost,
      spec: program.spec,
      evaluate: program.evaluate,
      trainAccuracy: accuracy(split.train, program.evaluate),
      validationAccuracy: accuracy(split.validation, program.evaluate)
    };
    if (!best ||
        row.trainAccuracy > best.trainAccuracy ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy > best.validationAccuracy) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.descriptionCost < best.descriptionCost) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.descriptionCost === best.descriptionCost && row.id < best.id)) {
      best = row;
    }
  }
  return { ...best, evaluated: programs.length };
}

function majorityBaseline(split) {
  const positives = split.train.reduce((sum, row) => sum + row.y, 0);
  const prediction = positives * 2 >= split.train.length ? 1 : 0;
  return accuracy(split.heldOut, () => prediction);
}

function rawThresholdBaseline(split) {
  const xs = [...new Set(split.train.map(row => row.x))].sort((a, b) => a - b);
  const thresholds = [xs[0] - 1];
  for (let i = 0; i < xs.length - 1; i += 1) thresholds.push((xs[i] + xs[i + 1]) / 2);
  thresholds.push(xs.at(-1) + 1);
  let best = null;
  let evaluated = 0;
  for (const threshold of thresholds) {
    for (const direction of ['GE', 'LE']) {
      evaluated += 1;
      const evaluator = x => direction === 'GE' ? (x >= threshold ? 1 : 0) : (x <= threshold ? 1 : 0);
      const trainAccuracy = accuracy(split.train, evaluator);
      if (!best || trainAccuracy > best.trainAccuracy ||
          (trainAccuracy === best.trainAccuracy && threshold < best.threshold) ||
          (trainAccuracy === best.trainAccuracy && threshold === best.threshold && direction < best.direction)) {
        best = { threshold, direction, evaluator, trainAccuracy };
      }
    }
  }
  return { accuracy: accuracy(split.heldOut, best.evaluator), evaluated };
}

function knnBaseline(split, k = 3) {
  const evaluate = x => {
    const nearest = split.train
      .map(row => ({ ...row, distance: Math.abs(row.x - x) }))
      .sort((a, b) => a.distance - b.distance || a.x - b.x)
      .slice(0, k);
    return nearest.reduce((sum, row) => sum + row.y, 0) * 2 >= nearest.length ? 1 : 0;
  };
  return accuracy(split.heldOut, evaluate);
}

function orientedBaseline(split, evaluator) {
  const inverse = x => evaluator(x) ? 0 : 1;
  const directTrain = accuracy(split.train, evaluator);
  const inverseTrain = accuracy(split.train, inverse);
  const directValidation = accuracy(split.validation, evaluator);
  const inverseValidation = accuracy(split.validation, inverse);
  const selected = inverseTrain > directTrain ||
    (inverseTrain === directTrain && inverseValidation > directValidation)
      ? inverse : evaluator;
  return accuracy(split.heldOut, selected);
}

function primeIndicator(x) {
  if (x < 2) return 0;
  for (let d = 2; d * d <= x; d += 1) if (x % d === 0) return 0;
  return 1;
}

function omegaMultiplicityParity(x) {
  return factorStats(x).multiplicityParity;
}

function evaluateTarget(target) {
  const split = rowsFor(target);
  const base = selectBaseFeature(split);
  const structural = selectStructuralProgram(split);
  const threshold = rawThresholdBaseline(split);

  const baselineScores = {
    BEST_8626_BASE_BOOLEAN_GRAMMAR_FEATURE: accuracy(split.heldOut, base.evaluate),
    RAW_THRESHOLD: threshold.accuracy,
    KNN_RAW_K3: knnBaseline(split),
    MAJORITY_CLASS: majorityBaseline(split),
    PRIME_INDICATOR: orientedBaseline(split, primeIndicator),
    V4B_OMEGA_MULTIPLICITY_PARITY_PRIMITIVE: orientedBaseline(split, omegaMultiplicityParity)
  };
  const bestBaselineAccuracy = Math.max(...Object.values(baselineScores));
  const heldOutAccuracy = accuracy(split.heldOut, structural.evaluate);
  const improvement = Number((heldOutAccuracy - bestBaselineAccuracy).toFixed(6));

  return {
    id: target.id,
    externalSource: target.source,
    selectedProgramId: structural.id,
    selectedProgramDescriptionCost: structural.descriptionCost,
    trainAccuracy: structural.trainAccuracy,
    validationAccuracy: structural.validationAccuracy,
    heldOutAccuracy,
    baselineScores,
    bestBaselineAccuracy,
    improvement,
    criterionPassed: heldOutAccuracy >= 0.95 && improvement >= 0.10,
    searchAccounting: {
      structuralProgramsEvaluated: structural.evaluated,
      baseFeaturesEvaluated: base.evaluated,
      rawThresholdModelsEvaluated: threshold.evaluated
    }
  };
}

export function runExternalArithmeticFamilyCanaryV5() {
  const results = TARGETS.map(evaluateTarget);
  const passed = results.filter(row => row.criterionPassed);
  return envelope({
    ok: true,
    status:
      passed.length === 3 ? 'V5_STRONG_FINITE_EXTERNAL_FAMILY_TRANSFER' :
      passed.length > 0 ? 'V5_PARTIAL_EXTERNAL_FAMILY_TRANSFER_WITH_BOUNDARIES' :
      'V5_FROZEN_GRAMMAR_DID_NOT_TRANSFER',
    preregistration: 'artifacts/research/EXTERNAL_ARITHMETIC_FAMILY_V5_PREREGISTRATION_20260920.json',
    grammarMutatedAfterPreregistration: false,
    heldOutUsedForSelection: false,
    externalTargetCount: TARGETS.length,
    results,
    passingTargetCount: passed.length,
    failedTargetIds: results.filter(row => !row.criterionPassed).map(row => row.id),
    ontogenesisTriggerIds: results.filter(row => !row.criterionPassed).map(row => row.id),
    claimBoundary:
      'V5_TESTS_A_FROZEN_FINITE_STRUCTURAL_GRAMMAR_ON_EXTERNALLY_DEFINED_ARITHMETIC_TARGETS__IT_DOES_NOT_ESTABLISH_OPEN_ENDED_ONTOLOGY_INVENTION_OR_NEW_MATHEMATICS'
  });
}
