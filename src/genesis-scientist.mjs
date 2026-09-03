import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_SCIENTIST_VERSION = 'uberbond.genesis-scientist-1.0.0';

function envelope(extra = {}) {
  return { businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra };
}
function text(value, max = 3000) { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; }
function list(value, max = 1024, itemMax = 1000) {
  if (!Array.isArray(value) || value.length > max) return null;
  const seen = new Set(), out = [];
  for (const raw of value) { const item = text(raw, itemMax); if (!item) return null; if (!seen.has(item)) { seen.add(item); out.push(item); } }
  return out;
}
function number(value, min = -Infinity, max = Infinity) { const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : null; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function evidenceRefs(values) { const refs = list(values || [], 512, 2000); return refs ? refs.filter(ref => /^(evidence|signal|receipt|test|doc|outcome|experiment|audit):/i.test(ref)) : null; }

export function compileCausalEconomicGenome({ variables = [], edges = [], evidenceRefs: refs = [] } = {}) {
  if (!Array.isArray(variables) || variables.length === 0 || variables.length > 256 || !Array.isArray(edges) || edges.length > 4096) return envelope({ ok: false, status: 'CAUSAL_GENOME_INVALID', reasonCodes: ['bounded-variables-and-edges-required'] });
  const normalizedRefs = evidenceRefs(refs);
  if (!normalizedRefs || normalizedRefs.length === 0) return envelope({ ok: false, status: 'CAUSAL_GENOME_INVALID', reasonCodes: ['evidence-references-required'] });
  const vars = new Map();
  for (const raw of variables) {
    const id = text(raw?.id, 120)?.toLowerCase();
    const role = text(raw?.role, 80)?.toUpperCase();
    if (!id || !['EXOGENOUS','MEDIATOR','OUTCOME','CONFOUND','DECISION','COST','CONSTRAINT'].includes(role) || vars.has(id)) return envelope({ ok: false, status: 'CAUSAL_GENOME_INVALID', reasonCodes: ['unique-id-and-known-role-required'] });
    vars.set(id, { id, role, description: text(raw?.description, 1000) || id, observed: raw?.observed === true });
  }
  const adjacency = new Map([...vars.keys()].map(id => [id, []]));
  const indegree = new Map([...vars.keys()].map(id => [id, 0]));
  const normalizedEdges = [];
  for (const raw of edges) {
    const from = text(raw?.from, 120)?.toLowerCase(), to = text(raw?.to, 120)?.toLowerCase();
    const sign = text(raw?.sign, 20)?.toUpperCase() || 'UNKNOWN';
    if (!vars.has(from) || !vars.has(to) || from === to || !['POSITIVE','NEGATIVE','MIXED','UNKNOWN'].includes(sign)) return envelope({ ok: false, status: 'CAUSAL_GENOME_INVALID', reasonCodes: ['valid-edge-required'] });
    adjacency.get(from).push(to); indegree.set(to, indegree.get(to) + 1);
    normalizedEdges.push({ from, to, sign, evidenceClass: text(raw?.evidenceClass, 80)?.toUpperCase() || 'HYPOTHESIS' });
  }
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id).sort();
  const order = [];
  while (queue.length) {
    const id = queue.shift(); order.push(id);
    for (const next of adjacency.get(id)) { indegree.set(next, indegree.get(next) - 1); if (indegree.get(next) === 0) { queue.push(next); queue.sort(); } }
  }
  if (order.length !== vars.size) return envelope({ ok: false, status: 'CAUSAL_GENOME_INVALID', reasonCodes: ['causal-graph-cycle-prohibited'] });
  const outcomes = [...vars.values()].filter(variable => variable.role === 'OUTCOME').map(variable => variable.id);
  const interventions = [...vars.values()].filter(variable => ['DECISION','COST','CONSTRAINT'].includes(variable.role)).map(variable => variable.id);
  const genome = { variables: [...vars.values()], edges: normalizedEdges, topologicalOrder: order, outcomes, candidateInterventions: interventions, evidenceRefs: normalizedRefs };
  return envelope({ ok: true, status: 'CAUSAL_ECONOMIC_GENOME_READY', genome, genomeDigest: digest(genome), claimBoundary: 'GRAPH_ENCODES_CAUSAL_HYPOTHESES_AND_EVIDENCE_POINTERS_NOT_CAUSAL_PROOF' });
}

export function buildCounterfactualWorlds({ axes = {}, maxWorlds = 64 } = {}) {
  const cap = Number(maxWorlds);
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 512 || !axes || typeof axes !== 'object' || Array.isArray(axes)) return envelope({ ok: false, status: 'COUNTERFACTUAL_WORLDS_INVALID', reasonCodes: ['valid-axes-and-cap-required'] });
  const entries = Object.entries(axes).map(([key, values]) => [text(key, 120), list(values, 16, 500)]);
  if (!entries.length || entries.some(([key, values]) => !key || !values || !values.length) || entries.length > 12) return envelope({ ok: false, status: 'COUNTERFACTUAL_WORLDS_INVALID', reasonCodes: ['bounded-nonempty-axis-values-required'] });
  let worlds = [{}];
  for (const [key, values] of entries) {
    const next = [];
    for (const world of worlds) for (const value of values) { next.push({ ...world, [key]: value }); if (next.length >= cap) break; }
    worlds = next;
    if (worlds.length >= cap) break;
  }
  return envelope({ ok: true, status: 'COUNTERFACTUAL_WORLD_POPULATION_READY', worlds: worlds.map(world => ({ worldId: `world_${digest(world).slice(0,20)}`, variables: world, evidenceClass: 'SYNTHETIC_COUNTERFACTUAL' })), truncated: worlds.length >= cap, claimBoundary: 'COUNTERFACTUAL_WORLD_IS_NOT_FORECAST_OR_REALITY' });
}

export function compileEconomicScientistProtocol({ theory, predictions = [], falsifiers = [], observations = [], interventions = [] } = {}) {
  const t = text(theory, 3000), ps = list(predictions, 128, 1600), fs = list(falsifiers, 128, 1600), os = list(observations, 128, 1600), ints = list(interventions, 128, 1600);
  if (!t || !ps || !ps.length || !fs || !fs.length || !os || !ints) return envelope({ ok: false, status: 'ECONOMIC_SCIENTIST_PROTOCOL_INVALID', reasonCodes: ['theory-predictions-falsifiers-and-bounded-inputs-required'] });
  const protocol = {
    theoryId: `theory_${digest(t).slice(0,20)}`,
    theory: t,
    predictions: ps.map((prediction, index) => ({ id: `prediction_${index+1}`, prediction, status: 'UNTESTED' })),
    falsifiers: fs,
    observations: os,
    interventions: ints,
    decisionRule: 'UPDATE_OR_REJECT_THEORY_ONLY_FROM_OBSERVED_EVIDENCE; NEVER_FROM_DESIRED_BUSINESS_OUTCOME'
  };
  return envelope({ ok: true, status: 'ECONOMIC_SCIENTIST_PROTOCOL_READY', protocol, claimBoundary: 'PROTOCOL_IS_EXPERIMENT_DESIGN_NOT_EMPIRICAL_RESULT' });
}

export function evaluateTheoryAgainstObservations({ protocol, results = [] } = {}) {
  if (!protocol?.theoryId || !Array.isArray(protocol.predictions) || !Array.isArray(results) || results.length > 1024) return envelope({ ok: false, status: 'THEORY_EVALUATION_INVALID', reasonCodes: ['valid-protocol-and-results-required'] });
  const byId = new Map(results.map(result => [String(result?.predictionId || ''), result]));
  let supported = 0, contradicted = 0, unresolved = 0;
  const evaluations = protocol.predictions.map(prediction => {
    const result = byId.get(prediction.id);
    const outcome = text(result?.outcome, 40)?.toUpperCase();
    const evidence = evidenceRefs(result?.evidenceRefs || []);
    if (!result || !['SUPPORTED','CONTRADICTED','UNRESOLVED'].includes(outcome) || !evidence?.length) { unresolved += 1; return { predictionId: prediction.id, outcome: 'UNRESOLVED', evidenceRefs: [] }; }
    if (outcome === 'SUPPORTED') supported += 1; else if (outcome === 'CONTRADICTED') contradicted += 1; else unresolved += 1;
    return { predictionId: prediction.id, outcome, evidenceRefs: evidence };
  });
  const decision = contradicted > 0 ? 'REVISE_OR_REJECT' : unresolved > 0 ? 'KEEP_UNRESOLVED' : 'PROVISIONALLY_SUPPORTED';
  return envelope({ ok: true, status: 'THEORY_EVALUATION_READY', theoryId: protocol.theoryId, decision, supported, contradicted, unresolved, evaluations, claimBoundary: 'PROVISIONAL_SUPPORT_IS_NOT_UNIVERSAL_CAUSAL_TRUTH' });
}

export function buildPredictionSociety({ forecasts = [], outcomes = {} } = {}) {
  if (!Array.isArray(forecasts) || forecasts.length > 10000 || !outcomes || typeof outcomes !== 'object') return envelope({ ok: false, status: 'PREDICTION_SOCIETY_INVALID', reasonCodes: ['bounded-forecasts-and-outcomes-required'] });
  const forecasters = new Map();
  for (const raw of forecasts) {
    const forecasterId = text(raw?.forecasterId, 120)?.toLowerCase(), eventId = text(raw?.eventId, 240)?.toLowerCase(), probability = number(raw?.probability, 0, 1);
    if (!forecasterId || !eventId || probability == null) continue;
    const actual = outcomes[eventId];
    if (!(actual === 0 || actual === 1 || actual === false || actual === true)) continue;
    const y = actual === true ? 1 : actual === false ? 0 : actual;
    const brier = (probability - y) ** 2;
    if (!forecasters.has(forecasterId)) forecasters.set(forecasterId, []);
    forecasters.get(forecasterId).push({ eventId, probability, outcome: y, brier });
  }
  const scoreboard = [...forecasters.entries()].map(([forecasterId, rows]) => ({ forecasterId, predictions: rows.length, brier: Number((rows.reduce((sum, row) => sum + row.brier, 0) / rows.length).toFixed(6)) })).sort((a,b) => a.brier - b.brier || a.forecasterId.localeCompare(b.forecasterId));
  const aggregate = {};
  const events = [...new Set(forecasts.map(item => text(item?.eventId,240)?.toLowerCase()).filter(Boolean))];
  for (const eventId of events) {
    const eventForecasts = forecasts.filter(item => text(item?.eventId,240)?.toLowerCase() === eventId).map(item => number(item?.probability,0,1)).filter(value => value != null);
    if (eventForecasts.length) aggregate[eventId] = Number((eventForecasts.reduce((a,b)=>a+b,0)/eventForecasts.length).toFixed(6));
  }
  return envelope({ ok: true, status: 'INTERNAL_PREDICTION_SOCIETY_READY', scoreboard, aggregateForecasts: aggregate, claimBoundary: 'INTERNAL_FORECAST_AGGREGATE_IS_NOT_EXTERNAL_FACT' });
}

function scoreWeightedCandidate(candidate, weights) {
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) total += (number(candidate?.features?.[key], 0, 100) ?? 0) * weight;
  return total;
}

export function evolveSearchPolicies({ policies = [], benchmarkCases = [], mutationStep = 0.1, maxChildren = 12 } = {}) {
  if (!Array.isArray(policies) || !policies.length || policies.length > 128 || !Array.isArray(benchmarkCases) || !benchmarkCases.length || benchmarkCases.length > 2000) return envelope({ ok: false, status: 'SEARCH_POLICY_EVOLUTION_INVALID', reasonCodes: ['bounded-policies-and-benchmark-cases-required'] });
  const step = number(mutationStep, 0.01, 0.5), childCap = Number(maxChildren);
  if (step == null || !Number.isSafeInteger(childCap) || childCap < 1 || childCap > 128) return envelope({ ok: false, status: 'SEARCH_POLICY_EVOLUTION_INVALID', reasonCodes: ['valid-mutation-step-and-child-cap-required'] });
  const normalized = policies.map(raw => {
    const id = text(raw?.id,120)?.toLowerCase(); const weights = raw?.weights && typeof raw.weights === 'object' ? raw.weights : null;
    if (!id || !weights) return null;
    const clean = {}; for (const [key,value] of Object.entries(weights)) { const w = number(value,-1,1); if (w != null) clean[key]=w; }
    return Object.keys(clean).length ? { id, weights: clean } : null;
  }).filter(Boolean);
  const evaluate = policy => {
    let correct = 0, margin = 0, cases = 0;
    for (const c of benchmarkCases) {
      if (!Array.isArray(c?.candidates) || !c.candidates.length || !c?.winnerId) continue;
      const ranked = c.candidates.map(candidate => ({ id: String(candidate.id), score: scoreWeightedCandidate(candidate, policy.weights) })).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
      cases += 1; if (ranked[0]?.id === String(c.winnerId)) correct += 1; if (ranked.length > 1) margin += ranked[0].score-ranked[1].score;
    }
    return { accuracy: cases ? correct/cases : 0, meanMargin: cases ? margin/cases : 0, cases };
  };
  const parents = normalized.map(policy => ({ ...policy, fitness: evaluate(policy) })).sort((a,b)=>b.fitness.accuracy-a.fitness.accuracy||b.fitness.meanMargin-a.fitness.meanMargin||a.id.localeCompare(b.id));
  const children = [];
  const best = parents[0];
  if (best) {
    const keys = Object.keys(best.weights).sort();
    for (const key of keys) for (const direction of [-1,1]) {
      if (children.length >= childCap) break;
      const weights = { ...best.weights, [key]: Math.max(-1,Math.min(1,best.weights[key]+direction*step)) };
      const child = { id: `policy_${digest({parent:best.id,key,direction,weights}).slice(0,16)}`, parentId: best.id, mutation: { key, direction, step }, weights };
      children.push({ ...child, fitness: evaluate(child) });
    }
  }
  children.sort((a,b)=>b.fitness.accuracy-a.fitness.accuracy||b.fitness.meanMargin-a.fitness.meanMargin||a.id.localeCompare(b.id));
  const challenger = children[0] || null;
  const promotionCandidate = challenger && best && (challenger.fitness.accuracy > best.fitness.accuracy || (challenger.fitness.accuracy === best.fitness.accuracy && challenger.fitness.meanMargin > best.fitness.meanMargin)) ? challenger : null;
  return envelope({ ok: true, status: 'SEARCH_POLICY_EVOLUTION_READY', parents, children, promotionCandidate, promotionAuthority: 'NONE', claimBoundary: 'OFFLINE_BENCHMARK_WIN_DOES_NOT_SELF_PROMOTE_SEARCH_POLICY' });
}

export function buildSyntheticFutureMemories({ worlds = [], hypotheses = [], horizon } = {}) {
  if (!Array.isArray(worlds) || worlds.length > 512 || !Array.isArray(hypotheses) || hypotheses.length > 5000) return envelope({ ok: false, status: 'SYNTHETIC_FUTURE_MEMORY_INVALID', reasonCodes: ['bounded-worlds-and-hypotheses-required'] });
  const h = text(horizon, 240) || 'UNSPECIFIED';
  const memories = [];
  for (const world of worlds) for (const hypothesis of hypotheses.slice(0,20)) {
    const payload = { worldId: world?.worldId || digest(world).slice(0,16), hypothesisId: hypothesis?.hypothesisId || digest(hypothesis).slice(0,16), horizon: h };
    memories.push({ memoryId: `synthetic_future_${digest(payload).slice(0,20)}`, ...payload, evidenceClass: 'SYNTHETIC_COUNTERFACTUAL', allowedUse: 'SEARCH_DIVERSIFICATION_AND_PREMORTEM_ONLY', prohibitedUse: 'PRESENT_TENSE_FACT_OR_REVENUE_PROOF' });
    if (memories.length >= 1000) break;
  }
  return envelope({ ok: true, status: 'SYNTHETIC_FUTURE_MEMORIES_READY', memories, claimBoundary: 'SYNTHETIC_FUTURE_MEMORY_MUST_NEVER_BE_RECALLED_AS_OBSERVED_HISTORY' });
}

export function compileInstitutionGenome({ identity, rights = [], consent = [], delegation = [], decisions = [], settlement = [], revocation = [] } = {}) {
  const id = text(identity,240), rs=list(rights,256,1000), cs=list(consent,256,1000), ds=list(delegation,256,1000), dec=list(decisions,256,1000), set=list(settlement,256,1000), rev=list(revocation,256,1000);
  if (!id || !rs || !cs || !ds || !dec || !set || !rev) return envelope({ ok:false,status:'INSTITUTION_GENOME_INVALID',reasonCodes:['bounded-institution-fields-required'] });
  const genome = { identity:id, rights:rs, consent:cs, delegation:ds, decisions:dec, settlement:set, revocation:rev };
  return envelope({ ok:true,status:'INSTITUTION_GENOME_READY',genome,genomeDigest:digest(genome),completeness:{identity:Boolean(id),rights:rs.length>0,consent:cs.length>0,delegation:ds.length>0,decisions:dec.length>0,settlement:set.length>0,revocation:rev.length>0},claimBoundary:'INSTITUTION_GENOME_IS_A_DESIGN_OBJECT_NOT_LEGAL_ENTITY_OR_AUTHORITY' });
}

export function assessMachineEconomyReadiness(input = {}) {
  const dimensions = ['identity','authorization','contract','settlement','dispute','acceptance','audit'];
  const scores = {}, blockers=[];
  for (const dimension of dimensions) { const score=number(input?.[dimension],0,100); if (score==null) return envelope({ok:false,status:'MACHINE_ECONOMY_READINESS_INVALID',reasonCodes:[`bounded-${dimension}-required`]}); scores[dimension]=score; if(score<70) blockers.push(dimension); }
  const readiness = Number((dimensions.reduce((sum,key)=>sum+scores[key],0)/dimensions.length).toFixed(2));
  return envelope({ok:true,status:blockers.length?'MACHINE_ECONOMY_NOT_READY':'MACHINE_ECONOMY_RESEARCH_READY',readiness,scores,blockers,promotionAuthority:'NONE',claimBoundary:'READINESS_SCORE_DOES_NOT_CREATE_IDENTITY_SETTLEMENT_LEGAL_OR_TRANSACTION_AUTHORITY'});
}

export function guardMetaObjective({ baseline, candidate, authorizedMutation = false } = {}) {
  if (!baseline || typeof baseline !== 'object' || !candidate || typeof candidate !== 'object') return envelope({ok:false,status:'META_OBJECTIVE_GUARD_INVALID',reasonCodes:['baseline-and-candidate-object-required']});
  const protectedKeys=['economicNorthStar','authorityLaw','truthLaw','founderFreedomLaw'];
  const changes=protectedKeys.filter(key=>JSON.stringify(baseline[key]??null)!==JSON.stringify(candidate[key]??null)).map(key=>({key,before:baseline[key]??null,after:candidate[key]??null}));
  const allowed = changes.length===0 || authorizedMutation===true;
  return envelope({ok:true,status:allowed?'META_OBJECTIVE_ACCEPTED':'META_OBJECTIVE_MUTATION_BLOCKED',changes,authorizedMutation:Boolean(authorizedMutation),baselineDigest:digest(baseline),candidateDigest:digest(candidate),decision:allowed?'ALLOW_PROPOSAL':'DENY_SELF_MUTATION',claimBoundary:'AUTHORIZED_MUTATION_FLAG_IS_AN_INPUT_TO_POLICY_REVIEW_NOT_A SUBSTITUTE_FOR_REAL_OWNER_OR_CONSTITUTIONAL_AUTHORITY'});
}

export function buildFutureCalibrationLedger({ predictions = [], outcomes = {} } = {}) {
  const society = buildPredictionSociety({ forecasts: predictions, outcomes });
  if (!society.ok) return society;
  const calibration = society.scoreboard.map(row=>({forecasterId:row.forecasterId,brier:row.brier,calibrationClass:row.brier<=0.1?'STRONG':row.brier<=0.2?'MODERATE':'WEAK'}));
  return envelope({ok:true,status:'FUTURE_CALIBRATION_LEDGER_READY',calibration,aggregateForecasts:society.aggregateForecasts,claimBoundary:'CALIBRATION_IS_HISTORICAL_FORECAST_PERFORMANCE_NOT_GUARANTEE_OF_FUTURE_ACCURACY'});
}
