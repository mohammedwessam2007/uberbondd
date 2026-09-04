import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { THREAD_OPPORTUNITY_UNIVERSE } from './thread-opportunity-universe.mjs';

export const GENESIS_EVOLUTION_ENGINE_VERSION = 'uberbond.genesis-evolution-engine-1.0.0';

const IMPLEMENTED_IDEAS = Object.freeze({
  1: 'Unknown-Unknown Engine',
  2: 'Artificial Serendipity Engine',
  4: 'Future-Option Portfolio',
  10: 'Disagreement Mining',
  11: 'Reality-Anomaly Mining',
  12: 'Impossible-Task Ledger',
  13: 'Capability Multiplication Score',
  14: 'World Discontinuity Detector',
  22: 'Machine Curiosity Budget',
  28: 'Founder-Life Optimizer',
  30: 'UBERBOND GENESIS',
  47: 'Synthetic Entrepreneur Population',
  48: 'Cognitive Speciation',
  66: 'Surprise Score',
  87: 'Assumption Mutator',
  98: 'Shadow-Fork Darwinism',
  103: 'Evaluator Predator-Prey Ecology',
  104: 'Anti-Local-Maximum Launcher',
  167: 'Future Rival Generator',
  168: 'Paradigm Escape Hatch',
  174: 'Founder Freedom Derivative',
  175: 'GENESIS²',
  183: 'Counter-Theory Generator',
  240: 'Strategy Counterexample Library',
  269: 'Reversible-First Intelligence'
});

function envelope(extra = {}) {
  return {
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function text(value, max = 4000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function list(value, max = 4096, itemMax = 1200) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function boundedNumber(value, min = 0, max = 100) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function words(value) {
  return new Set(String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3));
}

function jaccard(a, b) {
  const A = words(a);
  const B = words(b);
  if (!A.size && !B.size) return 1;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection += 1;
  const union = new Set([...A, ...B]).size;
  return union ? intersection / union : 0;
}

function opportunityText(opportunity) {
  return [
    opportunity?.id,
    opportunity?.name,
    opportunity?.category,
    opportunity?.buyer,
    opportunity?.mechanism,
    opportunity?.monetization,
    opportunity?.distribution,
    opportunity?.recurrence,
    opportunity?.risk
  ].filter(Boolean).join(' ');
}

function normalizeOpportunity(raw) {
  const id = text(raw?.id, 240)?.toLowerCase();
  const name = text(raw?.name, 500);
  const category = text(raw?.category, 240)?.toLowerCase();
  const buyer = text(raw?.buyer, 1000);
  const mechanism = text(raw?.mechanism, 2000);
  const monetization = text(raw?.monetization, 1000);
  const distribution = text(raw?.distribution, 1000);
  const recurrence = text(raw?.recurrence, 1000);
  const risk = text(raw?.risk, 1200);
  if (!id || !name || !category || !mechanism) return null;
  return { id, name, category, buyer, mechanism, monetization, distribution, recurrence, risk };
}

function normalizePopulation(opportunities = THREAD_OPPORTUNITY_UNIVERSE, max = 5000) {
  if (!Array.isArray(opportunities) || opportunities.length > max) return null;
  return opportunities.map(normalizeOpportunity).filter(Boolean);
}

function lexicalSignalScore(blob, positive = [], negative = []) {
  const lower = String(blob || '').toLowerCase();
  const plus = positive.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
  const minus = negative.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
  return Math.max(0, Math.min(100, 50 + plus * 10 - minus * 12));
}

export function buildSurpriseScore({ signal, knownConcepts = [] } = {}) {
  const summary = text(signal?.summary, 6000);
  const primitives = list(signal?.changedPrimitives || signal?.claims || [], 256, 1000);
  const known = list(knownConcepts, 10000, 1200);
  if (!summary || !primitives || !known) return envelope({ ok: false, status: 'SURPRISE_SCORE_INVALID', reasonCodes: ['valid-signal-and-bounded-known-concepts-required'] });
  const candidate = `${summary} ${primitives.join(' ')}`;
  let maxSimilarity = 0;
  for (const concept of known) maxSimilarity = Math.max(maxSimilarity, jaccard(candidate, concept));
  const novelty = Number(((1 - maxSimilarity) * 100).toFixed(2));
  const primitiveDiversity = Math.min(100, primitives.length * 12.5);
  const score = Number((novelty * 0.8 + primitiveDiversity * 0.2).toFixed(2));
  return envelope({ ok: true, status: 'SURPRISE_SCORE_READY', score, novelty, primitiveDiversity, maxKnownSimilarity: Number(maxSimilarity.toFixed(4)), claimBoundary: 'SURPRISE_IS_SEARCH_PRIORITY_NOT_TRUTH_OR_ECONOMIC_PROOF' });
}

export function detectWorldDiscontinuity({ priorMetrics = {}, currentMetrics = {}, relativeThreshold = 0.5, absoluteThreshold = 20 } = {}) {
  const rel = Number(relativeThreshold);
  const abs = Number(absoluteThreshold);
  if (!Number.isFinite(rel) || rel < 0 || rel > 100 || !Number.isFinite(abs) || abs < 0) {
    return envelope({ ok: false, status: 'WORLD_DISCONTINUITY_INVALID', reasonCodes: ['valid-thresholds-required'] });
  }
  const changes = [];
  const keys = [...new Set([...Object.keys(priorMetrics || {}), ...Object.keys(currentMetrics || {})])].sort();
  for (const key of keys) {
    const before = Number(priorMetrics?.[key]);
    const after = Number(currentMetrics?.[key]);
    if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
    const delta = after - before;
    const relative = before === 0 ? (after === 0 ? 0 : Infinity) : Math.abs(delta / before);
    const crossed = Math.abs(delta) >= abs || relative >= rel;
    changes.push({ key, before, after, delta, relativeChange: Number.isFinite(relative) ? Number(relative.toFixed(4)) : null, discontinuity: crossed });
  }
  const discontinuities = changes.filter(change => change.discontinuity);
  return envelope({ ok: true, status: discontinuities.length ? 'WORLD_DISCONTINUITY_DETECTED' : 'NO_WORLD_DISCONTINUITY', discontinuities, changes, claimBoundary: 'METRIC_DISCONTINUITY_REQUIRES_CAUSAL_AND_SOURCE_REVIEW' });
}

export function scoreCapabilityMultiplication({ primitive, domains = [], opportunities = THREAD_OPPORTUNITY_UNIVERSE } = {}) {
  const p = text(primitive, 2000);
  const ds = list(domains, 256, 300);
  const population = normalizePopulation(opportunities);
  if (!p || !ds || !population) return envelope({ ok: false, status: 'CAPABILITY_MULTIPLICATION_INVALID', reasonCodes: ['primitive-domains-population-required'] });
  const needle = `${p} ${ds.join(' ')}`;
  const scored = population.map(opportunity => ({
    id: opportunity.id,
    category: opportunity.category,
    similarity: jaccard(needle, opportunityText(opportunity))
  })).filter(item => item.similarity >= 0.04).sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));
  const touchedCategories = new Set(scored.map(item => item.category));
  const reach = population.length ? scored.length / population.length : 0;
  const categoryReach = new Set(population.map(item => item.category)).size ? touchedCategories.size / new Set(population.map(item => item.category)).size : 0;
  const score = Number(Math.min(100, (reach * 65 + categoryReach * 35) * 100).toFixed(2));
  return envelope({ ok: true, status: 'CAPABILITY_MULTIPLICATION_SCORE_READY', primitive: p, score, touchedOpportunityCount: scored.length, totalOpportunityCount: population.length, touchedCategoryCount: touchedCategories.size, topAffected: scored.slice(0, 30), claimBoundary: 'LEXICAL_MULTIPLICATION_SCORE_IS_ROUTING_HEURISTIC_NOT_VALUE_PROOF' });
}

export function buildArtificialSerendipity({ opportunities = THREAD_OPPORTUNITY_UNIVERSE, seed = 'genesis', maxPairs = 24 } = {}) {
  const population = normalizePopulation(opportunities);
  const cap = Number(maxPairs);
  if (!population || !Number.isSafeInteger(cap) || cap < 1 || cap > 200) return envelope({ ok: false, status: 'ARTIFICIAL_SERENDIPITY_INVALID', reasonCodes: ['bounded-population-and-max-pairs-required'] });
  const candidates = [];
  for (let i = 0; i < population.length; i += 1) {
    for (let j = i + 1; j < population.length; j += 1) {
      const a = population[i], b = population[j];
      if (a.category === b.category) continue;
      const similarity = jaccard(opportunityText(a), opportunityText(b));
      const hash = digest(`${seed}:${a.id}:${b.id}`);
      const deterministicJitter = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
      const distance = 1 - similarity;
      const score = Number((distance * 85 + deterministicJitter * 15).toFixed(4));
      candidates.push({ a, b, similarity, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score || x.a.id.localeCompare(y.a.id) || x.b.id.localeCompare(y.b.id));
  const selected = candidates.slice(0, cap).map(({ a, b, similarity, score }) => {
    const identity = { seed, parents: [a.id, b.id].sort() };
    return {
      hypothesisId: `serendipity_${digest(identity).slice(0, 24)}`,
      status: 'SYNTHETIC_HYPOTHESIS',
      parentOpportunityIds: identity.parents,
      parentCategories: [a.category, b.category],
      noveltyDistance: Number((1 - similarity).toFixed(4)),
      serendipityScore: score,
      mechanismSketch: `Combine ${a.mechanism} WITH ${b.mechanism}`,
      buyerHypothesis: [a.buyer, b.buyer].filter(Boolean).join(' + ') || 'UNKNOWN',
      monetizationHypothesis: [a.monetization, b.monetization].filter(Boolean).join(' + ') || 'UNKNOWN',
      distributionHypothesis: [a.distribution, b.distribution].filter(Boolean).join(' + ') || 'UNKNOWN',
      recurrenceHypothesis: [a.recurrence, b.recurrence].filter(Boolean).join(' + ') || 'UNKNOWN',
      inheritedRisks: [a.risk, b.risk].filter(Boolean),
      evidenceStatus: 'UNPROVEN_RECOMBINATION',
      killConditions: ['no independent buyer evidence', 'mechanisms conflict', 'unsafe or prohibited path', 'bounded experiment produces no credible demand signal']
    };
  });
  return envelope({ ok: true, status: 'ARTIFICIAL_SERENDIPITY_POPULATION_READY', populationSize: population.length, pairCount: selected.length, hypotheses: selected, claimBoundary: 'GENERATED_HYPOTHESES_ARE_NOT_BUSINESSES_DEMAND_OR_REVENUE' });
}

export function buildImpossibleTaskLedger({ tasks = [], changedConditions = [] } = {}) {
  if (!Array.isArray(tasks) || tasks.length > 10000) return envelope({ ok: false, status: 'IMPOSSIBLE_TASK_LEDGER_INVALID', reasonCodes: ['bounded-task-array-required'] });
  const conditions = list(changedConditions, 4096, 1000);
  if (!conditions) return envelope({ ok: false, status: 'IMPOSSIBLE_TASK_LEDGER_INVALID', reasonCodes: ['bounded-changed-conditions-required'] });
  const conditionSet = new Set(conditions.map(item => item.toLowerCase()));
  const ledger = [];
  for (const raw of tasks) {
    const id = text(raw?.id, 240)?.toLowerCase();
    const objective = text(raw?.objective, 2000);
    const blockers = list(raw?.blockers || [], 128, 1000);
    const unlockConditions = list(raw?.unlockConditions || [], 128, 1000);
    if (!id || !objective || !blockers || !unlockConditions) continue;
    const matchedUnlocks = unlockConditions.filter(condition => conditionSet.has(condition.toLowerCase()));
    ledger.push({ id, objective, blockers, unlockConditions, matchedUnlocks, status: matchedUnlocks.length ? 'REVALIDATE_NOW' : 'DORMANT', promotionAuthority: 'NONE' });
  }
  return envelope({ ok: true, status: 'IMPOSSIBLE_TASK_LEDGER_READY', ledger, revalidationQueue: ledger.filter(item => item.status === 'REVALIDATE_NOW'), claimBoundary: 'UNLOCK_MATCH_REOPENS_RESEARCH_ONLY' });
}

function hypothesisHeuristics(hypothesis) {
  const blob = JSON.stringify(hypothesis).toLowerCase();
  const novelty = boundedNumber((hypothesis?.noveltyDistance ?? 0.5) * 100) ?? 50;
  const automation = lexicalSignalScore(blob, ['automat', 'agent', 'monitor', 'api', 'workflow', 'self'], ['manual', 'onsite']);
  const recurrence = lexicalSignalScore(blob, ['recurring', 'subscription', 'monitor', 'monthly', 'retention', 'renew'], ['one-time', 'one time']);
  const reversibility = lexicalSignalScore(blob, ['audit', 'research', 'monitor', 'diagnostic', 'sandbox'], ['deploy', 'capital intensive', 'regulated', 'hardware']);
  const evidence = lexicalSignalScore(blob, ['evidence', 'verified', 'corroborat', 'receipt'], ['unproven', 'hypothesis', 'unknown']);
  const risk = 100 - lexicalSignalScore(blob, ['safe', 'bounded', 'public', 'reversible'], ['regulated', 'privacy', 'payment', 'credential', 'physical', 'unsafe']);
  return { novelty, automation, recurrence, reversibility, evidence, risk };
}

export function buildFutureOptionPortfolio({ hypotheses = [], maxOptions = 12, curiosityBudget = 0.15 } = {}) {
  if (!Array.isArray(hypotheses) || hypotheses.length > 5000) return envelope({ ok: false, status: 'FUTURE_OPTION_PORTFOLIO_INVALID', reasonCodes: ['bounded-hypothesis-array-required'] });
  const cap = Number(maxOptions);
  const budget = Number(curiosityBudget);
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 200 || !Number.isFinite(budget) || budget < 0 || budget > 1) return envelope({ ok: false, status: 'FUTURE_OPTION_PORTFOLIO_INVALID', reasonCodes: ['valid-cap-and-curiosity-budget-required'] });
  const ranked = hypotheses.map(hypothesis => {
    const h = hypothesisHeuristics(hypothesis);
    const exploitation = h.automation * 0.24 + h.recurrence * 0.22 + h.reversibility * 0.20 + h.evidence * 0.20 + (100 - h.risk) * 0.14;
    const exploration = h.novelty * 0.55 + h.reversibility * 0.20 + h.automation * 0.15 + (100 - h.risk) * 0.10;
    const score = exploitation * (1 - budget) + exploration * budget;
    return { hypothesisId: hypothesis.hypothesisId || hypothesis.candidateId || digest(hypothesis).slice(0, 24), score: Number(score.toFixed(2)), exploitationScore: Number(exploitation.toFixed(2)), explorationScore: Number(exploration.toFixed(2)), dimensions: h, hypothesis };
  }).sort((a, b) => b.score - a.score || a.hypothesisId.localeCompare(b.hypothesisId));
  return envelope({ ok: true, status: 'FUTURE_OPTION_PORTFOLIO_READY', curiosityBudget: budget, options: ranked.slice(0, cap), rejectedForNow: ranked.slice(cap).map(item => ({ hypothesisId: item.hypothesisId, score: item.score })), claimBoundary: 'PORTFOLIO_RANKING_ALLOCATES_RESEARCH_ATTENTION_NOT_SPEND_OR_MARKET_AUTHORITY' });
}

export function buildAntiUberBondChallenges({ assumptions = [], changedPrimitives = [] } = {}) {
  const as = list(assumptions, 1024, 1600);
  const primitives = list(changedPrimitives, 1024, 1000);
  if (!as || !primitives) return envelope({ ok: false, status: 'ANTI_UBERBOND_INVALID', reasonCodes: ['bounded-assumptions-and-primitives-required'] });
  const challenges = [];
  for (const assumption of as) {
    for (const primitive of primitives.length ? primitives : ['no-new-primitive']) {
      const id = `anti_${digest({ assumption, primitive }).slice(0, 20)}`;
      challenges.push({
        challengeId: id,
        assumption,
        changedPrimitive: primitive,
        counterTheory: `Assume the opposite of: ${assumption}. Test whether ${primitive} makes the current architecture economically or operationally obsolete.`,
        falsificationQuestions: [
          'What measurable observation would prove the current assumption false?',
          'What smaller provider-neutral architecture would dominate if the assumption fails?',
          'Which current moat disappears under this primitive?',
          'What evidence would show the challenger is actually worse?'
        ],
        authority: 'RESEARCH_AND_FALSIFICATION_ONLY'
      });
    }
  }
  return envelope({ ok: true, status: 'ANTI_UBERBOND_CHALLENGES_READY', challenges: challenges.slice(0, 5000), claimBoundary: 'CHALLENGES_DO_NOT_AUTHORIZE_REPLACEMENT' });
}

export function buildRedQueenEvaluatorTournament({ hypotheses = [] } = {}) {
  if (!Array.isArray(hypotheses) || hypotheses.length > 5000) return envelope({ ok: false, status: 'RED_QUEEN_INVALID', reasonCodes: ['bounded-hypothesis-array-required'] });
  const profiles = [
    { id: 'ECONOMIC', weights: { automation: 0.25, recurrence: 0.30, reversibility: 0.10, evidence: 0.25, novelty: 0.10 } },
    { id: 'EVIDENCE', weights: { automation: 0.10, recurrence: 0.10, reversibility: 0.20, evidence: 0.50, novelty: 0.10 } },
    { id: 'FRONTIER', weights: { automation: 0.20, recurrence: 0.10, reversibility: 0.15, evidence: 0.10, novelty: 0.45 } },
    { id: 'FOUNDER_FREEDOM', weights: { automation: 0.35, recurrence: 0.20, reversibility: 0.30, evidence: 0.10, novelty: 0.05 } },
    { id: 'ADVERSARY', weights: { automation: 0.10, recurrence: 0.10, reversibility: 0.25, evidence: 0.40, novelty: 0.15 } }
  ];
  const ballots = profiles.map(profile => {
    const ranked = hypotheses.map(hypothesis => {
      const h = hypothesisHeuristics(hypothesis);
      const score = Object.entries(profile.weights).reduce((sum, [key, weight]) => sum + h[key] * weight, 0);
      return { hypothesisId: hypothesis.hypothesisId || hypothesis.candidateId || digest(hypothesis).slice(0, 24), score: Number(score.toFixed(2)) };
    }).sort((a, b) => b.score - a.score || a.hypothesisId.localeCompare(b.hypothesisId));
    return { evaluator: profile.id, ranked };
  });
  const wins = new Map();
  for (const ballot of ballots) if (ballot.ranked[0]) wins.set(ballot.ranked[0].hypothesisId, (wins.get(ballot.ranked[0].hypothesisId) || 0) + 1);
  const consensus = [...wins.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return envelope({ ok: true, status: 'RED_QUEEN_EVALUATOR_TOURNAMENT_READY', profiles: profiles.map(p => p.id), ballots, consensus: consensus.map(([hypothesisId, evaluatorWins]) => ({ hypothesisId, evaluatorWins })), disagreement: consensus.length > 1 || (consensus[0]?.[1] || 0) < profiles.length, claimBoundary: 'EVALUATOR_CONSENSUS_IS_INTERNAL_RANKING_NOT_EXTERNAL_PROOF' });
}

export function buildFounderFreedomDerivative({ founderMinutesBefore, founderMinutesAfter, reversibility = 50, optionality = 50, lockInRisk = 50, recurringLeverage = 50 } = {}) {
  const before = Number(founderMinutesBefore);
  const after = Number(founderMinutesAfter);
  const rev = boundedNumber(reversibility), opt = boundedNumber(optionality), lock = boundedNumber(lockInRisk), recurring = boundedNumber(recurringLeverage);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before < 0 || after < 0 || !rev || !opt || lock == null || !recurring) return envelope({ ok: false, status: 'FOUNDER_FREEDOM_DERIVATIVE_INVALID', reasonCodes: ['valid-minute-and-dimension-inputs-required'] });
  const minutesSaved = before - after;
  const timeSovereignty = before > 0 ? Math.max(-100, Math.min(100, (minutesSaved / before) * 100)) : 0;
  const score = Number((timeSovereignty * 0.45 + rev * 0.20 + opt * 0.15 + (100 - lock) * 0.10 + recurring * 0.10).toFixed(2));
  return envelope({ ok: true, status: 'FOUNDER_FREEDOM_DERIVATIVE_READY', minutesSaved, timeSovereignty: Number(timeSovereignty.toFixed(2)), score, dimensions: { reversibility: rev, optionality: opt, lockInRisk: lock, recurringLeverage: recurring }, claimBoundary: 'FREEDOM_SCORE_IS_DECISION_SUPPORT_NOT_GUARANTEED_LIFE_OUTCOME' });
}

export function buildGenesisEvolutionCycle({
  signal,
  opportunities = THREAD_OPPORTUNITY_UNIVERSE,
  knownConcepts = [],
  priorMetrics = {},
  currentMetrics = {},
  impossibleTasks = [],
  assumptions = [],
  maxSerendipityPairs = 24,
  curiosityBudget = 0.15
} = {}) {
  const summary = text(signal?.summary, 6000);
  const primitives = list(signal?.changedPrimitives || signal?.claims || [], 256, 1000);
  const domains = list(signal?.domains || [], 256, 300);
  if (!summary || !primitives || primitives.length === 0 || !domains) return envelope({ ok: false, status: 'GENESIS_EVOLUTION_CYCLE_INVALID', reasonCodes: ['signal-summary-and-changed-primitives-required'] });
  const known = knownConcepts.length ? knownConcepts : normalizePopulation(opportunities)?.map(opportunityText) || [];
  const surprise = buildSurpriseScore({ signal: { summary, changedPrimitives: primitives }, knownConcepts: known });
  const discontinuity = detectWorldDiscontinuity({ priorMetrics, currentMetrics });
  const multiplication = scoreCapabilityMultiplication({ primitive: primitives.join(' | '), domains, opportunities });
  const serendipity = buildArtificialSerendipity({ opportunities, seed: `${summary}:${primitives.join('|')}`, maxPairs: maxSerendipityPairs });
  if (!surprise.ok || !discontinuity.ok || !multiplication.ok || !serendipity.ok) return envelope({ ok: false, status: 'GENESIS_EVOLUTION_CYCLE_PARTIAL', reasonCodes: ['subsystem-invalid'], surprise, discontinuity, multiplication, serendipity });
  const impossible = buildImpossibleTaskLedger({ tasks: impossibleTasks, changedConditions: primitives });
  const portfolio = buildFutureOptionPortfolio({ hypotheses: serendipity.hypotheses, maxOptions: Math.min(12, serendipity.hypotheses.length || 1), curiosityBudget });
  const antiUberBond = buildAntiUberBondChallenges({ assumptions, changedPrimitives: primitives });
  const redQueen = buildRedQueenEvaluatorTournament({ hypotheses: portfolio.options.map(option => option.hypothesis) });
  return envelope({
    ok: true,
    status: 'GENESIS_EVOLUTION_CYCLE_READY',
    version: GENESIS_EVOLUTION_ENGINE_VERSION,
    implementedIdeaIds: Object.keys(IMPLEMENTED_IDEAS).map(Number),
    surprise,
    discontinuity,
    multiplication,
    serendipity,
    impossible,
    portfolio,
    antiUberBond,
    redQueen,
    executionRule: 'GENERATE_MUTATE_RANK_FALSIFY_AND_ARCHIVE_INTERNALLY; EXISTING_AUTHORITY_AND_EXTERNAL_PROOF_GATES_CONTROL_REAL_EFFECTS'
  });
}

export function buildGenesisImplementationLedger({ canonicalMarkdown, sourcePaths = [], testPaths = [], runtimeReceiptPaths = [] } = {}) {
  const markdown = String(canonicalMarkdown || '');
  const registry = [...markdown.matchAll(/^(\d+)\.\s+(.+)$/gm)].map(match => ({ id: Number(match[1]), name: match[2].trim() }));
  const sources = new Set(sourcePaths || []), tests = new Set(testPaths || []), receipts = new Set(runtimeReceiptPaths || []);
  if (registry.length !== 275) return envelope({ ok: false, status: 'GENESIS_IMPLEMENTATION_LEDGER_INVALID', reasonCodes: ['canonical-275-registry-required'], observedCount: registry.length });
  const entries = registry.map(idea => {
    const expectedName = IMPLEMENTED_IDEAS[idea.id];
    const implemented = Boolean(expectedName && expectedName === idea.name);
    const sourceEvidence = implemented && sources.has('src/genesis-evolution-engine.mjs');
    const testEvidence = implemented && tests.has('tests/genesis-evolution-engine.test.mjs');
    const runtimeEvidence = implemented && receipts.has('artifacts/genesis-evolution-latest.json');
    const status = runtimeEvidence ? 'RUNTIME_RECEIPT_PRESENT' : testEvidence && sourceEvidence ? 'SOURCE_AND_TEST_PRESENT' : sourceEvidence ? 'SOURCE_PRESENT' : 'CANON_ONLY';
    return { id: idea.id, name: idea.name, status, sourceEvidence: sourceEvidence ? ['src/genesis-evolution-engine.mjs'] : [], testEvidence: testEvidence ? ['tests/genesis-evolution-engine.test.mjs'] : [], runtimeEvidence: runtimeEvidence ? ['artifacts/genesis-evolution-latest.json'] : [] };
  });
  const counts = entries.reduce((acc, entry) => { acc[entry.status] = (acc[entry.status] || 0) + 1; return acc; }, {});
  return envelope({ ok: true, status: 'GENESIS_IMPLEMENTATION_LEDGER_READY', ideaCount: entries.length, counts, entries, truthBoundary: 'FILE_PRESENCE_IS_NOT_TEST_PASS_OR_RUNTIME_SUCCESS; RUNTIME_RECEIPT_PRESENCE_IS_NOT_EXTERNAL_ECONOMIC_PROOF' });
}
