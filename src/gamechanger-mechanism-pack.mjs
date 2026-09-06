import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileUberBondCognitiveGraph } from './uberbond-cognitive-graph.mjs';
import { compileCognitiveEvent, routeCognitiveEvent } from './uberbond-cognitive-bus.mjs';
import { GAMECHANGER_MECHANISM_PRIMITIVES } from './gamechanger-mechanism-runtime.mjs';

export const GAMECHANGER_MECHANISM_PACK_VERSION = 'uberbond.gamechanger-mechanism-pack-1.0.0';
const clone = value => structuredClone(value);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const zeroEffects = () => clone(ZERO_EXTERNAL_EFFECTS);
const clean = (value,max=4000) => String(value ?? '').trim().slice(0,max);
const fail = (reasonCodes, extra={}) => ({ok:false,status:'GAMECHANGER_MECHANISM_PACK_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra});

export const GAMECHANGER_MECHANISM_BINDINGS = Object.freeze({
  'capability-distillation-factory':{family:'CAPABILITY_ACQUISITION',eventKind:'CAPABILITY_CANDIDATE',targets:['capability-genome','context-spine','max-council','self-maintainer']},
  'authority-event-ledger':{family:'AUTHORITY_TRUTH',eventKind:'CAPABILITY_CANDIDATE',targets:['omnia','truth-evidence','max-council','self-maintainer']},
  'skill-policy-integrity':{family:'CAPABILITY_SECURITY',eventKind:'CAPABILITY_CANDIDATE',targets:['capability-genome','max-council','wallbreaker']},
  'untrusted-workspace-normalization':{family:'ENGINEERING_SECURITY',eventKind:'CAPABILITY_CANDIDATE',targets:['self-maintainer','max-council','wallbreaker']},
  'external-state-channel-firewall':{family:'EFFECT_SECURITY',eventKind:'CAPABILITY_CANDIDATE',targets:['omnia','truth-evidence','max-council','self-maintainer']},
  'non-decaying-loop-safety-state':{family:'AUTONOMY_SAFETY',eventKind:'CAPABILITY_CANDIDATE',targets:['context-spine','omnia','wallbreaker','max-council']},
  'lossless-trajectory-archive':{family:'MEMORY_CONTEXT',eventKind:'CAPABILITY_CANDIDATE',targets:['context-spine','world-brain','economic-memory']},
  'capability-discovery-runtime':{family:'CAPABILITY_ROUTING',eventKind:'CAPABILITY_CANDIDATE',targets:['capability-genome','avengers','context-spine']},
  'capability-gateway':{family:'CAPABILITY_GOVERNANCE',eventKind:'CAPABILITY_CANDIDATE',targets:['capability-genome','avengers','omnia','max-council']},
  'just-in-time-credential-broker':{family:'CREDENTIAL_GOVERNANCE',eventKind:'CAPABILITY_CANDIDATE',targets:['omnia','truth-evidence','self-maintainer','max-council']},
  'staged-oidc-release-gate':{family:'RELEASE_GOVERNANCE',eventKind:'CAPABILITY_CANDIDATE',targets:['self-maintainer','max-council','omnia','truth-evidence']},
  'browser-capability-router':{family:'BROWSER_ECONOMICS',eventKind:'CAPABILITY_CANDIDATE',targets:['world-sensing','gamechanger','avengers','event-horizon']},
  'active-media-perception':{family:'MEDIA_INTELLIGENCE',eventKind:'CAPABILITY_CANDIDATE',targets:['world-sensing','gamechanger','context-spine']},
  'speculative-agent-execution':{family:'AGENT_RUNTIME',eventKind:'CAPABILITY_CANDIDATE',targets:['agent-mesh','avengers','max-council','truth-evidence']},
  'purpose-declared-web-access':{family:'WEB_GOVERNANCE',eventKind:'CAPABILITY_CANDIDATE',targets:['world-sensing','gamechanger','omnia','truth-evidence']},
  'verified-continual-development-loop':{family:'ENGINEERING_AUTONOMY',eventKind:'CODE_CHANGE_CANDIDATE',targets:['self-maintainer','max-council','wallbreaker','genesis-scientist']},
  'external-commitment-state':{family:'COMMERCIAL_GOVERNANCE',eventKind:'MECHANISM_ATOM',targets:['omnia','event-horizon','distribution-os','fulfilment-qa']},
  'regulatory-incident-clock':{family:'REGULATORY_GOVERNANCE',eventKind:'BLOCKER',targets:['omnia','truth-evidence','wallbreaker','max-council']},
  'portable-purchase-intent-state':{family:'PAYMENT_AUTHORITY',eventKind:'MECHANISM_ATOM',targets:['payment-reconciliation','omnia','event-horizon','truth-evidence']},
  'verifiable-outcome-billing':{family:'PRICING_BILLING',eventKind:'MECHANISM_ATOM',targets:['payment-reconciliation','fulfilment-qa','retention-learning','event-horizon']},
  'exhaustive-reconciliation-engine':{family:'RECONCILIATION',eventKind:'CAPABILITY_CANDIDATE',targets:['payment-reconciliation','fulfilment-qa','truth-evidence','economic-memory']},
  'domain-agent-contract':{family:'VERTICAL_PRODUCTIZATION',eventKind:'MECHANISM_ATOM',targets:['business-genome','opportunity-factory','capability-genome','fulfilment-qa']},
  'customer-owned-safety-state':{family:'PRIVACY_SAFETY',eventKind:'CAPABILITY_CANDIDATE',targets:['context-spine','truth-evidence','omnia','world-brain']},
  'model-capability-risk-class':{family:'MODEL_GOVERNANCE',eventKind:'MODEL_CANDIDATE',targets:['open-model-universe','avengers','max-council','omnia']},
  'escalation-economics-policy':{family:'COMPUTE_ECONOMICS',eventKind:'ECONOMIC_LEARNING',targets:['event-horizon','avengers','max-council','economic-memory']}
});

function validateSeed(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const id=clean(raw.id,200),title=clean(raw.title,1000),mechanism=clean(raw.mechanism,4000),smallestExperiment=clean(raw.smallestExperiment,4000);
  if(!id||!title||!mechanism||!smallestExperiment)return null;
  return {id,title,mechanism,smallestExperiment,attentionState:clean(raw.attentionState,80).toUpperCase()||'RESEARCH',evidenceState:clean(raw.evidenceState,120).toUpperCase()||'UNKNOWN',keywords:Array.isArray(raw.keywords)?raw.keywords.map(String).slice(0,64):[]};
}

function queueEntries(integrationQueue){
  const q=integrationQueue?.queue&&typeof integrationQueue.queue==='object'?integrationQueue.queue:integrationQueue;
  return Array.isArray(q?.entries)?q.entries:[];
}

function buildOrganActivation({mechanismId,target,eventId,queueState,primitiveName}){
  const core={mechanismId,target,eventId,queueState,primitiveName,activationClass:'INTERNAL_MECHANISM_BINDING',consequenceAuthority:'NONE',businessEffectAuthority:'NONE'};
  return {activationId:`gm_act_${digest(core).slice(0,24)}`,...core};
}

export function compileGamechangerMechanismPack({seedManifest, integrationQueue=null, observedAt=new Date().toISOString()}={}){
  const seedsRaw=Array.isArray(seedManifest)?seedManifest:Array.isArray(seedManifest?.seeds)?seedManifest.seeds:null;
  if(!seedsRaw||seedsRaw.length===0||seedsRaw.length>1000)return fail(['bounded-nonempty-seed-manifest-required']);
  const seeds=[]; for(const raw of seedsRaw){const seed=validateSeed(raw);if(!seed)return fail(['valid-seed-contract-required']);seeds.push(seed);}
  const seedIds=new Set(seeds.map(seed=>seed.id));
  if(seedIds.size!==seeds.length)return fail(['unique-seed-ids-required']);
  const bindingIds=new Set(Object.keys(GAMECHANGER_MECHANISM_BINDINGS));
  const primitiveIds=new Set(Object.keys(GAMECHANGER_MECHANISM_PRIMITIVES));
  const missingBindings=[...seedIds].filter(id=>!bindingIds.has(id));
  const missingPrimitives=[...seedIds].filter(id=>!primitiveIds.has(id));
  const orphanBindings=[...bindingIds].filter(id=>!seedIds.has(id));
  if(missingBindings.length||missingPrimitives.length||orphanBindings.length)return fail(['complete-mechanism-binding-and-runtime-coverage-required'],{missingBindings,missingPrimitives,orphanBindings});
  const graph=compileUberBondCognitiveGraph();
  if(!graph.ok)return fail(['cognitive-graph-required']);
  const graphNodes=new Set(graph.nodes.map(node=>node.id));
  const invalidTargets=[];
  for(const [id,binding] of Object.entries(GAMECHANGER_MECHANISM_BINDINGS))for(const target of binding.targets)if(!graphNodes.has(target))invalidTargets.push({id,target});
  if(invalidTargets.length)return fail(['mechanism-target-must-be-live-cognitive-organ'],{invalidTargets});
  const queueById=new Map(queueEntries(integrationQueue).filter(entry=>entry?.canonicalMechanismId).map(entry=>[String(entry.canonicalMechanismId),entry]));
  const mechanisms=[];
  const organWorkQueues=Object.fromEntries([...graphNodes].map(id=>[id,[]]));
  for(const seed of seeds){
    const binding=GAMECHANGER_MECHANISM_BINDINGS[seed.id], primitive=GAMECHANGER_MECHANISM_PRIMITIVES[seed.id], queueEntry=queueById.get(seed.id)||null;
    const queueState=clean(queueEntry?.queueState,160)||'PRIMARY_EVIDENCE_REBINDING_REQUIRED';
    const evidenceRefs=Array.isArray(queueEntry?.evidenceRefs)&&queueEntry.evidenceRefs.length?queueEntry.evidenceRefs.map(String).slice(0,64):[`seed:${seed.id}`];
    const event=compileCognitiveEvent({kind:binding.eventKind,sourceNodeId:'gamechanger',subjectType:'GAMECHANGER_MECHANISM',subjectId:`mechanism:${seed.id}`,summary:`${seed.title}. ${seed.mechanism}`,evidenceRefs,truthClass:'RESEARCH_ASSET',observedAt});
    if(!event.ok)return fail(['mechanism-cognitive-event-compile-failed'],{mechanismId:seed.id,event});
    const route=routeCognitiveEvent({graph,compiledEvent:event});
    if(!route.ok)return fail(['mechanism-cognitive-route-failed'],{mechanismId:seed.id,route});
    const organActivations=binding.targets.map(target=>buildOrganActivation({mechanismId:seed.id,target,eventId:event.eventId,queueState,primitiveName:primitive.name}));
    for(const activation of organActivations)organWorkQueues[activation.target].push(activation);
    mechanisms.push({
      mechanismId:seed.id,
      title:seed.title,
      family:binding.family,
      mechanism:seed.mechanism,
      attentionState:seed.attentionState,
      evidenceState:queueEntry?.evidenceState||seed.evidenceState,
      queueState,
      sourceEvidenceRefs:evidenceRefs,
      liveEvidenceBound:Boolean(queueEntry?.liveFingerprint),
      engineeringEligible:queueEntry?.engineeringEligible===true,
      primitive:{name:primitive.name,implemented:true,module:'src/gamechanger-mechanism-runtime.mjs',implementationClass:'DETERMINISTIC_INTERNAL_PRIMITIVE'},
      smallestExperiment:seed.smallestExperiment,
      targetOrgans:[...binding.targets],
      organActivations,
      cognitiveEvent:event,
      cognitiveRoute:route,
      integrationState:'INTERNAL_CONTROL_PLANE_INTEGRATED',
      behaviorProofState:'PRIMITIVE_IMPLEMENTED_NOT_EXTERNALLY_PROVEN',
      economicProof:'NONE',
      commercialTruthAuthority:'NONE',
      promotionAuthority:'NONE',
      executableExternalAuthority:'NONE',
      businessEffectAuthority:'NONE'
    });
  }
  for(const queue of Object.values(organWorkQueues))queue.sort((a,b)=>a.mechanismId.localeCompare(b.mechanismId));
  const activeOrganQueues=Object.fromEntries(Object.entries(organWorkQueues).filter(([,queue])=>queue.length));
  const pack={
    schemaVersion:'uberbond.gamechanger-mechanism-pack.v1',
    packVersion:GAMECHANGER_MECHANISM_PACK_VERSION,
    generatedAt:new Date(observedAt).toISOString(),
    mechanismCount:mechanisms.length,
    runtimePrimitiveCount:mechanisms.filter(m=>m.primitive.implemented).length,
    internallyIntegratedCount:mechanisms.filter(m=>m.integrationState==='INTERNAL_CONTROL_PLANE_INTEGRATED').length,
    engineeringEligibleCount:mechanisms.filter(m=>m.engineeringEligible).length,
    liveEvidenceBoundCount:mechanisms.filter(m=>m.liveEvidenceBound).length,
    targetOrganCount:Object.keys(activeOrganQueues).length,
    allIdeasOperationalized:mechanisms.length===seeds.length&&mechanisms.every(m=>m.primitive.implemented),
    allIdeasBoundToExistingOrgans:mechanisms.every(m=>m.targetOrgans.length>0),
    mechanisms,
    organWorkQueues:activeOrganQueues,
    integrationDigest:null,
    promotionAuthority:'NONE',
    executableExternalAuthority:'NONE',
    commercialTruthAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'ALL SEEDS ARE FIRST_CLASS INTERNAL MECHANISMS WITH CALLABLE DETERMINISTIC PRIMITIVES AND EXPLICIT EXISTING_ORGAN BINDINGS. THIS IS INTERNAL SOFTWARE INTEGRATION, NOT EXTERNAL MARKET VALIDATION, CUSTOMER PROOF, REVENUE PROOF, PROVIDER ENTITLEMENT, OR AUTHORITY TO CAUSE EXTERNAL EFFECTS.'
  };
  pack.integrationDigest=digest({...pack,integrationDigest:null});
  return {ok:true,status:'ALL_GAMECHANGER_MECHANISMS_INTEGRATED',pack,packDigest:pack.integrationDigest,businessEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}
