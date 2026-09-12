import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const AUTONOMIC_PROMETHEUS_RECEIPT_BRIDGE_VERSION='uberbond.autonomic-prometheus-receipt-bridge.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const digest=value=>/^[a-f0-9]{64}$/i.test(String(value||''))?String(value).toLowerCase():null;

function wrap({handlers,store,handlerType,auditType,detail}){
  const original=handlers?.[handlerType];
  if(typeof original!=='function')return;
  handlers[handlerType]=async payload=>{
    const input=payload&&typeof payload==='object'?payload:{};
    const result=await original(payload);
    const inputDigest=digest(input.autonomicInputDigest);
    if(inputDigest){
      const base=detail(result,input);
      await store.log(auditType,{
        ...base,
        inputDigest,
        autonomicReceiptBridgeVersion:AUTONOMIC_PROMETHEUS_RECEIPT_BRIDGE_VERSION,
        businessEffectAuthority:'NONE',
        externalEffectAuthority:'NONE',
        externalEffectLedger:result?.externalEffectLedger||zero()
      });
    }
    return result;
  };
}

export function attachAutonomicPrometheusReceiptBridge({handlers,store}={}){
  if(!handlers||!store||typeof store.log!=='function')return handlers;
  wrap({
    handlers,store,
    handlerType:'prometheus.capability_genome.plan',
    auditType:'capability_genome_discovery_plan',
    detail:result=>({status:result?.status||null,planDigest:result?.planDigest||null,sourceIds:Array.isArray(result?.plans)?result.plans.map(plan=>plan.sourceId):[]})
  });
  wrap({
    handlers,store,
    handlerType:'prometheus.commercial_memory.contradiction_scan',
    auditType:'commercial_memory_contradictions_found',
    detail:result=>({status:'CONTRADICTION_SCAN_COMPLETE',scanned:Number(result?.scanned||0),count:Number(result?.contradictions||0),hypotheses:[]})
  });
  wrap({
    handlers,store,
    handlerType:'prometheus.commercial.catalog',
    auditType:'commercial_opportunity_catalog',
    detail:result=>({status:result?.status||null,catalogDigest:result?.catalogDigest||result?.registryDigest||null,count:Number(result?.opportunityCount||result?.count||0)})
  });
  return handlers;
}
