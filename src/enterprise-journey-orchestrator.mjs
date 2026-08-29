import crypto from 'node:crypto';

export const ENTERPRISE_JOURNEY_POLICY_VERSION = 'uberbond.enterprise-journey-orchestrator-1.0.0';
export const JOURNEY_NODE_TYPES = Object.freeze(['TRIGGER','CONDITION','DELAY','MESSAGE','WEBHOOK','EXPERIMENT','EXIT']);
export const JOURNEY_CHANNELS = Object.freeze(['EMAIL_TRANSACTIONAL','SMS','WHATSAPP','PUSH','SOCIAL_PUBLIC','SUPPORT_INBOX']);

function text(value, max = 240) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function slug(value, max = 120) {
  const out = text(value, max);
  return out ? out.toLowerCase().replace(/[^a-z0-9._:-]+/g,'-').replace(/^-+|-+$/g,'') || null : null;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(reasonCodes, extra={}) {
  return { ok:false, policyVersion:ENTERPRISE_JOURNEY_POLICY_VERSION, status:'REVIEW_REQUIRED', reasonCodes:[...new Set(reasonCodes)], businessEffectAuthority:'NONE', ...extra };
}
function normalizeNode(input={}) {
  const id = slug(input.id);
  const type = String(input.type ?? '').trim().toUpperCase();
  const reasons=[];
  if (!id) reasons.push('journey-node-id-required');
  if (!JOURNEY_NODE_TYPES.includes(type)) reasons.push('invalid-journey-node-type');
  const node = { id, type };
  if (type === 'TRIGGER') {
    node.triggerRef = text(input.triggerRef,240);
    if (!node.triggerRef) reasons.push('trigger-ref-required');
  }
  if (type === 'CONDITION') {
    node.conditionRef = text(input.conditionRef,240);
    if (!node.conditionRef) reasons.push('condition-ref-required');
  }
  if (type === 'DELAY') {
    node.delaySeconds = Number.isSafeInteger(input.delaySeconds) && input.delaySeconds >= 0 && input.delaySeconds <= 31_536_000 ? input.delaySeconds : null;
    if (node.delaySeconds == null) reasons.push('bounded-delay-required');
  }
  if (type === 'MESSAGE') {
    node.channel = String(input.channel ?? '').trim().toUpperCase();
    node.contentRef = text(input.contentRef,240);
    node.communicationPolicyRef = text(input.communicationPolicyRef,240);
    if (!JOURNEY_CHANNELS.includes(node.channel)) reasons.push('invalid-message-channel');
    if (!node.contentRef) reasons.push('content-ref-required');
    if (!node.communicationPolicyRef) reasons.push('communication-policy-ref-required');
  }
  if (type === 'WEBHOOK') {
    node.webhookConfigRef = text(input.webhookConfigRef,240);
    if (!node.webhookConfigRef) reasons.push('webhook-config-ref-required');
    if (input.url || input.headers || input.authorization || input.token || input.secret) reasons.push('raw-webhook-credential-or-url-prohibited');
  }
  if (type === 'EXPERIMENT') {
    node.experimentRef = text(input.experimentRef,240);
    if (!node.experimentRef) reasons.push('experiment-ref-required');
  }
  return reasons.length ? {ok:false,reasons,node} : {ok:true,node};
}

export function compileEnterpriseJourney(input={}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(['journey-object-required']);
  const journeyKey = slug(input.journeyKey,180);
  const audienceRef = text(input.audienceRef,240);
  const goalRef = text(input.goalRef,240);
  const policyRef = text(input.policyRef,240);
  const maxEntriesPerProfile = Number.isSafeInteger(input.maxEntriesPerProfile) && input.maxEntriesPerProfile > 0 && input.maxEntriesPerProfile <= 100 ? input.maxEntriesPerProfile : null;
  const maxMessagesPerProfilePerDay = Number.isSafeInteger(input.maxMessagesPerProfilePerDay) && input.maxMessagesPerProfilePerDay > 0 && input.maxMessagesPerProfilePerDay <= 100 ? input.maxMessagesPerProfilePerDay : null;
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const rawEdges = Array.isArray(input.edges) ? input.edges : [];
  const reasons=[];
  if (!journeyKey) reasons.push('journey-key-required');
  if (!audienceRef) reasons.push('audience-ref-required');
  if (!goalRef) reasons.push('goal-ref-required');
  if (!policyRef) reasons.push('policy-ref-required');
  if (!maxEntriesPerProfile) reasons.push('bounded-entry-frequency-required');
  if (!maxMessagesPerProfilePerDay) reasons.push('bounded-message-frequency-required');
  if (rawNodes.length < 2 || rawNodes.length > 200) reasons.push('journey-node-count-out-of-bounds');
  const nodes=[];
  const ids=new Set();
  for (const item of rawNodes) {
    const normalized=normalizeNode(item);
    if (!normalized.ok) reasons.push(...normalized.reasons);
    if (normalized.node.id && ids.has(normalized.node.id)) reasons.push('duplicate-journey-node-id');
    if (normalized.node.id) ids.add(normalized.node.id);
    nodes.push(normalized.node);
  }
  if (nodes.filter(n=>n.type==='TRIGGER').length !== 1) reasons.push('exactly-one-trigger-required');
  if (!nodes.some(n=>n.type==='EXIT')) reasons.push('exit-node-required');
  const edges=[];
  for (const edge of rawEdges) {
    const from=slug(edge?.from); const to=slug(edge?.to); const when=text(edge?.when || 'ALWAYS',120);
    if (!from || !to || !ids.has(from) || !ids.has(to)) { reasons.push('journey-edge-node-reference-invalid'); continue; }
    edges.push({from,to,when});
  }
  const adjacency=new Map(nodes.map(n=>[n.id,[]]));
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);
  const trigger=nodes.find(n=>n.type==='TRIGGER');
  const visiting=new Set(); const visited=new Set();
  function dfs(id) {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const next of adjacency.get(id)||[]) if (!dfs(next)) return false;
    visiting.delete(id); visited.add(id); return true;
  }
  if (trigger && !dfs(trigger.id)) reasons.push('unbounded-journey-cycle-prohibited');
  if (trigger && visited.size !== nodes.length) reasons.push('unreachable-journey-node');
  if (reasons.length) return fail(reasons,{candidate:{journeyKey,audienceRef,goalRef,nodes,edges}});
  const journey={
    schemaVersion:'uberbond-enterprise-journey-1.0.0', journeyKey, audienceRef, goalRef, policyRef,
    maxEntriesPerProfile, maxMessagesPerProfilePerDay, nodes, edges,
    schedulerBoundary:'CANONICAL_DURABLE_SCHEDULER',
    communicationBoundary:'CANONICAL_OMNICHANNEL_COMMUNICATION_CONTRACT',
    executionAuthority:'NONE_UNTIL_EACH_DUE_ACTION_PASSES_FRESH_POLICY_AUTHORITY_AND_SUPPRESSION',
    durablePayloadClass:'REFERENCE_ONLY_NO_RAW_DESTINATION_CONTENT_OR_PROVIDER_SECRETS'
  };
  journey.journeyId=`journey_${digest(journey).slice(0,32)}`;
  return {ok:true,policyVersion:ENTERPRISE_JOURNEY_POLICY_VERSION,status:'JOURNEY_COMPILED',journey,businessEffectAuthority:'NONE'};
}
