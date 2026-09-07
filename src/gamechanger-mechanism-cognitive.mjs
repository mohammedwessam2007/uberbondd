import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GAMECHANGER_MECHANISM_COGNITIVE_VERSION = 'uberbond.gamechanger-mechanism-cognitive-1.0.0';
const clone=value=>structuredClone(value);
const zeroEffects=()=>clone(ZERO_EXTERNAL_EFFECTS);
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(reasonCodes,extra={})=>({ok:false,status:'GAMECHANGER_MECHANISM_COGNITIVE_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra});

function mechanismRoute(mechanism){
  const event=mechanism?.cognitiveEvent;
  if(!event?.ok||!event.eventId||!Array.isArray(mechanism?.organActivations))return null;
  const evidenceRefs=Array.isArray(event?.event?.evidenceRefs)?event.event.evidenceRefs:[];
  const truthClass=event?.event?.truthClass||'RESEARCH_ASSET';
  const activations=mechanism.organActivations.map(binding=>({
    activationId:binding.activationId||`gm_act_${digest({eventId:event.eventId,target:binding.target}).slice(0,24)}`,
    eventId:event.eventId,
    sourceNodeId:'gamechanger',
    targetNodeId:binding.target,
    relations:['GAMECHANGER_MECHANISM_BINDING'],
    inheritedEvidenceRefs:[...evidenceRefs],
    inheritedTruthClass:truthClass,
    mechanismId:mechanism.mechanismId,
    primitiveName:mechanism?.primitive?.name||null,
    queueState:mechanism.queueState||null,
    consequenceAuthority:'NONE',
    businessEffectAuthority:'NONE'
  }));
  return {ok:true,status:'GAMECHANGER_MECHANISM_BINDING_ROUTE',eventId:event.eventId,sourceNodeId:'gamechanger',activations,activationCount:activations.length,businessEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

export function augmentCognitiveReceiptWithGamechangerMechanisms({receipt,mechanismPack,packRef='artifact:gamechanger-mechanism-pack-latest'}={}){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||!Array.isArray(receipt.events)||!Array.isArray(receipt.routes)||!receipt.activationSummary)return fail(['valid-cognitive-receipt-required']);
  const pack=mechanismPack?.pack&&typeof mechanismPack.pack==='object'?mechanismPack.pack:mechanismPack;
  if(!pack||pack.schemaVersion!=='uberbond.gamechanger-mechanism-pack.v1'||!Array.isArray(pack.mechanisms))return fail(['valid-gamechanger-mechanism-pack-required']);
  if(pack.mechanismCount!==pack.mechanisms.length||pack.mechanismCount!==25||pack.runtimePrimitiveCount!==25||pack.internallyIntegratedCount!==25||pack.allIdeasOperationalized!==true||pack.allIdeasBoundToExistingOrgans!==true)return fail(['complete-25-mechanism-pack-required']);
  if(pack.promotionAuthority!=='NONE'||pack.executableExternalAuthority!=='NONE'||pack.commercialTruthAuthority!=='NONE')return fail(['mechanism-pack-authority-inflation']);
  const output=clone(receipt);
  const existingEvents=new Set(output.events.map(item=>item?.eventId).filter(Boolean));
  const existingRoutes=new Set(output.routes.map(item=>`${item?.status}:${item?.eventId}`).filter(Boolean));
  let addedEvents=0,addedRoutes=0,addedActivations=0;
  const targetCounts={...(output.activationSummary.targetCounts||{})};
  for(const mechanism of pack.mechanisms){
    if(mechanism?.integrationState!=='INTERNAL_CONTROL_PLANE_INTEGRATED'||mechanism?.primitive?.implemented!==true||mechanism?.promotionAuthority!=='NONE'||mechanism?.executableExternalAuthority!=='NONE')return fail(['mechanism-not-safely-integrated'],{mechanismId:mechanism?.mechanismId||null});
    const event=mechanism.cognitiveEvent;
    if(!event?.ok||event.status!=='COGNITIVE_EVENT_READY')return fail(['mechanism-cognitive-event-invalid'],{mechanismId:mechanism.mechanismId});
    if(!existingEvents.has(event.eventId)){output.events.push(clone(event));existingEvents.add(event.eventId);addedEvents+=1;}
    const route=mechanismRoute(mechanism);
    if(!route)return fail(['mechanism-explicit-route-invalid'],{mechanismId:mechanism.mechanismId});
    const routeKey=`${route.status}:${route.eventId}`;
    if(existingRoutes.has(routeKey))continue;
    output.routes.push(route);existingRoutes.add(routeKey);addedRoutes+=1;addedActivations+=route.activationCount;
    for(const activation of route.activations)targetCounts[activation.targetNodeId]=(targetCounts[activation.targetNodeId]||0)+1;
  }
  output.activationSummary={...output.activationSummary,eventCount:output.events.length,activationCount:Number(output.activationSummary.activationCount||0)+addedActivations,targetCounts};
  output.sources={...(output.sources||{}),gamechangerMechanisms:true};
  output.gamechangerMechanisms={schemaVersion:pack.schemaVersion,packVersion:pack.packVersion||null,packDigest:pack.integrationDigest||null,packRef,mechanismCount:pack.mechanismCount,runtimePrimitiveCount:pack.runtimePrimitiveCount,internallyIntegratedCount:pack.internallyIntegratedCount,targetOrganCount:pack.targetOrganCount,engineeringEligibleCount:pack.engineeringEligibleCount,addedEvents,addedRoutes,addedActivations,promotionAuthority:'NONE',executableExternalAuthority:'NONE',commercialTruthAuthority:'NONE'};
  output.truthBoundary=`${String(output.truthBoundary||'').trim()} GAMECHANGER MECHANISM EVENTS AND EXPLICIT ORGAN BINDINGS ARE INTERNAL COGNITIVE ACTIVATIONS ONLY. THEIR DETERMINISTIC PRIMITIVES MAY BE CALLED BY GOVERNED INTERNAL CODE, BUT THIS RECEIPT DOES NOT CREATE EXTERNAL EXECUTION, PROMOTION, CUSTOMER, PAYMENT, DEPLOYMENT, CREDENTIAL-DELIVERY, SPEND, OR COMMERCIAL-TRUTH AUTHORITY.`.trim();
  output.businessEffectAuthority='NONE';output.externalEffectAuthority='NONE';
  return {ok:true,status:addedEvents||addedRoutes?'GAMECHANGER_MECHANISMS_ADDED_TO_COGNITIVE_RECEIPT':'GAMECHANGER_MECHANISMS_ALREADY_PRESENT',receipt:output,addedEvents,addedRoutes,addedActivations,businessEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}
