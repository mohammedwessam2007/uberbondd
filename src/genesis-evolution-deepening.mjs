import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_EVOLUTION_DEEPENING_VERSION = 'uberbond.genesis-evolution-deepening.v1';
const envelope = (extra = {}) => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const num = (value, min = -Infinity, max = Infinity) => { const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const cleanWeights = (value = {}) => Object.fromEntries(Object.entries(value).map(([k, v]) => [String(k), num(v, -1, 1)]).filter(([, v]) => v != null));

function score(features = {}, weights = {}) {
  return Object.entries(weights).reduce((sum, [key, weight]) => sum + Number(features?.[key] ?? 0) * weight, 0);
}

export function coevolveEvaluatorEcology({ hypotheses = [], evaluators = [], rounds = 3, mutationStep = 0.05 } = {}) {
  const roundCount = Number(rounds), step = num(mutationStep, 0.001, 0.5);
  if (!Array.isArray(hypotheses) || !hypotheses.length || hypotheses.length > 1000 || !Array.isArray(evaluators) || !evaluators.length || evaluators.length > 64 || !Number.isSafeInteger(roundCount) || roundCount < 1 || roundCount > 20 || step == null) return envelope({ ok: false, status: 'EVALUATOR_COEVOLUTION_INVALID' });
  let population = evaluators.map((raw, index) => ({ id: String(raw?.id ?? `evaluator_${index + 1}`), weights: cleanWeights(raw?.weights), parentId: null })).filter(row => Object.keys(row.weights).length);
  if (!population.length) return envelope({ ok: false, status: 'EVALUATOR_COEVOLUTION_INVALID', reasonCodes: ['valid-evaluator-weights-required'] });
  const history = [];
  for (let round = 1; round <= roundCount; round += 1) {
    const ranked = population.map(evaluator => {
      const ordering = hypotheses.map((hypothesis, index) => ({ id: String(hypothesis?.id ?? index), score: score(hypothesis?.features, evaluator.weights), target: Number(hypothesis?.targetRank ?? index) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      const error = ordering.reduce((sum, row, index) => sum + Math.abs(index - row.target), 0) / Math.max(1, ordering.length);
      return { ...evaluator, loss: Number(error.toFixed(6)), ordering: ordering.map(row => row.id) };
    }).sort((a, b) => a.loss - b.loss || a.id.localeCompare(b.id));
    history.push({ round, evaluators: ranked.map(row => ({ id: row.id, loss: row.loss, ordering: row.ordering })) });
    const survivors = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
    const children = [];
    for (const parent of survivors) {
      const keys = Object.keys(parent.weights).sort();
      for (const key of keys.slice(0, 2)) {
        const direction = parseInt(hash(`${round}:${parent.id}:${key}`).slice(0, 2), 16) % 2 ? 1 : -1;
        const weights = { ...parent.weights, [key]: Math.max(-1, Math.min(1, parent.weights[key] + direction * step)) };
        children.push({ id: `eval_${hash({ round, parent: parent.id, key, weights }).slice(0, 16)}`, parentId: parent.id, weights });
      }
    }
    population = [...survivors.map(row => ({ id: row.id, parentId: row.parentId, weights: row.weights })), ...children].slice(0, 64);
  }
  return envelope({ ok: true, status: 'EVALUATOR_ECOLOGY_COEVOLVED', history, finalPopulation: population, promotionAuthority: 'NONE', claimBoundary: 'OFFLINE_COEVOLUTION_DOES_NOT_PROMOTE_EVALUATORS_OR_PROVE_EXTERNAL_VALUE' });
}

export function generateFutureRivals({ baseline = {}, changedPrimitives = [], assumptions = [], maxRivals = 16 } = {}) {
  const cap = Number(maxRivals);
  if (!baseline || typeof baseline !== 'object' || !Array.isArray(changedPrimitives) || !changedPrimitives.length || changedPrimitives.length > 128 || !Array.isArray(assumptions) || assumptions.length > 128 || !Number.isSafeInteger(cap) || cap < 1 || cap > 64) return envelope({ ok: false, status: 'FUTURE_RIVAL_GENERATION_INVALID' });
  const rivals = [];
  for (const primitive of changedPrimitives) {
    const primitiveId = String(primitive?.id ?? primitive).trim(); if (!primitiveId) continue;
    for (const assumption of assumptions.length ? assumptions : [{ id: 'baseline', statement: 'baseline architecture remains optimal' }]) {
      const assumptionId = String(assumption?.id ?? '').trim() || 'assumption';
      const architecture = { ...baseline, replacedAssumption: assumptionId, exploitingPrimitive: primitiveId, status: 'SYNTHETIC_RIVAL_BLUEPRINT' };
      rivals.push({ rivalId: `rival_${hash({ primitiveId, assumptionId, baseline }).slice(0, 20)}`, primitiveId, challengedAssumptionId: assumptionId, architecture, falsificationQuestion: `Would ${primitiveId} make assumption ${assumptionId} materially inferior under the same benchmark?` });
      if (rivals.length >= cap) break;
    }
    if (rivals.length >= cap) break;
  }
  return envelope({ ok: true, status: 'FUTURE_RIVALS_GENERATED', rivals, implementationAuthority: 'NONE', claimBoundary: 'RIVALS_ARE_SYNTHETIC_ARCHITECTURE_CHALLENGERS_NOT_EXECUTED_REPLACEMENTS' });
}

export function evolveGenesisPolicies({ seedPolicies = [], benchmarkCases = [], generations = 3, mutationStep = 0.05 } = {}) {
  const gens = Number(generations), step = num(mutationStep, 0.001, 0.5);
  if (!Array.isArray(seedPolicies) || !seedPolicies.length || seedPolicies.length > 64 || !Array.isArray(benchmarkCases) || !benchmarkCases.length || benchmarkCases.length > 2000 || !Number.isSafeInteger(gens) || gens < 1 || gens > 32 || step == null) return envelope({ ok: false, status: 'GENESIS_POLICY_EVOLUTION_INVALID' });
  let population = seedPolicies.map((p, i) => ({ id: String(p?.id ?? `policy_${i + 1}`), weights: cleanWeights(p?.weights), parentId: null })).filter(p => Object.keys(p.weights).length);
  const generationsOut = [];
  const fitness = (policy) => {
    let correct = 0, usable = 0;
    for (const item of benchmarkCases) {
      if (!Array.isArray(item?.candidates) || !item.candidates.length || item.winnerId == null) continue;
      const ranked = item.candidates.map(c => ({ id: String(c.id), score: score(c.features, policy.weights) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      usable += 1; if (ranked[0]?.id === String(item.winnerId)) correct += 1;
    }
    return usable ? correct / usable : 0;
  };
  for (let generation = 1; generation <= gens; generation += 1) {
    const ranked = population.map(p => ({ ...p, fitness: fitness(p) })).sort((a, b) => b.fitness - a.fitness || a.id.localeCompare(b.id));
    generationsOut.push({ generation, bestId: ranked[0]?.id ?? null, bestFitness: ranked[0]?.fitness ?? 0 });
    const elite = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3)));
    const offspring = [];
    for (const parent of elite) for (const key of Object.keys(parent.weights).sort().slice(0, 3)) {
      const direction = parseInt(hash(`${generation}:${parent.id}:${key}`).slice(0, 2), 16) % 2 ? 1 : -1;
      const weights = { ...parent.weights, [key]: Math.max(-1, Math.min(1, parent.weights[key] + direction * step)) };
      offspring.push({ id: `genesis2_${hash({ generation, parent: parent.id, key, weights }).slice(0, 16)}`, parentId: parent.id, weights });
    }
    population = [...elite.map(({ id, parentId, weights }) => ({ id, parentId, weights })), ...offspring].slice(0, 64);
  }
  const final = population.map(p => ({ ...p, fitness: fitness(p) })).sort((a, b) => b.fitness - a.fitness || a.id.localeCompare(b.id));
  return envelope({ ok: true, status: 'GENESIS_POLICY_POPULATION_EVOLVED', generations: generationsOut, challenger: final[0] ?? null, promotionAuthority: 'NONE', claimBoundary: 'MULTI_GENERATION_OFFLINE_EVOLUTION_NEVER_SELF_PROMOTES_TO_PRODUCTION' });
}
