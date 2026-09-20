import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { runExternalArithmeticFamilyCanaryV5 } from './external-arithmetic-family-canary-v5.mjs';

export const MULTIPLICITY_SENSITIVE_MEMORY_CANARY_V6_VERSION =
  'uberbond.multiplicity-sensitive-memory-canary.v6';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const MIN_X = 2;
const MAX_X = 4097;

function factorStats(x) {
  let n = x;
  let distinct = 0;
  let squarefree = 1;
  for (let p = 2; p * p <= n; p += 1) {
    if (n % p !== 0) continue;
    distinct += 1;
    let exponent = 0;
    while (n % p === 0) {
      n = Math.floor(n / p);
      exponent += 1;
    }
    if (exponent > 1) squarefree = 0;
  }
  if (n > 1) distinct += 1;
  return { distinct, squarefree };
}

const TARGETS = Object.freeze([
  {
    id: 'A008966_SQUAREFREE',
    source: 'OEIS A008966',
    label: x => factorStats(x).squarefree
  },
  {
    id: 'A008683_MOBIUS_POSITIVE',
    source: 'OEIS A008683',
    label: x => {
      const stats = factorStats(x);
      return stats.squarefree && (stats.distinct & 1) === 0 ? 1 : 0;
    }
  },
  {
    id: 'A001221_DISTINCT_PRIME_PARITY',
    source: 'OEIS A001221',
    label: x => factorStats(x).distinct & 1
  }
]);

function negativeHash(x) {
  let z = (x + 0x6a09e667) >>> 0;
  z = (z ^ (z >>> 17)) >>> 0;
  z = Math.imul(z, 0x9e3779b1) >>> 0;
  z = (z ^ (z >>> 11)) >>> 0;
  z = Math.imul(z, 0x85ebca77) >>> 0;
  z = (z ^ (z >>> 15)) >>> 0;
  return (z >>> 30) & 1;
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

function splitRows(label) {
  const buckets = [[], [], [], [], []];
  for (let x = MIN_X; x <= MAX_X; x += 1) {
    buckets[splitBucket(x)].push({ x, y: label(x) });
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

function updateAccumulator(state, mode) {
  if (mode === 'TOGGLE_PER_DIVISION_EVENT') return state ^ 1;
  if (mode === 'SET_ONE_ON_EVENT') return 1;
  if (mode === 'SET_ZERO_ON_EVENT') return 0;
  return state;
}

function outputState(accumulator, repeatSeen, outputMode) {
  if (outputMode === 'ACCUMULATOR') return accumulator;
  if (outputMode === 'NOT_ACCUMULATOR') return accumulator ? 0 : 1;
  if (outputMode === 'REPEAT_SEEN') return repeatSeen;
  if (outputMode === 'NOT_REPEAT_SEEN') return repeatSeen ? 0 : 1;
  if (outputMode === 'ACCUMULATOR_AND_REPEAT_SEEN') return accumulator && repeatSeen ? 1 : 0;
  if (outputMode === 'ACCUMULATOR_AND_NOT_REPEAT_SEEN') return accumulator && !repeatSeen ? 1 : 0;
  if (outputMode === 'NOT_ACCUMULATOR_AND_REPEAT_SEEN') return !accumulator && repeatSeen ? 1 : 0;
  if (outputMode === 'NOT_ACCUMULATOR_AND_NOT_REPEAT_SEEN') return !accumulator && !repeatSeen ? 1 : 0;
  return accumulator !== repeatSeen ? 1 : 0;
}

function evaluateProgram(x, spec) {
  let working = x;
  let accumulator = spec.initialAccumulator;
  let repeatSeen = 0;

  const consume = divisor => {
    let count = 0;
    if (spec.divisionPolicy === 'SINGLE_IF_DIVISIBLE') {
      if (working % divisor === 0) {
        count = 1;
        working = Math.floor(working / divisor);
        if (spec.accumulatorUpdate !== 'TOGGLE_ON_DIVISOR_HIT') {
          accumulator = updateAccumulator(accumulator, spec.accumulatorUpdate);
        }
      }
    } else {
      while (working % divisor === 0) {
        count += 1;
        working = Math.floor(working / divisor);
        if (spec.accumulatorUpdate !== 'TOGGLE_ON_DIVISOR_HIT') {
          accumulator = updateAccumulator(accumulator, spec.accumulatorUpdate);
        }
      }
    }
    if (count > 0 && spec.accumulatorUpdate === 'TOGGLE_ON_DIVISOR_HIT') accumulator ^= 1;
    if (count >= 2) repeatSeen = 1;
  };

  if (spec.divisorOrder === 'ASCENDING_2_TO_DYNAMIC_SQRT') {
    for (let divisor = 2; divisor * divisor <= working; divisor += 1) consume(divisor);
  } else {
    for (let divisor = Math.floor(Math.sqrt(x)); divisor >= 2; divisor -= 1) consume(divisor);
  }

  if (working > 1) {
    if (spec.leftoverPolicy === 'TOGGLE_IF_WORKING_GT_1') accumulator ^= 1;
    else if (spec.leftoverPolicy === 'SET_ONE_IF_WORKING_GT_1') accumulator = 1;
  }

  return outputState(accumulator, repeatSeen, spec.outputMode);
}

function outputCost(mode) {
  if (['ACCUMULATOR','NOT_ACCUMULATOR','REPEAT_SEEN','NOT_REPEAT_SEEN'].includes(mode)) return 1;
  if (mode === 'ACCUMULATOR_XOR_REPEAT_SEEN') return 2;
  return 3;
}

function extendedGrammar() {
  const programs = [];
  const outputs = [
    'ACCUMULATOR',
    'NOT_ACCUMULATOR',
    'REPEAT_SEEN',
    'NOT_REPEAT_SEEN',
    'ACCUMULATOR_AND_REPEAT_SEEN',
    'ACCUMULATOR_AND_NOT_REPEAT_SEEN',
    'NOT_ACCUMULATOR_AND_REPEAT_SEEN',
    'NOT_ACCUMULATOR_AND_NOT_REPEAT_SEEN',
    'ACCUMULATOR_XOR_REPEAT_SEEN'
  ];
  for (const divisorOrder of ['ASCENDING_2_TO_DYNAMIC_SQRT','DESCENDING_FROM_ORIGINAL_SQRT']) {
    for (const divisionPolicy of ['SINGLE_IF_DIVISIBLE','REPEAT_WHILE_DIVISIBLE']) {
      for (const accumulatorUpdate of ['TOGGLE_PER_DIVISION_EVENT','TOGGLE_ON_DIVISOR_HIT','SET_ONE_ON_EVENT','SET_ZERO_ON_EVENT']) {
        for (const leftoverPolicy of ['IGNORE_LEFTOVER','TOGGLE_IF_WORKING_GT_1','SET_ONE_IF_WORKING_GT_1']) {
          for (const initialAccumulator of [0,1]) {
            for (const outputMode of outputs) {
              const spec = {
                divisorOrder,
                divisionPolicy,
                accumulatorUpdate,
                leftoverPolicy,
                initialAccumulator,
                repeatSeenRule:'SET_ON_SECOND_OR_LATER_DIVISION_SAME_DIVISOR',
                outputMode
              };
              const descriptionCost =
                2 +
                (divisorOrder === 'ASCENDING_2_TO_DYNAMIC_SQRT' ? 1 : 2) +
                (divisionPolicy === 'REPEAT_WHILE_DIVISIBLE' ? 1 : 2) +
                (accumulatorUpdate.startsWith('TOGGLE') ? 1 : 2) +
                (leftoverPolicy === 'IGNORE_LEFTOVER' ? 1 : 2) +
                initialAccumulator +
                outputCost(outputMode);
              const id = [
                divisorOrder,
                divisionPolicy,
                accumulatorUpdate,
                leftoverPolicy,
                `ACC_INIT_${initialAccumulator}`,
                'REPEAT_MEMORY',
                outputMode
              ].join('__');
              programs.push({
                id,
                descriptionCost,
                spec,
                evaluate:x=>evaluateProgram(x,spec)
              });
            }
          }
        }
      }
    }
  }
  return programs;
}

function selectProgram(split) {
  const programs = extendedGrammar();
  let best = null;
  for (const program of programs) {
    const row = {
      id:program.id,
      descriptionCost:program.descriptionCost,
      spec:program.spec,
      evaluate:program.evaluate,
      trainAccuracy:accuracy(split.train,program.evaluate),
      validationAccuracy:accuracy(split.validation,program.evaluate)
    };
    if (!best ||
        row.trainAccuracy > best.trainAccuracy ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy > best.validationAccuracy) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.descriptionCost < best.descriptionCost) ||
        (row.trainAccuracy === best.trainAccuracy && row.validationAccuracy === best.validationAccuracy && row.descriptionCost === best.descriptionCost && row.id < best.id)) {
      best = row;
    }
  }
  return { ...best, evaluated:programs.length };
}

function evaluateTarget(target, v5ById) {
  const split = splitRows(target.label);
  const selected = selectProgram(split);
  const heldOutAccuracy = accuracy(split.heldOut, selected.evaluate);
  const v5 = v5ById.get(target.id);
  const v5Best = Math.max(v5.heldOutAccuracy, v5.bestBaselineAccuracy);
  const improvement = Number((heldOutAccuracy - v5Best).toFixed(6));
  const isRegression = target.id === 'A001221_DISTINCT_PRIME_PARITY';
  return {
    id:target.id,
    externalSource:target.source,
    selectedProgramId:selected.id,
    selectedProgramDescriptionCost:selected.descriptionCost,
    selectedProgramSpec:selected.spec,
    trainAccuracy:selected.trainAccuracy,
    validationAccuracy:selected.validationAccuracy,
    heldOutAccuracy,
    v5BestAccuracy:v5Best,
    improvementOverV5Best:improvement,
    criterionPassed:isRegression
      ? heldOutAccuracy >= 0.99
      : heldOutAccuracy >= 0.95 && improvement >= 0.10,
    candidateCount:selected.evaluated
  };
}

export function runMultiplicitySensitiveMemoryCanaryV6() {
  const v5 = runExternalArithmeticFamilyCanaryV5();
  const v5ById = new Map(v5.results.map(row=>[row.id,row]));
  const results = TARGETS.map(target=>evaluateTarget(target,v5ById));

  const negativeSplit = splitRows(negativeHash);
  const negativeSelected = selectProgram(negativeSplit);
  const negativeHeldOutAccuracy = accuracy(negativeSplit.heldOut,negativeSelected.evaluate);
  const negativeControlPassed = negativeHeldOutAccuracy <= 0.85;

  const squarefree = results.find(row=>row.id==='A008966_SQUAREFREE');
  const mobius = results.find(row=>row.id==='A008683_MOBIUS_POSITIVE');
  const distinct = results.find(row=>row.id==='A001221_DISTINCT_PRIME_PARITY');
  const success =
    squarefree.criterionPassed &&
    mobius.criterionPassed &&
    distinct.criterionPassed &&
    negativeControlPassed;

  return envelope({
    ok:true,
    status:success
      ? 'V6_MULTIPLICITY_SENSITIVE_MEMORY_HYPOTHESIS_SUPPORTED__REVIEW_REQUIRED'
      : 'V6_PREREGISTERED_FALSIFIER_TRIGGERED_OR_NOT_SUPPORTED',
    preregistration:'artifacts/research/MULTIPLICITY_SENSITIVE_MEMORY_V6_PREREGISTRATION_20260920.json',
    preExecutionCorrection:'artifacts/research/MULTIPLICITY_SENSITIVE_MEMORY_V6_PREREGISTRATION_CORRECTION_20260920.json',
    heldOutUsedForSelection:false,
    targetSpecificNamedPrimitivePresent:false,
    candidateCount:extendedGrammar().length,
    results,
    negativeControl:{
      heldOutAccuracy:negativeHeldOutAccuracy,
      selectedProgramId:negativeSelected.id,
      negativeControlPassed
    },
    falsifierTriggered:!success,
    ontogenesisHypothesis:'MULTIPLICITY_SENSITIVE_STRUCTURAL_MEMORY',
    promotionCandidate:success ? {
      concept:'MULTIPLICITY_SENSITIVE_STRUCTURAL_MEMORY',
      currentStatus:'CANDIDATE',
      proposedEvidenceState:'SOFTWARE_DEMONSTRATED_CANDIDATE_AFTER_INDEPENDENT_REPLICATION',
      authority:'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    } : null,
    claimBoundary:
      'V6_TESTS_ONE_POST_FAILURE_GENERIC_MEMORY_EXTENSION_ON_A_FINITE_EXTERNAL_ARITHMETIC_FAMILY__IT_DOES_NOT_ESTABLISH_OPEN_ENDED_ONTOLOGY_INVENTION_OR_NEW_MATHEMATICS'
  });
}
