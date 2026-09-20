import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compareBehavioralEvaluators } from './semantic-novelty-preflight.mjs';

export const ONTOLOGICAL_NOVELTY_GATED_CANARY_V4_VERSION = 'uberbond.ontological-novelty-gated-canary.v4';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

function range(start, endInclusive) {
  return Array.from({ length: endInclusive - start + 1 }, (_, i) => start + i);
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

function omegaMultiplicity(x) {
  let n = Math.max(2, Math.floor(Math.abs(x)));
  let count = 0;
  for (let p = 2; p * p <= n; p += 1) {
    while (n % p === 0) {
      count += 1;
      n = Math.floor(n / p);
    }
  }
  if (n > 1) count += 1;
  return count;
}

function omegaDistinct(x) {
  let n = Math.max(2, Math.floor(Math.abs(x)));
  let count = 0;
  for (let p = 2; p * p <= n; p += 1) {
    if (n % p === 0) {
      count += 1;
      while (n % p === 0) n = Math.floor(n / p);
    }
  }
  if (n > 1) count += 1;
  return count;
}

function divisorCount(x) {
  let n = Math.max(1, Math.floor(Math.abs(x)));
  let total = 1;
  for (let p = 2; p * p <= n; p += 1) {
    if (n % p !== 0) continue;
    let exponent = 0;
    while (n % p === 0) {
      exponent += 1;
      n = Math.floor(n / p);
    }
    total *= exponent + 1;
  }
  if (n > 1) total *= 2;
  return total;
}

function digitSumBase(x, base) {
  let n = Math.max(0, Math.floor(Math.abs(x)));
  let total = 0;
  do {
    total += n % base;
    n = Math.floor(n / base);
  } while (n > 0);
  return total;
}

function splitHash(x) {
  let z = (x + 0x6d2b79f5) >>> 0;
  z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return (z ^ (z >>> 14)) >>> 0;
}

function hashControl(x) {
  let z = (x + 0x517cc1b7) >>> 0;
  z ^= z >>> 16;
  z = Math.imul(z, 0x21f0aaad) >>> 0;
  z ^= z >>> 15;
  z = Math.imul(z, 0x735a2d97) >>> 0;
  z ^= z >>> 15;
  return (z >>> 30) & 1;
}

function targetPrimitive(x) {
  return omegaMultiplicity(x) % 2 === 1 ? 1 : 0;
}

function baseAtoms() {
  const atoms = [];
  for (let bit = 0; bit <= 5; bit += 1) {
    atoms.push({ id: `BIT(${bit})`, complexity: 1, evaluate: x => (x >> bit) & 1 });
  }
  for (let k = 2; k <= 7; k += 1) {
    for (let residue = 0; residue < k; residue += 1) {
      atoms.push({ id: `RESIDUE_EQ(${k},${residue})`, complexity: 2, evaluate: x => x % k === residue ? 1 : 0 });
    }
  }
  for (let threshold = 1; threshold <= 5; threshold += 1) {
    atoms.push({ id: `POPCOUNT_GE(${threshold})`, complexity: 3, evaluate: x => popcount(x) >= threshold ? 1 : 0 });
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

function metaPrimitiveCandidates() {
  const candidates = [];
  const addModFamily = (prefix, complexity, numeric) => {
    for (let k = 2; k <= 5; k += 1) {
      for (let residue = 0; residue < k; residue += 1) {
        candidates.push({
          id: `${prefix}_MOD(${k},${residue})`,
          complexity,
          evaluate: x => ((numeric(x) % k) + k) % k === residue ? 1 : 0
        });
      }
    }
  };

  addModFamily('OMEGA_MULTIPLICITY', 6, omegaMultiplicity);
  addModFamily('OMEGA_DISTINCT', 6, omegaDistinct);
  addModFamily('DIVISOR_COUNT', 5, divisorCount);
  addModFamily('FLOOR_SQRT', 3, x => Math.floor(Math.sqrt(Math.abs(x))));

  for (let base = 2; base <= 10; base += 1) {
    addModFamily(`DIGIT_SUM_BASE_${base}`, 4, x => digitSumBase(x, base));
  }
  return candidates;
}

function rowsFor(label, bucketPredicate) {
  return range(2, 2049)
    .filter(x => bucketPredicate(splitHash(x) % 5))
    .map(x => ({ x, y: label(x) }));
}

function splitFor(label, heldOutBucket) {
  return {
    train: rowsFor(label, bucket => bucket === 0 || bucket === 1),
    validation: rowsFor(label, bucket => bucket === 2),
    heldOut: rowsFor(label, bucket => bucket === heldOutBucket)
  };
}

function accuracy(rows, predict) {
  let correct = 0;
  for (const row of rows) if (predict(row.x) === row.y) correct += 1;
  return rows.length ? correct / rows.length : 0;
}

function selectFeature({ train, validation, features }) {
  let best = null;
  let evaluated = 0;
  for (const feature of features) {
    for (const inverted of [false, true]) {
      evaluated += 1;
      const predict = inverted
        ? x => feature.evaluate(x) ? 0 : 1
        : x => feature.evaluate(x);
      const candidate = {
        feature,
        inverted,
        predict,
        trainAccuracy: accuracy(train, predict),
        validationAccuracy: accuracy(validation, predict)
      };
      if (!best ||
          candidate.trainAccuracy > best.trainAccuracy ||
          (candidate.trainAccuracy === best.trainAccuracy && candidate.validationAccuracy > best.validationAccuracy) ||
          (candidate.trainAccuracy === best.trainAccuracy && candidate.validationAccuracy === best.validationAccuracy && candidate.feature.complexity < best.feature.complexity) ||
          (candidate.trainAccuracy === best.trainAccuracy && candidate.validationAccuracy === best.validationAccuracy && candidate.feature.complexity === best.feature.complexity && candidate.feature.id < best.feature.id) ||
          (candidate.trainAccuracy === best.trainAccuracy && candidate.validationAccuracy === best.validationAccuracy && candidate.feature.complexity === best.feature.complexity && candidate.feature.id === best.feature.id && Number(candidate.inverted) < Number(best.inverted))) {
        best = candidate;
      }
    }
  }
  return { ...best, evaluated };
}

function majorityBaseline(train, heldOut) {
  const positives = train.reduce((sum,row) => sum + row.y, 0);
  const predicted = positives * 2 >= train.length ? 1 : 0;
  return accuracy(heldOut, () => predicted);
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
          (trainAccuracy === best.trainAccuracy && threshold < best.threshold)) {
        best = { threshold, direction, trainAccuracy, predict };
      }
    }
  }
  return { accuracy: accuracy(heldOut, best.predict), evaluated };
}

function knnRawBaseline(train, heldOut, k = 3) {
  const predict = x => {
    const nearest = train
      .map(row => ({ ...row, distance: Math.abs(row.x - x) }))
      .sort((a,b) => a.distance - b.distance || a.x - b.x)
      .slice(0, k);
    return nearest.reduce((sum,row) => sum + row.y, 0) * 2 >= nearest.length ? 1 : 0;
  };
  return accuracy(heldOut, predict);
}

function baselineBundle(split, grammar) {
  const selected = selectFeature({
    train: split.train,
    validation: split.validation,
    features: grammar.features
  });
  const threshold = rawThresholdBaseline(split.train, split.heldOut);
  const scores = {
    BEST_BASE_ONTOLOGY: accuracy(split.heldOut, selected.predict),
    RAW_THRESHOLD: threshold.accuracy,
    KNN_RAW_K3: knnRawBaseline(split.train, split.heldOut, 3),
    MAJORITY_CLASS: majorityBaseline(split.train, split.heldOut)
  };
  return {
    scores,
    bestAccuracy: Math.max(...Object.values(scores)),
    selectedBaseFeature: selected.inverted ? `NOT(${selected.feature.id})` : selected.feature.id,
    baseExpressionsEvaluated: selected.evaluated,
    rawThresholdEvaluations: threshold.evaluated
  };
}

function transferFeatures(primitive, literals) {
  const primary = {
    id: `NEW_PRIMITIVE(${primitive.id})`,
    complexity: primitive.complexity,
    evaluate: primitive.evaluate
  };
  const notPrimary = {
    id: `NOT(${primary.id})`,
    complexity: primary.complexity + 1,
    evaluate: x => primary.evaluate(x) ? 0 : 1
  };
  const primaries = [primary, notPrimary];
  const features = [...primaries];
  const operators = [
    ['AND', (a,b) => a && b ? 1 : 0],
    ['OR', (a,b) => a || b ? 1 : 0],
    ['XOR', (a,b) => a !== b ? 1 : 0]
  ];
  for (const p of primaries) {
    for (const literal of literals) {
      for (const [op, combine] of operators) {
        features.push({
          id: `${op}(${p.id},${literal.id})`,
          complexity: p.complexity + literal.complexity + 1,
          evaluate: x => combine(p.evaluate(x), literal.evaluate(x))
        });
      }
    }
  }
  return features;
}

const TRANSFER_TASKS = Object.freeze([
  {
    id: 'OMEGA_XOR_BIT3',
    label: x => targetPrimitive(x) !== ((x >> 3) & 1) ? 1 : 0
  },
  {
    id: 'OMEGA_XOR_MOD5_EQ2',
    label: x => targetPrimitive(x) !== (x % 5 === 2 ? 1 : 0) ? 1 : 0
  },
  {
    id: 'OMEGA_AND_NOT_BIT2',
    label: x => targetPrimitive(x) && !((x >> 2) & 1) ? 1 : 0
  }
]);

const NEGATIVE_TASK = Object.freeze({
  id: 'NEGATIVE_HASH_CONTROL_V4',
  label: x => hashControl(x)
});

function evaluateTransfer(task, primitive, grammar) {
  const split = splitFor(task.label, 4);
  const features = transferFeatures(primitive, grammar.literals);
  const selected = selectFeature({ train: split.train, validation: split.validation, features });
  const heldOutAccuracy = accuracy(split.heldOut, selected.predict);
  const baseline = baselineBundle(split, grammar);
  return {
    taskId: task.id,
    selectedRepresentation: selected.inverted ? `NOT(${selected.feature.id})` : selected.feature.id,
    trainAccuracy: selected.trainAccuracy,
    validationAccuracy: selected.validationAccuracy,
    heldOutAccuracy,
    baselineScores: baseline.scores,
    bestBaselineAccuracy: baseline.bestAccuracy,
    improvement: Number((heldOutAccuracy - baseline.bestAccuracy).toFixed(6)),
    transferExpressionsEvaluated: selected.evaluated,
    baseExpressionsEvaluated: baseline.baseExpressionsEvaluated,
    rawThresholdEvaluations: baseline.rawThresholdEvaluations
  };
}

export function runOntologicalNoveltyGatedCanaryV4() {
  const grammar = baseGrammar();
  const metaCandidates = metaPrimitiveCandidates();
  const discoverySplit = splitFor(targetPrimitive, 3);
  const selection = selectFeature({
    train: discoverySplit.train,
    validation: discoverySplit.validation,
    features: metaCandidates
  });
  const selectedPrimitive = {
    id: selection.inverted ? `NOT(${selection.feature.id})` : selection.feature.id,
    complexity: selection.feature.complexity + (selection.inverted ? 1 : 0),
    evaluate: selection.predict
  };
  const discoveryHeldOutAccuracy = accuracy(discoverySplit.heldOut, selectedPrimitive.evaluate);
  const discoveryBaseline = baselineBundle(discoverySplit, grammar);
  const discoveryImprovement = Number((discoveryHeldOutAccuracy - discoveryBaseline.bestAccuracy).toFixed(6));

  const semanticPreflight = compareBehavioralEvaluators({
    targetId: selectedPrimitive.id,
    targetEvaluator: selectedPrimitive.evaluate,
    candidates: grammar.features,
    fixtures: range(2, 1023),
    fixtureId: 'integers-2-1023',
    fixtureDescription: 'The declared V4 semantic-novelty fixture against all 8,626 base-ontology features.'
  });

  const transfers = TRANSFER_TASKS.map(task => evaluateTransfer(task, selectedPrimitive, grammar));
  const negative = evaluateTransfer(NEGATIVE_TASK, selectedPrimitive, grammar);

  const discoveryPassed =
    discoveryHeldOutAccuracy >= 0.95 &&
    discoveryImprovement >= 0.30 &&
    semanticPreflight.noveltyOnFixture === true &&
    (semanticPreflight.nearest?.mismatchRate ?? 0) >= 0.10;
  const passingTransfers = transfers.filter(row =>
    row.heldOutAccuracy >= 0.90 &&
    row.improvement >= 0.15
  );
  const negativeControlPassed = negative.heldOutAccuracy <= 0.85;
  const success = discoveryPassed && passingTransfers.length >= 2 && negativeControlPassed;

  return envelope({
    ok: true,
    status: success
      ? 'V4_NOVEL_PRIMITIVE_ADMISSION_AND_TRANSFER_SUPPORTED__REVIEW_REQUIRED'
      : 'V4_PREREGISTERED_FALSIFIER_TRIGGERED_OR_NOT_SUPPORTED',
    preregistration: 'artifacts/research/ONTOLOGICAL_COMPUTING_CANARY_V4_PREREGISTRATION_20260920.json',
    heldOutUsedForPrimitiveSelection: false,
    transferLabelsUsedForPrimitiveSelection: false,
    metaPrimitiveCandidateCount: metaCandidates.length,
    baseOntologyFeatureCount: grammar.features.length,
    discovery: {
      selectedPrimitiveId: selectedPrimitive.id,
      selectedPrimitiveComplexity: selectedPrimitive.complexity,
      trainAccuracy: selection.trainAccuracy,
      validationAccuracy: selection.validationAccuracy,
      heldOutAccuracy: discoveryHeldOutAccuracy,
      baselineScores: discoveryBaseline.scores,
      bestBaselineAccuracy: discoveryBaseline.bestAccuracy,
      improvement: discoveryImprovement,
      metaCandidatesEvaluated: selection.evaluated,
      baseExpressionsEvaluated: discoveryBaseline.baseExpressionsEvaluated
    },
    semanticNovelty: {
      status: semanticPreflight.status,
      noveltyOnFixture: semanticPreflight.noveltyOnFixture,
      exactEquivalentIds: semanticPreflight.exactEquivalentIds,
      nearest: semanticPreflight.nearest,
      candidatesCompared: semanticPreflight.candidatesCompared,
      fixtureSize: semanticPreflight.fixtureSize,
      claimBoundary: semanticPreflight.claimBoundary
    },
    transfers,
    negativeControl: negative,
    discoveryPassed,
    passingTransferCount: passingTransfers.length,
    requiredPassingTransferCount: 2,
    negativeControlPassed,
    falsifierTriggered: !success,
    promotionCandidate: success ? {
      scope: 'FINITE_FIXTURE_SEMANTIC_NOVELTY_GATED_PRIMITIVE_ADMISSION_AND_REUSE',
      from: 'SIMULATION_READY',
      to: 'SOFTWARE_DEMONSTRATED',
      authority: 'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    } : null,
    claimBoundary: 'V4_SELECTS_FROM_A_DECLARED_META_PRIMITIVE_FAMILY__IT_DOES_NOT_PROVE_OPEN_ENDED_ONTOLOGY_INVENTION_NEW_MATHEMATICS_OR_SCIENTIFIC_DISCOVERY'
  });
}
