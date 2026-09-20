import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ONTOLOGICAL_PRIMITIVE_SYNTHESIS_CANARY_V3_VERSION = 'uberbond.ontological-primitive-synthesis-canary.v3';

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

function hashControl(x) {
  let z = (x + 0x7f4a7c15) >>> 0;
  z ^= z >>> 15;
  z = Math.imul(z, 0x2c1b3c6d) >>> 0;
  z ^= z >>> 12;
  z = Math.imul(z, 0x297a2d39) >>> 0;
  z ^= z >>> 15;
  return (z >>> 29) & 1;
}

function hiddenPrimitive(x) {
  return (Math.floor((x * (x + 1)) / 2) & 1) === 1 ? 1 : 0;
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
  for (let t = 1; t <= 5; t += 1) {
    atoms.push({ id: `POPCOUNT_GE(${t})`, complexity: 3, evaluate: x => popcount(x) >= t ? 1 : 0 });
  }
  return atoms;
}

function baseLiterals(atoms) {
  const out = [];
  for (const atom of atoms) {
    out.push(atom);
    out.push({ id: `NOT(${atom.id})`, complexity: atom.complexity + 1, evaluate: x => atom.evaluate(x) ? 0 : 1 });
  }
  return out;
}

function baseFeatureGrammar() {
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
      for (const [op, combine] of operators) {
        const left = literals[i];
        const right = literals[j];
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

function numericMetaExpressions() {
  const rows = [{ id: 'X', complexity: 1, evaluate: x => x }];
  for (let c = -3; c <= 3; c += 1) {
    if (c === 0) continue;
    rows.push({
      id: `ADD(X,${c})`,
      complexity: 2,
      evaluate: x => x + c
    });
  }
  for (let c = 2; c <= 8; c += 1) {
    rows.push({
      id: `MUL(X,${c})`,
      complexity: 2,
      evaluate: x => x * c
    });
  }
  for (let k = 2; k <= 8; k += 1) {
    rows.push({
      id: `FLOOR_DIV(X,${k})`,
      complexity: 2,
      evaluate: x => Math.floor(x / k)
    });
    rows.push({
      id: `FLOOR_DIV(MUL(X,X),${k})`,
      complexity: 4,
      evaluate: x => Math.floor((x * x) / k)
    });
  }
  for (let c = -3; c <= 3; c += 1) {
    for (let k = 2; k <= 8; k += 1) {
      rows.push({
        id: `FLOOR_DIV(MUL(X,ADD(X,${c})),${k})`,
        complexity: 6,
        evaluate: x => Math.floor((x * (x + c)) / k)
      });
    }
  }
  return rows;
}

function synthesisCandidates() {
  const numeric = numericMetaExpressions();
  const features = [];
  for (const expr of numeric) {
    features.push({
      id: `PARITY(${expr.id})`,
      complexity: expr.complexity + 1,
      evaluate: x => Math.abs(expr.evaluate(x)) % 2 === 1 ? 1 : 0
    });
    for (let bit = 0; bit <= 4; bit += 1) {
      features.push({
        id: `BIT(${expr.id},${bit})`,
        complexity: expr.complexity + 1,
        evaluate: x => (expr.evaluate(x) >> bit) & 1
      });
    }
    for (let k = 2; k <= 5; k += 1) {
      for (let residue = 0; residue < k; residue += 1) {
        features.push({
          id: `RESIDUE_EQ(${expr.id},${k},${residue})`,
          complexity: expr.complexity + 2,
          evaluate: x => {
            const v = expr.evaluate(x);
            return ((v % k) + k) % k === residue ? 1 : 0;
          }
        });
      }
    }
  }
  return { numeric, features };
}

const DISCOVERY_TASK = Object.freeze({
  id: 'DISCOVER_HIDDEN_PRIMITIVE',
  label: x => hiddenPrimitive(x)
});

const TRANSFER_TASKS = Object.freeze([
  {
    id: 'TRANSFER_XOR_BIT3',
    label: x => hiddenPrimitive(x) !== ((x >> 3) & 1) ? 1 : 0
  },
  {
    id: 'TRANSFER_AND_NOT_BIT2',
    label: x => hiddenPrimitive(x) && !((x >> 2) & 1) ? 1 : 0
  }
]);

const NEGATIVE_TASK = Object.freeze({
  id: 'NEGATIVE_HASH_CONTROL_V3',
  label: x => hashControl(x)
});

function rowsFor(label, predicate) {
  return range(0, 511).filter(predicate).map(x => ({ x, y: label(x) }));
}

function discoverySplit(task) {
  return {
    train: rowsFor(task.label, x => x % 5 === 0 || x % 5 === 1),
    validation: rowsFor(task.label, x => x % 5 === 2),
    heldOut: rowsFor(task.label, x => x % 5 === 3)
  };
}

function transferSplit(task) {
  return {
    train: rowsFor(task.label, x => x % 5 === 0 || x % 5 === 1),
    validation: rowsFor(task.label, x => x % 5 === 2),
    heldOut: rowsFor(task.label, x => x % 5 === 4)
  };
}

function accuracy(rows, predict) {
  let correct = 0;
  for (const row of rows) if (predict(row.x) === row.y) correct += 1;
  return rows.length ? correct / rows.length : 0;
}

function selectBooleanFeature({ train, validation, features }) {
  let best = null;
  let evaluated = 0;
  for (const feature of features) {
    for (const inverted of [false, true]) {
      evaluated += 1;
      const predict = inverted
        ? x => feature.evaluate(x) ? 0 : 1
        : x => feature.evaluate(x);
      const row = {
        feature,
        inverted,
        trainAccuracy: accuracy(train, predict),
        validationAccuracy: accuracy(validation, predict),
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

function knnBaseline(train, heldOut, k = 3) {
  const predict = x => {
    const nearest = train
      .map(row => ({ ...row, distance: Math.abs(row.x - x) }))
      .sort((a,b) => a.distance - b.distance || a.x - b.x)
      .slice(0, k);
    return nearest.reduce((sum,row) => sum + row.y, 0) * 2 >= nearest.length ? 1 : 0;
  };
  return accuracy(heldOut, predict);
}

function baselineBundle(split, baseFeatures) {
  const base = selectBooleanFeature({
    train: split.train,
    validation: split.validation,
    features: baseFeatures
  });
  const threshold = rawThresholdBaseline(split.train, split.heldOut);
  const scores = {
    BEST_BASE_VOCABULARY_BOOLEAN_FEATURE: accuracy(split.heldOut, base.predict),
    RAW_THRESHOLD: threshold.accuracy,
    KNN_RAW_K3: knnBaseline(split.train, split.heldOut, 3),
    MAJORITY_CLASS: majorityBaseline(split.train, split.heldOut)
  };
  return {
    scores,
    bestAccuracy: Math.max(...Object.values(scores)),
    baseExpressionsEvaluated: base.evaluated,
    rawThresholdEvaluations: threshold.evaluated
  };
}

function synthesizePrimitive(grammar, baseGrammar) {
  const split = discoverySplit(DISCOVERY_TASK);
  const selection = selectBooleanFeature({
    train: split.train,
    validation: split.validation,
    features: grammar.features
  });
  const heldOutAccuracy = accuracy(split.heldOut, selection.predict);
  const baseline = baselineBundle(split, baseGrammar.features);
  return {
    primitive: {
      id: selection.inverted ? `NOT(${selection.feature.id})` : selection.feature.id,
      complexity: selection.feature.complexity + (selection.inverted ? 1 : 0),
      evaluate: selection.predict
    },
    trainAccuracy: selection.trainAccuracy,
    validationAccuracy: selection.validationAccuracy,
    heldOutAccuracy,
    baseline,
    improvement: Number((heldOutAccuracy - baseline.bestAccuracy).toFixed(6)),
    synthesisExpressionsEvaluated: selection.evaluated
  };
}

function transferCandidateFeatures(primitive, baseLiterals) {
  const primitiveLiteral = {
    id: `SYNTH(${primitive.id})`,
    complexity: primitive.complexity,
    evaluate: primitive.evaluate
  };
  const notPrimitive = {
    id: `NOT(${primitiveLiteral.id})`,
    complexity: primitiveLiteral.complexity + 1,
    evaluate: x => primitiveLiteral.evaluate(x) ? 0 : 1
  };
  const primaries = [primitiveLiteral, notPrimitive];
  const features = [...primaries];
  const operators = [
    ['AND', (a,b) => a && b ? 1 : 0],
    ['OR', (a,b) => a || b ? 1 : 0],
    ['XOR', (a,b) => a !== b ? 1 : 0]
  ];
  for (const p of primaries) {
    for (const base of baseLiterals) {
      for (const [op, combine] of operators) {
        features.push({
          id: `${op}(${p.id},${base.id})`,
          complexity: p.complexity + base.complexity + 1,
          evaluate: x => combine(p.evaluate(x), base.evaluate(x))
        });
      }
    }
  }
  return features;
}

function evaluateTransferTask(task, primitive, baseGrammar) {
  const split = transferSplit(task);
  const features = transferCandidateFeatures(primitive, baseGrammar.literals);
  const selected = selectBooleanFeature({ train: split.train, validation: split.validation, features });
  const heldOutAccuracy = accuracy(split.heldOut, selected.predict);
  const baseline = baselineBundle(split, baseGrammar.features);
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
    baselineExpressionsEvaluated: baseline.baseExpressionsEvaluated,
    rawThresholdEvaluations: baseline.rawThresholdEvaluations
  };
}

export function runOntologicalPrimitiveSynthesisCanaryV3() {
  const baseGrammar = baseFeatureGrammar();
  const synthesisGrammar = synthesisCandidates();
  const discovery = synthesizePrimitive(synthesisGrammar, baseGrammar);

  // The primitive is frozen here. Transfer task labels never participate in its synthesis.
  const frozenPrimitive = discovery.primitive;

  const transfers = TRANSFER_TASKS.map(task =>
    evaluateTransferTask(task, frozenPrimitive, baseGrammar)
  );
  const negative = evaluateTransferTask(NEGATIVE_TASK, frozenPrimitive, baseGrammar);

  const discoveryPassed =
    discovery.heldOutAccuracy >= 0.90 &&
    discovery.improvement >= 0.20;
  const passingTransfers = transfers.filter(row =>
    row.heldOutAccuracy >= 0.90 &&
    row.improvement >= 0.15
  );
  const negativeControlPassed = negative.heldOutAccuracy <= 0.85;
  const success = discoveryPassed && passingTransfers.length >= 2 && negativeControlPassed;

  return envelope({
    ok: true,
    status: success
      ? 'V3_SYNTHESIZED_PRIMITIVE_TRANSFER_SUPPORTED__REVIEW_REQUIRED'
      : 'V3_PREREGISTERED_FALSIFIER_TRIGGERED_OR_NOT_SUPPORTED',
    preregistration: 'artifacts/research/ONTOLOGICAL_COMPUTING_CANARY_V3_PREREGISTRATION_20260920.json',
    heldOutUsedForPrimitiveSelection: false,
    transferLabelsUsedForPrimitiveSelection: false,
    synthesisGrammar: {
      numericExpressionCount: synthesisGrammar.numeric.length,
      booleanExpressionCount: synthesisGrammar.features.length
    },
    baseGrammar: {
      featureCount: baseGrammar.features.length,
      literalCount: baseGrammar.literals.length
    },
    discovery: {
      synthesizedPrimitiveId: frozenPrimitive.id,
      synthesizedPrimitiveComplexity: frozenPrimitive.complexity,
      trainAccuracy: discovery.trainAccuracy,
      validationAccuracy: discovery.validationAccuracy,
      heldOutAccuracy: discovery.heldOutAccuracy,
      baselineScores: discovery.baseline.scores,
      bestBaselineAccuracy: discovery.baseline.bestAccuracy,
      improvement: discovery.improvement,
      synthesisExpressionsEvaluated: discovery.synthesisExpressionsEvaluated,
      baseExpressionsEvaluated: discovery.baseline.baseExpressionsEvaluated
    },
    transfers,
    negativeControl: negative,
    discoveryPassed,
    passingTransferCount: passingTransfers.length,
    requiredPassingTransferCount: 2,
    negativeControlPassed,
    falsifierTriggered: !success,
    promotionCandidate: success ? {
      scope: 'SYNTHETIC_PRIMITIVE_SYNTHESIS_AND_CROSS_TASK_TRANSFER',
      from: 'SIMULATION_READY',
      to: 'SOFTWARE_DEMONSTRATED',
      authority: 'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    } : null,
    claimBoundary: 'V3_SYNTHESIZES_WITHIN_A_FIXED_META_GRAMMAR__IT_DOES_NOT_PROVE_OPEN_ENDED_ONTOLOGY_INVENTION_NEW_MATHEMATICS_OR_SCIENTIFIC_DISCOVERY'
  });
}
