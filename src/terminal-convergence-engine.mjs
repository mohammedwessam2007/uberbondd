import { createHash } from 'node:crypto';

export const ASI_DIMENSIONS = Object.freeze([
  'novel_problem_solving','causal_reasoning','scientific_discovery','software_engineering',
  'mathematical_reasoning','strategy','forecasting','world_model_construction',
  'mechanism_invention','economic_reasoning','planning_under_uncertainty','long_horizon_coherence',
  'transfer_between_domains','learning_from_sparse_evidence','capability_acquisition','autonomous_recovery',
  'self_improvement','tool_invention','adversarial_robustness','calibrated_refusal_and_ignorance_detection'
]);

const DEFAULT_ATTACKS = Object.freeze([
  'direct','decompose','counterexample','alternate_representation','tool_augmented','cross_model',
  'researcher_critic_planner','self_consistency','retrieval_augmented','mechanism_recombination'
]);

const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function createConvergencePlan({
  candidateId,
  candidateRevision,
  failedDimensions = ASI_DIMENSIONS,
  attackFamilies = DEFAULT_ATTACKS,
  variantsPerAttack = 4,
  generation = 0
}) {
  assert(candidateId && candidateRevision, 'candidate identity required');
  const failures = [...new Set(failedDimensions)];
  for (const dimension of failures) assert(ASI_DIMENSIONS.includes(dimension), `unknown dimension: ${dimension}`);
  assert(Number.isInteger(variantsPerAttack) && variantsPerAttack > 0, 'variantsPerAttack must be positive integer');

  const lanes = [];
  for (const dimension of failures) {
    for (const attack of attackFamilies) {
      for (let variant = 0; variant < variantsPerAttack; variant += 1) {
        const seed = { candidateId, candidateRevision, dimension, attack, variant, generation };
        lanes.push({
          laneId: sha256(seed),
          dimension,
          attack,
          variant,
          generation,
          authority: 'ZERO_EXTERNAL_EFFECT',
          status: 'PENDING',
          requiredEvidence: 'FRESH_HIDDEN_BEHAVIORAL_OBSERVATION'
        });
      }
    }
  }

  return Object.freeze({
    schemaVersion: 'uberbond.terminal-convergence-plan.v1',
    candidateId,
    candidateRevision,
    frozenDimensions: ASI_DIMENSIONS,
    failedDimensions: failures,
    denominator: ASI_DIMENSIONS.length,
    generation,
    lanes,
    planHash: sha256({ candidateId, candidateRevision, failures, attackFamilies, variantsPerAttack, generation })
  });
}

export function validateBehavioralObservation(plan, observation, accepted = []) {
  assert(plan?.schemaVersion === 'uberbond.terminal-convergence-plan.v1', 'invalid plan');
  assert(observation && typeof observation === 'object', 'observation required');
  assert(observation.candidateId === plan.candidateId, 'candidateId mismatch');
  assert(observation.candidateRevision === plan.candidateRevision, 'candidateRevision mismatch');
  assert(plan.frozenDimensions.includes(observation.dimension), 'dimension outside frozen denominator');
  assert(observation.observed === true, 'unobserved evidence rejected');
  assert(observation.behavioral === true, 'non-behavioral evidence rejected');
  assert(observation.synthetic !== true, 'synthetic evidence rejected');
  assert(observation.latencyOnly !== true, 'latency-only evidence rejected');
  assert(observation.hiddenPopulation === true, 'population must be hidden/post-freeze');
  assert(typeof observation.taskPopulationHash === 'string' && observation.taskPopulationHash.length >= 32, 'task population hash required');
  assert(typeof observation.verifierLineage === 'string' && observation.verifierLineage.length > 0, 'verifier lineage required');
  assert(Number.isFinite(observation.baselineScore), 'baselineScore required');
  assert(Number.isFinite(observation.candidateScore), 'candidateScore required');
  assert(observation.candidateScore > observation.baselineScore, 'behavioral uplift required');
  assert(observation.noRegression === true, 'noRegression must be proven');

  const duplicatePopulation = accepted.some(item => item.taskPopulationHash === observation.taskPopulationHash);
  assert(!duplicatePopulation, 'task population cannot be reused across admitted evidence');
  const duplicateVerifier = accepted.some(item => item.dimension !== observation.dimension && item.verifierLineage === observation.verifierLineage);
  assert(!duplicateVerifier, 'verifier lineage must be independent across dimensions');

  return Object.freeze({ ...observation, admitted: true, evidenceHash: sha256(observation) });
}

export function summarizeConvergence(plan, admittedEvidence = []) {
  const byDimension = new Map();
  for (const item of admittedEvidence) {
    if (item?.admitted === true && plan.frozenDimensions.includes(item.dimension)) byDimension.set(item.dimension, item);
  }
  const passedDimensions = plan.frozenDimensions.filter(dimension => byDimension.has(dimension));
  const failedDimensions = plan.frozenDimensions.filter(dimension => !byDimension.has(dimension));
  const percentage = Math.floor((passedDimensions.length / plan.denominator) * 10000) / 100;
  return Object.freeze({
    candidateId: plan.candidateId,
    candidateRevision: plan.candidateRevision,
    denominator: plan.denominator,
    passedDimensions,
    failedDimensions,
    passedCount: passedDimensions.length,
    failedCount: failedDimensions.length,
    percentage,
    terminal: failedDimensions.length === 0,
    verdict: failedDimensions.length === 0 ? 'PRIVATE_ASI_INTERNAL_STANDARD_SATISFIED' : 'MORE_BEHAVIORAL_EVIDENCE_REQUIRED'
  });
}

export function breedNextGeneration(plan, admittedEvidence = []) {
  const summary = summarizeConvergence(plan, admittedEvidence);
  if (summary.terminal) return Object.freeze({ ...plan, lanes: [], generation: plan.generation + 1, terminal: true });
  const successfulAttacks = new Map();
  for (const evidence of admittedEvidence) {
    if (!evidence?.admitted || !evidence.attack) continue;
    const key = evidence.dimension;
    const attacks = successfulAttacks.get(key) ?? new Set();
    attacks.add(evidence.attack);
    successfulAttacks.set(key, attacks);
  }
  const attackFamilies = [...new Set([
    ...DEFAULT_ATTACKS,
    ...[...successfulAttacks.values()].flatMap(set => [...set].map(attack => `recombine:${attack}`))
  ])];
  return createConvergencePlan({
    candidateId: plan.candidateId,
    candidateRevision: plan.candidateRevision,
    failedDimensions: summary.failedDimensions,
    attackFamilies,
    variantsPerAttack: 8,
    generation: plan.generation + 1
  });
}
