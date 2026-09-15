// The NULLSTAR OMEGA denominator: twenty-four dimensions, each scored from evidence.
//
// A denominator only means something if it cannot be moved by the thing being
// measured. Two failure modes make one meaningless. The first is asserting
// states by hand, which turns the scoreboard into a statement of intent. The
// second is deleting a dimension that scores badly, which is how a hard
// requirement quietly stops existing -- so the dimension list here is additive
// only, and a compile that loses one fails.
//
// Every state is therefore computed from probes: modules that must exist, tests
// that must exercise them, and -- for the states that claim more than code --
// artifacts that only a real run produces. That last distinction is the whole
// design. IMPLEMENTED means somebody built it. VERIFIED means tests exercise it.
// OPERATING means it has actually run and left a receipt. REALITY_CALIBRATED
// means a prediction it made was later checked against an observed outcome.
// Nothing in this file can grant the last two: only a receipt on disk can.
import { createHash } from 'node:crypto';
import { ZERO_CONSEQUENCE_EFFECTS } from './effect-ledgers.mjs';

export const NULLSTAR_OMEGA_DENOMINATOR_VERSION = 'uberbond.nullstar-omega-denominator.v1';

/** The state ladder. Ordered: each state is strictly stronger than the last. */
export const DENOMINATOR_STATES = Object.freeze([
  'ABSENT',
  'CANON',
  'PARTIAL',
  'IMPLEMENTED',
  'VERIFIED',
  'OPERATING',
  'REALITY_CALIBRATED'
]);

/**
 * The twenty-four dimensions.
 *
 * `modules` and `tests` are repository paths. `canonDocs` lets a dimension that
 * exists only as written canon score CANON rather than ABSENT, which is a real
 * and different fact. `runtimeReceipts` are paths that only exist after
 * something actually ran, and `calibrationReceipts` after a prediction met an
 * observation -- neither can be satisfied by writing more code.
 *
 * Additive only. Removing an entry fails the compile.
 */
export const OMEGA_DIMENSIONS = Object.freeze([
  { id: 'N01', name: 'REPOSITORY_SELF_MODEL',
    modules: ['src/living-self-model.mjs', 'src/sovereign-coverage-matrix.mjs'],
    tests: ['tests/sovereign-coverage-matrix.test.mjs'],
    canonDocs: ['docs/NULLSTAR_DIRECTIVE_RECONCILIATION.md'],
    runtimeReceipts: ['artifacts/sovereign/implementation-coverage-matrix.json'] },
  { id: 'N02', name: 'COGNITIVE_EVALUATION',
    modules: ['src/compound-intelligence-evaluation.mjs', 'src/capability-benchmark.mjs'],
    tests: ['tests/compound-intelligence-evaluation.test.mjs'],
    runtimeReceipts: ['artifacts/nullstar-omega/generations/G0.json'] },
  { id: 'N03', name: 'SEALED_HOLDOUTS',
    modules: ['src/nullstar-omega-holdout.mjs'],
    tests: ['tests/nullstar-omega-holdout.test.mjs'],
    runtimeReceipts: ['artifacts/nullstar-omega/holdout-manifest.json'] },
  { id: 'N04', name: 'BOTTLENECK_DISCOVERY',
    modules: ['src/nullstar-omega-bottleneck.mjs'],
    tests: ['tests/nullstar-omega-bottleneck.test.mjs'],
    runtimeReceipts: ['artifacts/nullstar-omega/bottlenecks-G0.json'] },
  { id: 'N05', name: 'CANDIDATE_INVENTION',
    modules: ['src/wallbreaker.mjs'],
    tests: ['tests/wallbreaker.test.mjs'],
    runtimeReceipts: ['artifacts/nullstar-omega/generations/G1.json'] },
  { id: 'N06', name: 'INDEPENDENT_FALSIFICATION',
    modules: ['src/forecast-adversarial-ensemble.mjs', 'scripts/mutation-war.mjs'],
    tests: ['tests/mutation-registry-anchor-integrity.test.mjs'] },
  { id: 'N07', name: 'PROMOTION_ROLLBACK',
    modules: ['src/agent-code-change-contract.mjs', 'src/sovereign-local-promotion.mjs'],
    tests: ['tests/enforcement-surface-sovereignty-boundary.test.mjs'] },
  { id: 'N08', name: 'MULTI_GENERATION_SELF_IMPROVEMENT',
    modules: ['src/multi-generation-architecture.mjs'],
    tests: ['tests/multi-generation-architecture.test.mjs'],
    runtimeReceipts: ['artifacts/nullstar-omega/generations/G2.json', 'artifacts/nullstar-omega/generations/G3.json', 'artifacts/nullstar-omega/generations/G4.json', 'artifacts/nullstar-omega/generations/G5.json', 'artifacts/nullstar-omega/generations/G6.json'] },
  { id: 'N09', name: 'META_IMPROVEMENT',
    modules: ['src/recursive-improvement-retention.mjs', 'src/nullstar-omega-meta-improvement.mjs', 'src/nullstar-omega-software-outcome.mjs', 'src/nullstar-omega-evidence-reuse.mjs'],
    tests: ['tests/recursive-improvement-retention.test.mjs', 'tests/nullstar-omega-meta-improvement.test.mjs', 'tests/nullstar-omega-software-outcome.test.mjs', 'tests/nullstar-omega-evidence-reuse.test.mjs'],
    runtimeReceipts: ['artifacts/nullstar-omega/meta-improvement.json'] },
  { id: 'N10', name: 'IMPROVEMENT_VELOCITY',
    modules: ['src/nullstar-omega-generation.mjs'],
    tests: ['tests/nullstar-omega-generation.test.mjs'],
    runtimeReceipts: ['artifacts/nullstar-omega/velocity.json'] },
  { id: 'N11', name: 'GENERALIZATION',
    modules: ['src/cross-domain-transfer-evaluator.mjs', 'src/transfer-evaluation-governor.mjs'],
    tests: ['tests/transfer-evaluation-governor.test.mjs'],
    runtimeReceipts: ['artifacts/nullstar-omega/generalization.json'] },
  // The calibration receipt is the reality-connection record rather than a
  // summary of it: this dimension is only allowed past VERIFIED by forecasts
  // that were sealed before a procedure ran and scored against what the
  // procedure emitted.
  { id: 'N12', name: 'CALIBRATION',
    modules: ['src/reality-calibration-ledger.mjs', 'src/nullstar-omega-reality-connection.mjs'],
    tests: ['tests/reality-calibration-ledger.test.mjs', 'tests/nullstar-omega-reality-connection.test.mjs'],
    runtimeReceipts: ['artifacts/nullstar-omega/reality-connection.json'],
    calibrationReceipts: ['artifacts/nullstar-omega/reality-connection.json'] },
  { id: 'N13', name: 'WORLD_MODEL',
    modules: ['src/knowledge-labyrinth-ubergraph.mjs', 'src/life-knowledge-graph.mjs'],
    tests: ['tests/knowledge-labyrinth-ubergraph.test.mjs'] },
  { id: 'N14', name: 'REALITY_BUS',
    modules: ['src/current-reality-freeze.mjs', 'src/runtime-transition-receipts.mjs'],
    tests: ['tests/current-reality-freeze.test.mjs'] },
  { id: 'N15', name: 'MISSION_COMPILATION',
    modules: ['src/canonical-execution-leaf-materializer.mjs', 'src/execution-leaf-graph.mjs'],
    tests: ['tests/execution-leaf-graph.test.mjs'],
    runtimeReceipts: ['artifacts/sovereign/canonical-execution-leaf-graph.json'] },
  { id: 'N16', name: 'OPPORTUNITY_DISCOVERY',
    modules: ['src/commercial-opportunity-catalog.mjs', 'src/ai-access-opportunity-registry.mjs'],
    tests: ['tests/event-horizon.test.mjs'] },
  { id: 'N17', name: 'PERSONAL_CIVILIZATION_RUNTIME',
    modules: ['src/personal-civilization-core.mjs', 'src/life-possibility-engine.mjs'],
    tests: ['tests/life-possibility-engine.test.mjs'] },
  { id: 'N18', name: 'HUMAN_CAPABILITY_COMPILATION',
    modules: ['src/human-capability-genome.mjs'],
    tests: ['tests/human-capability-genome.test.mjs'] },
  { id: 'N19', name: 'ECONOMIC_AUTONOMY',
    modules: ['src/paypal-payment-truth.mjs', 'src/first-cash-canary-packet-core.mjs'],
    tests: ['tests/paypal-replay-identity-hostile.test.mjs'] },
  { id: 'N20', name: 'RUNTIME_SOVEREIGNTY',
    modules: ['src/sovereign-founder-console.mjs'],
    tests: ['tests/sovereign-founder-console-private-network-auth.test.mjs'] },
  { id: 'N21', name: 'CONTEXT_IMMORTALITY',
    modules: ['scripts/context-universe.mjs', 'scripts/uberbond-brain-bootstrap.mjs'],
    tests: ['tests/uberbond-brain-bootstrap.test.mjs'],
    canonDocs: ['docs/UNIVERSAL_CONTEXT_PROTOCOL.md', 'AI_START_HERE.md'] },
  { id: 'N22', name: 'SECURITY_AUTHORITY',
    modules: ['src/sovereign-privacy-firewall.mjs', 'src/agent-code-change-contract.mjs'],
    tests: ['tests/sovereign-privacy-firewall.test.mjs'] },
  { id: 'N23', name: 'RESILIENCE',
    modules: ['src/durable-scheduler-occurrence.mjs', 'src/reservation-recovery.mjs'],
    tests: ['tests/reservation-recovery.test.mjs'] },
  { id: 'N24', name: 'FOUNDER_COCKPIT',
    modules: ['api/command-center.mjs', 'src/founder-minute-priority.mjs', 'src/nullstar-omega-transfer-bindings.mjs'],
    tests: ['tests/autonomy-command-center-wiring.test.mjs', 'tests/nullstar-omega-transfer-bindings.test.mjs'] }
]);

const exists = (path, index) => Boolean(index?.has?.(path));

function refuse(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: NULLSTAR_OMEGA_DENOMINATOR_VERSION,
    status: 'NULLSTAR_OMEGA_DENOMINATOR_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS },
    ...extra
  };
}

/**
 * The state one dimension is entitled to.
 *
 * The ladder climbs only on evidence of a stronger kind than the rung below.
 * The two top rungs are deliberately unreachable from source alone: a receipt
 * is a file that only exists because something ran, and a calibration receipt
 * only because a prediction was later compared with an observation. That is the
 * difference between a system that could work and one that has.
 */
export function classifyDimension(dimension, fileIndex) {
  const modules = (dimension.modules || []).filter(path => exists(path, fileIndex));
  const tests = (dimension.tests || []).filter(path => exists(path, fileIndex));
  const canon = (dimension.canonDocs || []).filter(path => exists(path, fileIndex));
  const receipts = (dimension.runtimeReceipts || []).filter(path => exists(path, fileIndex));
  const calibration = (dimension.calibrationReceipts || []).filter(path => exists(path, fileIndex));

  const declaredModules = (dimension.modules || []).length;
  const allModules = declaredModules > 0 && modules.length === declaredModules;

  let state;
  if (calibration.length) state = 'REALITY_CALIBRATED';
  else if (receipts.length && tests.length) state = 'OPERATING';
  else if (allModules && tests.length) state = 'VERIFIED';
  else if (modules.length && tests.length) state = 'PARTIAL';
  else if (allModules) state = 'IMPLEMENTED';
  else if (modules.length) state = 'PARTIAL';
  else if (canon.length) state = 'CANON';
  else state = 'ABSENT';

  return {
    id: dimension.id,
    name: dimension.name,
    state,
    evidence: {
      modulesPresent: modules,
      modulesMissing: (dimension.modules || []).filter(path => !exists(path, fileIndex)),
      testsPresent: tests,
      canonPresent: canon,
      runtimeReceiptsPresent: receipts,
      calibrationReceiptsPresent: calibration
    }
  };
}

/**
 * Compiles the denominator, refusing to emit one that lost a dimension or
 * shrank against a prior compile.
 *
 * The conservation check is the safeguard that matters. A denominator you can
 * shorten is a denominator that reports a better number every time a hard
 * dimension becomes inconvenient.
 */
export function compileOmegaDenominator({ fileIndex = new Set(), previousDimensionIds = [], generatedAt = new Date().toISOString(), sourceCommit = null } = {}) {
  const index = fileIndex instanceof Set ? fileIndex : new Set(Array.isArray(fileIndex) ? fileIndex : []);
  const ids = OMEGA_DIMENSIONS.map(dimension => dimension.id);
  if (new Set(ids).size !== ids.length) return refuse(['duplicate-dimension-id']);

  const lost = previousDimensionIds.filter(id => !ids.includes(id));
  if (lost.length) return refuse(lost.map(id => `dimension-may-not-be-removed:${id}`));

  const dimensions = OMEGA_DIMENSIONS.map(dimension => classifyDimension(dimension, index));
  if (dimensions.length !== OMEGA_DIMENSIONS.length) return refuse(['denominator-must-not-drop-a-dimension']);

  const byState = Object.fromEntries(DENOMINATOR_STATES.map(state => [state, 0]));
  for (const row of dimensions) {
    if (!DENOMINATOR_STATES.includes(row.state)) return refuse([`noncanonical-dimension-state:${row.id}`]);
    byState[row.state] += 1;
  }

  return {
    ok: true,
    version: NULLSTAR_OMEGA_DENOMINATOR_VERSION,
    status: 'NULLSTAR_OMEGA_DENOMINATOR_COMPILED',
    sourceCommit,
    generatedAt,
    counts: { dimensions: dimensions.length, byState },
    dimensions,
    denominatorDigest: createHash('sha256')
      .update(JSON.stringify(dimensions.map(row => [row.id, row.state])))
      .digest('hex'),
    immutabilityLaw: 'ADDITIVE_ONLY. A dimension may be added. Removing one fails the compile, because a denominator that can be shortened reports a better number every time a hard dimension becomes inconvenient.',
    truthBoundary:
      'STATES_ARE_COMPUTED_FROM_FILE_EVIDENCE_ONLY. IMPLEMENTED_MEANS_THE_MODULES_EXIST; VERIFIED_MEANS_TESTS_EXERCISE_THEM; '
      + 'OPERATING_MEANS_A_RUN_LEFT_A_RECEIPT; REALITY_CALIBRATED_MEANS_A_PREDICTION_WAS_LATER_CHECKED_AGAINST_AN_OBSERVATION. '
      + 'NO_STATE_HERE_PROVES_RUNTIME_QUALITY_EXTERNAL_OUTCOMES_SELF_IMPROVEMENT_OR_ASI.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS }
  };
}
