import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const AUTONOMOUS_FRONTIER_INTELLIGENCE_VERSION = 'uberbond.autonomous-frontier-intelligence-1.0.0';

export const FRONTIER_THINKER_ROLES = Object.freeze([
  'EXPLORER',
  'SKEPTIC',
  'ECONOMIST',
  'ENGINEER',
  'CUSTOMER',
  'DISTRIBUTION_STRATEGIST',
  'SECURITY_ADVERSARY',
  'OPEN_SOURCE_HUNTER',
  'COUNTERSTRATEGIST',
  'SYNTHESIZER'
]);

function text(value, max = 4000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function list(value, max = 128, itemMax = 1600) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
  }
  return out;
}
function finite(value, min = 0, max = 100) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function iso(value) {
  const normalized = text(value, 80);
  const date = normalized ? new Date(normalized) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function envelope(extra = {}) {
  return {
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

export function normalizeFrontierSignal(input = {}) {
  const id = text(input.id, 240)?.toLowerCase();
  const source = text(input.source, 1200);
  const observedAt = iso(input.observedAt);
  const summary = text(input.summary, 4000);
  const evidenceRefs = list(input.evidenceRefs || [], 128, 2000);
  const domains = list(input.domains || [], 64, 300);
  const claimedChange = text(input.claimedChange, 3000);
  const confidence = finite(input.confidence ?? 50, 0, 100);
  const reasonCodes = [];
  if (!id) reasonCodes.push('signal-id-required');
  if (!source) reasonCodes.push('signal-source-required');
  if (!observedAt) reasonCodes.push('signal-observed-at-required');
  if (!summary) reasonCodes.push('signal-summary-required');
  if (!evidenceRefs || evidenceRefs.length === 0) reasonCodes.push('signal-evidence-required');
  if (!domains) reasonCodes.push('signal-domains-required');
  if (!claimedChange) reasonCodes.push('claimed-change-required');
  if (confidence == null) reasonCodes.push('bounded-confidence-required');
  if (reasonCodes.length) return envelope({ ok: false, status: 'FRONTIER_SIGNAL_INVALID', reasonCodes });
  return envelope({
    ok: true,
    status: 'FRONTIER_SIGNAL_NORMALIZED',
    signal: { id, source, observedAt, summary, evidenceRefs, domains, claimedChange, confidence }
  });
}

export function scoreFrontierSignal(input = {}) {
  const novelty = finite(input.novelty, 0, 100);
  const enablingPower = finite(input.enablingPower, 0, 100);
  const strategicAdjacency = finite(input.strategicAdjacency, 0, 100);
  const economicUpside = finite(input.economicUpside, 0, 100);
  const evidenceQuality = finite(input.evidenceQuality, 0, 100);
  const founderMinutesSaved = finite(input.founderMinutesSaved, 0, 100);
  const risk = finite(input.risk, 0, 100);
  const uncertainty = finite(input.uncertainty, 0, 100);
  if ([novelty, enablingPower, strategicAdjacency, economicUpside, evidenceQuality, founderMinutesSaved, risk, uncertainty].some(value => value == null)) {
    return { ok: false, reasonCodes: ['bounded-frontier-score-inputs-required'] };
  }
  const upside = novelty * 0.15 + enablingPower * 0.2 + strategicAdjacency * 0.15 + economicUpside * 0.2 + evidenceQuality * 0.15 + founderMinutesSaved * 0.15;
  const penalty = risk * 0.12 + uncertainty * 0.08;
  return { ok: true, score: Math.max(0, Math.min(100, Number((upside - penalty).toFixed(2)))) };
}

export function buildIdeaAtomizationPacket({ signal, knownCapabilities = [], knownOpportunityMechanisms = [] } = {}) {
  const normalized = normalizeFrontierSignal(signal);
  if (!normalized.ok) return normalized;
  const capabilities = list(knownCapabilities, 1024, 500);
  const mechanisms = list(knownOpportunityMechanisms, 1024, 800);
  if (!capabilities || !mechanisms) return envelope({ ok: false, status: 'ATOMIZATION_PACKET_INVALID', reasonCodes: ['bounded-known-universe-required'] });
  return envelope({
    ok: true,
    status: 'ATOMIZATION_PACKET_READY',
    packet: {
      signal: normalized.signal,
      knownCapabilities: capabilities,
      knownOpportunityMechanisms: mechanisms,
      requiredOutputs: [
        'OBSERVABLE_FEATURES',
        'CAPABILITY_ATOMS',
        'DEPENDENCIES',
        'PERMISSIONS',
        'ECONOMIC_MECHANISMS',
        'POTENTIAL_SUBSTITUTES',
        'NEW_COMBINATIONS',
        'UNKNOWN_ASSUMPTIONS',
        'EVIDENCE_GAPS'
      ],
      laws: [
        'COPY_NO_PROPRIETARY_CODE_OR_PRIVATE_DATA',
        'PRESERVE_OBSERVABLE_FUNCTIONALITY',
        'UNKNOWN_REMAINS_UNKNOWN',
        'CAPABILITY_NEVER_CREATES_AUTHORITY'
      ]
    }
  });
}

export function buildFrontierThinkerSwarm({ missionId, objective, roles = FRONTIER_THINKER_ROLES } = {}) {
  const id = text(missionId, 220)?.toLowerCase();
  const goal = text(objective, 3000);
  const selectedRoles = list(roles, FRONTIER_THINKER_ROLES.length, 80)?.map(role => role.toUpperCase());
  if (!id || !goal || !selectedRoles || selectedRoles.length === 0 || selectedRoles.some(role => !FRONTIER_THINKER_ROLES.includes(role))) {
    return envelope({ ok: false, status: 'THINKER_SWARM_INVALID', reasonCodes: ['valid-mission-objective-and-roles-required'] });
  }
  return envelope({
    ok: true,
    status: 'THINKER_SWARM_PLAN_READY',
    missionId: id,
    lanes: selectedRoles.map(role => ({
      id: `${id}:${role.toLowerCase()}`,
      role,
      objective: goal,
      executionAuthority: 'NONE',
      requiredReceipt: 'EVIDENCE_BOUND_HYPOTHESIS_OR_CRITIQUE'
    })),
    synthesisRule: 'SYNTHESIZER_MUST_PRESERVE_DISAGREEMENT_AND_UNCERTAINTY; CONSENSUS_IS_NOT_PROOF'
  });
}

export function buildCombinationSearchSpace({ capabilityAtoms = [], markets = [], channels = [], technologies = [], maxCandidates = 5000 } = {}) {
  const caps = list(capabilityAtoms, 512, 300);
  const marketList = list(markets, 512, 500);
  const channelList = list(channels, 256, 300);
  const techList = list(technologies, 512, 500);
  const cap = Number(maxCandidates);
  if (!caps || !marketList || !channelList || !techList || !Number.isSafeInteger(cap) || cap < 1 || cap > 100_000) {
    return envelope({ ok: false, status: 'COMBINATION_SEARCH_INVALID', reasonCodes: ['bounded-combination-inputs-required'] });
  }
  const candidates = [];
  outer: for (const capability of caps) {
    for (const market of marketList) {
      for (const channel of channelList.length ? channelList : ['UNSPECIFIED']) {
        for (const technology of techList.length ? techList : ['UNSPECIFIED']) {
          candidates.push({ capability, market, channel, technology });
          if (candidates.length >= cap) break outer;
        }
      }
    }
  }
  return envelope({
    ok: true,
    status: 'COMBINATION_SEARCH_SPACE_READY',
    totalMaterialized: candidates.length,
    truncated: candidates.length >= cap,
    candidates,
    claimBoundary: 'COMBINATION_IS_HYPOTHESIS_NOT_OPPORTUNITY_PROOF'
  });
}

export function judgeFrontierOutcome({ hypothesisId, expected, observations = [] } = {}) {
  const id = text(hypothesisId, 240)?.toLowerCase();
  const expectation = text(expected, 3000);
  if (!id || !expectation || !Array.isArray(observations) || observations.length === 0 || observations.length > 512) {
    return envelope({ ok: false, status: 'FRONTIER_OUTCOME_INVALID', reasonCodes: ['hypothesis-expectation-and-observations-required'] });
  }
  const normalized = observations.map(item => ({
    metric: text(item?.metric, 300),
    direction: text(item?.direction, 40)?.toUpperCase(),
    evidenceRef: text(item?.evidenceRef, 2000),
    observedAt: iso(item?.observedAt),
    confidence: finite(item?.confidence ?? 50, 0, 100)
  })).filter(item => item.metric && ['IMPROVED', 'WORSENED', 'UNCHANGED', 'UNKNOWN'].includes(item.direction) && item.evidenceRef && item.observedAt && item.confidence != null);
  if (normalized.length !== observations.length) return envelope({ ok: false, status: 'FRONTIER_OUTCOME_INVALID', reasonCodes: ['complete-observation-evidence-required'] });
  const improved = normalized.filter(item => item.direction === 'IMPROVED').length;
  const worsened = normalized.filter(item => item.direction === 'WORSENED').length;
  const unknown = normalized.filter(item => item.direction === 'UNKNOWN').length;
  const verdict = unknown > 0 ? 'INCONCLUSIVE' : improved > worsened ? 'SUPPORTED' : worsened > improved ? 'REFUTED' : 'MIXED';
  return envelope({
    ok: true,
    status: 'FRONTIER_OUTCOME_JUDGED',
    hypothesisId: id,
    expected: expectation,
    verdict,
    observations: normalized,
    promotionAuthority: 'NONE',
    learningRule: verdict === 'SUPPORTED'
      ? 'MAY_PROPOSE_PROMOTION_OR_FURTHER_CANARY; MAY_NOT_SELF_PROMOTE'
      : 'REVISE_OR_REJECT_HYPOTHESIS_WITHOUT_ERASING_PRIOR_EVIDENCE'
  });
}
