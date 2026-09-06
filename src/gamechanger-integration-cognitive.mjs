import { compileUberBondCognitiveGraph } from './uberbond-cognitive-graph.mjs';
import { routeCognitiveEvent } from './uberbond-cognitive-bus.mjs';
import { eventFromGamechangerIntegrationQueue } from './uberbond-cognitive-adapters.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GAMECHANGER_INTEGRATION_COGNITIVE_VERSION = 'uberbond.gamechanger-integration-cognitive-1.0.0';
const clone = value => structuredClone(value);
const zeroEffects = () => clone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes, extra = {}) {
  return { ok:false, status:'GAMECHANGER_INTEGRATION_COGNITIVE_REFUSED', reasonCodes:[...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra };
}

export function augmentCognitiveReceiptWithGamechangerIntegration({ receipt, integrationQueue, integrationRef = 'artifact:gamechanger-integration-queue-latest' } = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return fail(['cognitive-receipt-required']);
  if (!Array.isArray(receipt.events) || !Array.isArray(receipt.routes) || !receipt.activationSummary || typeof receipt.activationSummary !== 'object') return fail(['cognitive-receipt-shape-invalid']);
  if (!integrationQueue || typeof integrationQueue !== 'object' || Array.isArray(integrationQueue)) return fail(['integration-queue-required']);
  const compiledEvent = eventFromGamechangerIntegrationQueue(integrationQueue, { ref:integrationRef });
  if (!compiledEvent?.ok) return fail(['integration-queue-cognitive-event-invalid'], { compiledEvent });
  const existingEventIds = new Set(receipt.events.map(event => event?.eventId).filter(Boolean));
  if (existingEventIds.has(compiledEvent.eventId)) {
    return { ok:true, status:'GAMECHANGER_INTEGRATION_COGNITIVE_ALREADY_PRESENT', receipt:clone(receipt), eventId:compiledEvent.eventId, businessEffectAuthority:'NONE', externalEffectLedger:zeroEffects() };
  }
  const graph = compileUberBondCognitiveGraph();
  const route = routeCognitiveEvent({ graph, compiledEvent });
  if (!route.ok) return fail(route.reasonCodes || ['integration-queue-route-failed']);
  const output = clone(receipt);
  output.events.push(compiledEvent);
  output.routes.push(route);
  const targetCounts = { ...(output.activationSummary.targetCounts || {}) };
  for (const activation of route.activations || []) targetCounts[activation.targetNodeId] = (targetCounts[activation.targetNodeId] || 0) + 1;
  output.activationSummary = {
    ...output.activationSummary,
    eventCount:output.events.length,
    activationCount:Number(output.activationSummary.activationCount || 0) + Number(route.activationCount || 0),
    targetCounts
  };
  const queue = integrationQueue.queue && typeof integrationQueue.queue === 'object' ? integrationQueue.queue : integrationQueue;
  output.sources = { ...(output.sources || {}), gamechangerIntegration:true };
  output.gamechangerIntegration = {
    schemaVersion:queue.schemaVersion || null,
    generatedAt:queue.generatedAt || null,
    queueCount:Array.isArray(queue.entries) ? queue.entries.length : 0,
    engineeringEligibleCount:Array.isArray(queue.entries) ? queue.entries.filter(entry => entry?.engineeringEligible === true).length : 0,
    primaryEvidenceRebindingCount:Array.isArray(queue.entries) ? queue.entries.filter(entry => entry?.queueState === 'PRIMARY_EVIDENCE_REBINDING_REQUIRED').length : 0,
    eventId:compiledEvent.eventId,
    routedActivationCount:route.activationCount,
    promotionAuthority:'NONE',
    executableAuthority:'NONE',
    commercialTruthAuthority:'NONE'
  };
  output.truthBoundary = `${String(output.truthBoundary || '').trim()} GAMECHANGER INTEGRATION QUEUE ENTRIES ARE DURABLE RESEARCH/ATOMIZATION/EXPERIMENT PROPOSALS ONLY; THEY DO NOT BECOME IMPLEMENTATION PROOF, ECONOMIC PROOF, ACTIVE CAPABILITIES, OR EXTERNAL-EFFECT AUTHORITY BY ENTERING THE COGNITIVE GRAPH.`.trim();
  output.businessEffectAuthority = 'NONE';
  output.externalEffectAuthority = 'NONE';
  return { ok:true, status:'GAMECHANGER_INTEGRATION_COGNITIVE_AUGMENTED', receipt:output, eventId:compiledEvent.eventId, activationCount:route.activationCount, targetNodeIds:(route.activations || []).map(x => x.targetNodeId), businessEffectAuthority:'NONE', externalEffectLedger:zeroEffects() };
}
