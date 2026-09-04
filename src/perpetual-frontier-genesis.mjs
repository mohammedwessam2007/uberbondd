import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PERPETUAL_FRONTIER_GENESIS_VERSION = 'uberbond.perpetual-frontier-genesis-1.0.0';
export const GENESIS_EXPECTED_IDEA_COUNT = 275;

export const GENESIS_CORE_LANES = Object.freeze([
  'PROVENANCE_AND_CORROBORATION',
  'FUTURE_PRIMITIVE_EXTRACTION',
  'CAPABILITY_SHOCKWAVE',
  'OPPORTUNITY_SHOCKWAVE',
  'RESURRECTION_SCAN',
  'UNKNOWN_UNKNOWN_SEARCH',
  'ARTIFICIAL_IMAGINATION',
  'COUNTER_THEORY_AND_ADVERSARY',
  'EVALUATOR_CHALLENGE',
  'FRONTIER_LATENCY_ACCOUNTING',
  'BOUNDED_EXPERIMENT_PROPOSAL',
  'ECONOMIC_LEARNING_PROPOSAL'
]);

function envelope(extra = {}) {
  return {
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function cleanText(value, max = 4000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function cleanList(value, max = 512, itemMax = 1000) {
  if (!Array.isArray(value) || value.length > max) return null;
  const result = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = cleanText(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function parseIso(value) {
  const parsedText = cleanText(value, 100);
  if (!parsedText) return null;
  const date = new Date(parsedText);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function durationMs(start, end) {
  if (!start || !end) return null;
  return new Date(end).getTime() - new Date(start).getTime();
}

export function extractGenesisIdeaRegistry(markdown) {
  const source = typeof markdown === 'string' ? markdown : '';
  const ideas = [];
  const regex = /^(\d+)\.\s+(.+)$/gm;
  for (const match of source.matchAll(regex)) {
    ideas.push({ id: Number(match[1]), name: match[2].trim() });
  }
  return ideas;
}

export function validateGenesisIdeaRegistry(markdown, expectedCount = GENESIS_EXPECTED_IDEA_COUNT) {
  const expected = Number(expectedCount);
  if (!Number.isSafeInteger(expected) || expected < 1 || expected > 100_000) {
    return envelope({ ok: false, status: 'GENESIS_REGISTRY_INVALID', reasonCodes: ['valid-expected-count-required'] });
  }
  const ideas = extractGenesisIdeaRegistry(markdown);
  const reasonCodes = [];
  if (ideas.length !== expected) reasonCodes.push('idea-count-mismatch');
  const ids = new Set();
  const names = new Set();
  for (let index = 0; index < ideas.length; index += 1) {
    const idea = ideas[index];
    if (idea.id !== index + 1) reasonCodes.push(`non-sequential-id:${idea.id}`);
    if (ids.has(idea.id)) reasonCodes.push(`duplicate-id:${idea.id}`);
    if (names.has(idea.name.toLowerCase())) reasonCodes.push(`duplicate-name:${idea.name}`);
    ids.add(idea.id);
    names.add(idea.name.toLowerCase());
  }
  return envelope({
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? 'GENESIS_REGISTRY_HEALTHY' : 'GENESIS_REGISTRY_INVALID',
    expectedCount: expected,
    observedCount: ideas.length,
    ideas,
    reasonCodes
  });
}

export function buildFrontierShockwave({ signal, changedPrimitives = [], affectedDomains = [], opportunityIds = [] } = {}) {
  const signalId = cleanText(signal?.id, 240)?.toLowerCase();
  const summary = cleanText(signal?.summary, 4000);
  const evidenceRefs = cleanList(signal?.evidenceRefs || [], 128, 2000);
  const primitives = cleanList(changedPrimitives, 256, 500);
  const domains = cleanList(affectedDomains, 256, 500);
  const opportunities = cleanList(opportunityIds, 5000, 300);
  const reasonCodes = [];
  if (!signalId) reasonCodes.push('signal-id-required');
  if (!summary) reasonCodes.push('signal-summary-required');
  if (!evidenceRefs || evidenceRefs.length === 0) reasonCodes.push('signal-evidence-required');
  if (!primitives || primitives.length === 0) reasonCodes.push('changed-primitives-required');
  if (!domains) reasonCodes.push('bounded-domains-required');
  if (!opportunities) reasonCodes.push('bounded-opportunity-ids-required');
  if (reasonCodes.length) return envelope({ ok: false, status: 'FRONTIER_SHOCKWAVE_INVALID', reasonCodes });
  return envelope({
    ok: true,
    status: 'FRONTIER_SHOCKWAVE_PLAN_READY',
    signal: { id: signalId, summary, evidenceRefs },
    changedPrimitives: primitives,
    affectedDomains: domains,
    opportunityIds: opportunities,
    lanes: GENESIS_CORE_LANES.map(lane => ({ lane, authority: 'PROPOSE_ONLY' })),
    requiredQuestions: [
      'WHAT_BECAME_POSSIBLE_OR_CHEAPER_OR_MORE_RELIABLE',
      'WHICH_EXISTING_CAPABILITIES_ARE_SUPERSEDED_OR_STRENGTHENED',
      'WHICH_DORMANT_OPPORTUNITIES_HAVE_BLOCKERS_THAT_MAY_HAVE_CHANGED',
      'WHICH_NEW_MECHANISM_COMBINATIONS_BECOME_WORTH_RESEARCH',
      'WHICH_THEORIES_OR_ASSUMPTIONS_ARE_NOW_STALE',
      'WHAT_EVIDENCE_WOULD_FALSIFY_THE_CHANGE_OR_ITS_ECONOMIC_VALUE'
    ],
    claimBoundary: 'SHOCKWAVE_IS_INTERNAL_RESEARCH_AND_PLANNING_NOT_TECHNOLOGY_OR_MARKET_PROOF'
  });
}

export function buildResurrectionQueue({ dormantOpportunities = [], changedConditions = [] } = {}) {
  if (!Array.isArray(dormantOpportunities) || dormantOpportunities.length > 100_000) {
    return envelope({ ok: false, status: 'RESURRECTION_SCAN_INVALID', reasonCodes: ['bounded-dormant-opportunities-required'] });
  }
  const conditions = cleanList(changedConditions, 4096, 500);
  if (!conditions) return envelope({ ok: false, status: 'RESURRECTION_SCAN_INVALID', reasonCodes: ['bounded-changed-conditions-required'] });
  const normalizedConditions = new Set(conditions.map(item => item.toLowerCase()));
  const candidates = [];
  for (const raw of dormantOpportunities) {
    const id = cleanText(raw?.id, 300)?.toLowerCase();
    const blockers = cleanList(raw?.blockers || [], 128, 500);
    if (!id || !blockers || blockers.length === 0) continue;
    const matched = blockers.filter(blocker => normalizedConditions.has(blocker.toLowerCase()));
    if (matched.length === 0) continue;
    candidates.push({
      id,
      blockers,
      matchedChangedConditions: matched,
      status: 'REVIEW_CANDIDATE',
      requiredNextStep: 'REVALIDATE_BLOCKER_AND_RECOMPUTE_ECONOMICS_BEFORE_ANY_EXPERIMENT'
    });
  }
  return envelope({
    ok: true,
    status: 'RESURRECTION_SCAN_COMPLETE',
    candidates,
    claimBoundary: 'MATCHED_CONDITION_DOES_NOT_MEAN_OPPORTUNITY_IS_VIABLE_OR_RESURRECTED'
  });
}

export function buildUnknownUnknownAgenda({ anomalies = [], contradictions = [], blindSpots = [], disagreements = [], maxItems = 128 } = {}) {
  const cap = Number(maxItems);
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 1024) {
    return envelope({ ok: false, status: 'UNKNOWN_UNKNOWN_AGENDA_INVALID', reasonCodes: ['bounded-max-items-required'] });
  }
  const sources = [
    ['ANOMALY', anomalies],
    ['CONTRADICTION', contradictions],
    ['BLIND_SPOT', blindSpots],
    ['DISAGREEMENT', disagreements]
  ];
  const agenda = [];
  const seen = new Set();
  for (const [kind, values] of sources) {
    const cleaned = cleanList(values, 2048, 2000);
    if (!cleaned) return envelope({ ok: false, status: 'UNKNOWN_UNKNOWN_AGENDA_INVALID', reasonCodes: [`bounded-${kind.toLowerCase()}-list-required`] });
    for (const value of cleaned) {
      const key = `${kind}:${value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      agenda.push({
        kind,
        observation: value,
        questions: [
          'WHAT_MISSING_VARIABLE_OR_CONCEPT_COULD_EXPLAIN_THIS',
          'WHAT_ALTERNATIVE_THEORY_FITS_THE_EVIDENCE',
          'WHAT_OBSERVATION_WOULD_MOST_REDUCE_UNCERTAINTY',
          'WHAT_ECONOMIC_OPTION_COULD_THIS_CREATE_IF_TRUE'
        ]
      });
      if (agenda.length >= cap) break;
    }
    if (agenda.length >= cap) break;
  }
  return envelope({
    ok: true,
    status: 'UNKNOWN_UNKNOWN_AGENDA_READY',
    agenda,
    claimBoundary: 'AGENDA_ITEMS_ARE_RESEARCH_QUESTIONS_NOT_FACTS'
  });
}

export function buildFrontierLatencyReceipt(timestamps = {}) {
  const keys = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];
  const normalized = {};
  let lastTime = null;
  const reasonCodes = [];
  for (const key of keys) {
    const raw = timestamps[key];
    if (raw == null || raw === '') {
      normalized[key] = null;
      continue;
    }
    const parsed = parseIso(raw);
    if (!parsed) {
      reasonCodes.push(`invalid-${key}`);
      normalized[key] = null;
      continue;
    }
    if (lastTime && new Date(parsed).getTime() < new Date(lastTime).getTime()) reasonCodes.push(`non-monotonic-${key}`);
    normalized[key] = parsed;
    lastTime = parsed;
  }
  if (reasonCodes.length) return envelope({ ok: false, status: 'FRONTIER_LATENCY_INVALID', reasonCodes, timestamps: normalized });
  const metrics = {
    awarenessLagMs: durationMs(normalized.t0, normalized.t1),
    understandingLagMs: durationMs(normalized.t1, normalized.t2),
    normalizationLagMs: durationMs(normalized.t2, normalized.t3),
    benchmarkLagMs: durationMs(normalized.t3, normalized.t4),
    sandboxLagMs: durationMs(normalized.t4, normalized.t5),
    promotionLagMs: durationMs(normalized.t5, normalized.t6),
    economicCaptureLagMs: durationMs(normalized.t6, normalized.t7),
    totalDiscoveryToCaptureMs: durationMs(normalized.t0, normalized.t7)
  };
  return envelope({ ok: true, status: 'FRONTIER_LATENCY_RECEIPT_READY', timestamps: normalized, metrics });
}

export function buildGenesisCycle({
  signal,
  changedPrimitives = [],
  affectedDomains = [],
  opportunityIds = [],
  dormantOpportunities = [],
  changedConditions = [],
  anomalies = [],
  contradictions = [],
  blindSpots = [],
  disagreements = [],
  timestamps = {}
} = {}) {
  const shockwave = buildFrontierShockwave({ signal, changedPrimitives, affectedDomains, opportunityIds });
  if (!shockwave.ok) return shockwave;
  const resurrection = buildResurrectionQueue({ dormantOpportunities, changedConditions });
  if (!resurrection.ok) return resurrection;
  const unknownUnknowns = buildUnknownUnknownAgenda({ anomalies, contradictions, blindSpots, disagreements });
  if (!unknownUnknowns.ok) return unknownUnknowns;
  const latency = buildFrontierLatencyReceipt(timestamps);
  if (!latency.ok) return latency;
  return envelope({
    ok: true,
    status: 'GENESIS_CYCLE_PLAN_READY',
    version: PERPETUAL_FRONTIER_GENESIS_VERSION,
    shockwave,
    resurrection,
    unknownUnknowns,
    latency,
    nextInterfaces: [
      'GAMECHANGER_INTELLIGENCE_MESH',
      'AUTONOMOUS_FRONTIER_INTELLIGENCE',
      'CAPABILITY_GENOME',
      'OPPORTUNITY_FACTORY',
      'EVENT_HORIZON',
      'WALLBREAKER'
    ],
    executionRule: 'INTERNAL_RESEARCH_AND_PROPOSAL_ONLY_UNTIL_EXISTING_AUTHORITY_AND_EXTERNAL_PROOF_GATES_SEPARATELY_PASS'
  });
}
