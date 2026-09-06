import { compileCognitiveEvent } from './uberbond-cognitive-bus.mjs';

export const EVENT_HORIZON_COGNITIVE_ADAPTER_VERSION = 'event-horizon-cognitive-adapter-1.0.0';

function text(value, max = 2000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function integer(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

export function eventFromEventHorizonDoctor(result, { ref = 'artifact:event-horizon-doctor-latest' } = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const ok = result.ok === true;
  const health = text(result.health, 160) || (ok ? 'EVENT_HORIZON_HEALTHY' : 'EVENT_HORIZON_INVALID');
  const champion = result.champion && typeof result.champion === 'object' ? result.champion : null;
  const challenger = result.strongestChallenger && typeof result.strongestChallenger === 'object' ? result.strongestChallenger : null;
  const commercialTruth = result.commercialTruth && typeof result.commercialTruth === 'object' ? result.commercialTruth : {};
  const summary = ok
    ? `Event Horizon ${health}: ${integer(result.candidateCount)} tournament candidates; champion ${text(champion?.id, 200) || 'unknown'} score ${integer(champion?.decisionScore)} in state ${text(champion?.state, 160) || 'unknown'}; strongest challenger ${text(challenger?.id, 200) || 'unknown'} score ${integer(challenger?.decisionScore)}; active experiments ${integer(result.activeExperimentCount)}. Commercial truth remains customers=${integer(commercialTruth.realCustomers)}, clearedRevenueUsd=${integer(commercialTruth.clearedRevenueUsd)}, acceptedDeliveries=${integer(commercialTruth.acceptedDeliveries)}, retainedCustomers=${integer(commercialTruth.retainedCustomers)}. Allocation scores are decision indices, not demand or revenue proof.`
    : `Event Horizon ${health} with ${Array.isArray(result.failures) ? result.failures.length : 0} validation failures. Treat allocation as blocked and route the contradiction for repair rather than selecting an experiment from invalid evidence.`;

  return compileCognitiveEvent({
    kind: ok ? 'OPPORTUNITY_CANDIDATE' : 'CONTRADICTION',
    sourceNodeId: 'event-horizon',
    subjectType: 'ECONOMIC_ALLOCATION',
    subjectId: ok ? `event-horizon:${text(champion?.id, 200) || 'champion'}` : 'event-horizon:invalid',
    summary,
    evidenceRefs: [text(ref, 1500) || 'artifact:event-horizon-doctor-latest'],
    truthClass: ok ? 'VERIFIED_CURRENT' : 'RESEARCH_ASSET'
  });
}
