import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_REPLICATION_NETWORK_VERSION='uberbond.moonshot-replication-network.v1';

export const REPLICATION_COMPARATORS=Object.freeze(['EXACT','ABS_TOLERANCE','REL_TOLERANCE']);

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const fail=(status,reasons,extra={})=>envelope({
  ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra
});
const text=(value,max=500)=>{
  const out=String(value??'').trim();
  return out&&out.length<=max?out:null;
};

function getPath(object,path){
  const parts=String(path).split('.').filter(Boolean);
  let current=object;
  for(const part of parts){
    if(current==null||typeof current!=='object'||!(part in current)) return undefined;
    current=current[part];
  }
  return current;
}

function normalizeMetric(raw,index){
  const path=text(raw?.path,300);
  const comparator=String(raw?.comparator||'EXACT').toUpperCase();
  const tolerance=Number(raw?.tolerance??0);
  if(!path||!REPLICATION_COMPARATORS.includes(comparator)||!Number.isFinite(tolerance)||tolerance<0){
    return null;
  }
  return {
    id:text(raw?.id,160)||`metric-${index+1}`,
    path,comparator,tolerance,
    required:raw?.required!==false
  };
}

export function compileReplicationProtocol({
  protocolId,
  experimentId,
  metrics=[],
  minimumIndependentReplications=1,
  allowConflictedReproduction=false
}={}){
  const pid=text(protocolId,200),eid=text(experimentId,200);
  const min=Number(minimumIndependentReplications);
  if(!pid||!eid||!Array.isArray(metrics)||metrics.length===0||metrics.length>128||
     !Number.isSafeInteger(min)||min<1||min>20){
    return fail('REPLICATION_PROTOCOL_INVALID',['protocol-experiment-metrics-and-bounded-replication-count-required']);
  }
  const normalized=metrics.map(normalizeMetric);
  if(normalized.some(x=>!x)) return fail('REPLICATION_PROTOCOL_INVALID',['valid-metric-contract-required']);
  const ids=normalized.map(x=>x.id);
  if(new Set(ids).size!==ids.length) return fail('REPLICATION_PROTOCOL_INVALID',['unique-metric-ids-required']);
  return envelope({
    ok:true,status:'REPLICATION_PROTOCOL_COMPILED',
    protocol:{
      protocolId:pid,experimentId:eid,metrics:normalized,
      minimumIndependentReplications:min,
      allowConflictedReproduction:Boolean(allowConflictedReproduction)
    },
    promotionAuthority:'NONE',
    truthBoundary:'REPLICATION_PROTOCOL_DEFINES_COMPARISON_RULES__IT_DOES_NOT_CREATE_REPLICATION_EVIDENCE'
  });
}

function normalizeImplementation(raw,label){
  const id=text(raw?.implementationId,200);
  const language=text(raw?.language,80)||'UNKNOWN';
  const lineage=String(raw?.lineage||'').toUpperCase();
  if(!id||!['PRIMARY','INDEPENDENT','SAME_LINEAGE','UNKNOWN'].includes(lineage)){
    return {ok:false,reason:`${label}-implementation-metadata-invalid`};
  }
  return {ok:true,value:{implementationId:id,language,lineage,sourceRef:text(raw?.sourceRef,1000)||null}};
}

function compareMetric(metric,primary,replication){
  const a=getPath(primary,metric.path),b=getPath(replication,metric.path);
  if(a===undefined||b===undefined){
    return {metricId:metric.id,path:metric.path,status:'MISSING',primary:a,replication:b,required:metric.required};
  }
  if(metric.comparator==='EXACT'){
    const equal=Object.is(a,b)||JSON.stringify(a)===JSON.stringify(b);
    return {metricId:metric.id,path:metric.path,status:equal?'MATCH':'MISMATCH',primary:a,replication:b};
  }
  const an=Number(a),bn=Number(b);
  if(!Number.isFinite(an)||!Number.isFinite(bn)){
    return {metricId:metric.id,path:metric.path,status:'TYPE_MISMATCH',primary:a,replication:b};
  }
  let delta;
  if(metric.comparator==='ABS_TOLERANCE'){
    delta=Math.abs(an-bn);
  }else{
    const denom=Math.max(Math.abs(an),Number.EPSILON);
    delta=Math.abs(an-bn)/denom;
  }
  return {
    metricId:metric.id,path:metric.path,
    status:delta<=metric.tolerance?'MATCH':'MISMATCH',
    primary:an,replication:bn,delta:Number(delta.toFixed(12)),tolerance:metric.tolerance
  };
}

export function evaluateReplicationNetwork({
  protocol,
  primary,
  replications=[]
}={}){
  if(!protocol?.protocolId||!primary||!Array.isArray(replications)||replications.length>100){
    return fail('REPLICATION_NETWORK_INVALID',['compiled-protocol-primary-and-bounded-replications-required']);
  }
  const pImpl=normalizeImplementation(primary.implementation,'primary');
  if(!pImpl.ok||pImpl.value.lineage!=='PRIMARY') return fail('REPLICATION_NETWORK_INVALID',[pImpl.reason||'primary-lineage-required']);
  if(primary.experimentId!==protocol.experimentId) return fail('REPLICATION_NETWORK_INVALID',['primary-experiment-mismatch']);

  const seen=new Set([pImpl.value.implementationId]);
  const rows=[];
  for(const [index,replication] of replications.entries()){
    const impl=normalizeImplementation(replication?.implementation,`replication-${index+1}`);
    if(!impl.ok) return fail('REPLICATION_NETWORK_INVALID',[impl.reason]);
    if(seen.has(impl.value.implementationId)) return fail('REPLICATION_NETWORK_INVALID',[`duplicate-implementation:${impl.value.implementationId}`]);
    seen.add(impl.value.implementationId);
    if(replication.experimentId!==protocol.experimentId){
      rows.push({
        implementation:impl.value,status:'INCOMPARABLE',reasonCodes:['experiment-id-mismatch'],metricResults:[]
      });
      continue;
    }
    const metricResults=protocol.metrics.map(metric=>compareMetric(metric,primary.result,replication.result));
    const required=metricResults.filter((_,i)=>protocol.metrics[i].required);
    const mismatch=required.some(row=>row.status!=='MATCH');
    const independent=impl.value.lineage==='INDEPENDENT';
    rows.push({
      implementation:impl.value,
      status:!independent?'NON_INDEPENDENT':mismatch?'CONFLICT':'MATCH',
      independent,metricResults
    });
  }

  const independentMatches=rows.filter(row=>row.independent&&row.status==='MATCH');
  const independentConflicts=rows.filter(row=>row.independent&&row.status==='CONFLICT');
  const nonIndependent=rows.filter(row=>row.status==='NON_INDEPENDENT');
  const enough=independentMatches.length>=protocol.minimumIndependentReplications;
  const conflictAllowed=protocol.allowConflictedReproduction||independentConflicts.length===0;
  const reproduced=enough&&conflictAllowed;

  return envelope({
    ok:true,
    status:reproduced
      ?'EXPERIMENT_REPRODUCED'
      :independentConflicts.length
        ?'REPLICATION_CONFLICT_REQUIRES_RESOLUTION'
        :'INSUFFICIENT_INDEPENDENT_REPLICATION',
    protocolId:protocol.protocolId,
    experimentId:protocol.experimentId,
    primaryImplementation:pImpl.value,
    independentMatchCount:independentMatches.length,
    independentConflictCount:independentConflicts.length,
    nonIndependentCount:nonIndependent.length,
    requiredIndependentReplications:protocol.minimumIndependentReplications,
    reproduced,
    replications:rows,
    promotionAuthority:'NONE',
    law:'REPLICATION_COUNTS_IMPLEMENTATION_INDEPENDENCE_AND_PRESERVES_CONTRADICTIONS',
    truthBoundary:'REPRODUCTION_OF_A_SCOPED_EXPERIMENT_DOES_NOT_GENERALIZE_BEYOND_THE_FROZEN_PROTOCOL'
  });
}

export function compileReplicationFrontier({experiments=[]}={}){
  if(!Array.isArray(experiments)||experiments.length>10000){
    return fail('REPLICATION_FRONTIER_INVALID',['bounded-experiments-required']);
  }
  const rows=experiments.map(raw=>{
    const evidenceState=String(raw?.evidenceState||'').toUpperCase();
    const impact=Number(raw?.downstreamCount??0);
    const independence=Number(raw?.independentReplicationCount??0);
    return {
      experimentId:text(raw?.experimentId,200),
      evidenceState,
      downstreamCount:Number.isFinite(impact)&&impact>=0?impact:0,
      independentReplicationCount:Number.isFinite(independence)&&independence>=0?independence:0
    };
  }).filter(row=>row.experimentId&&['SOFTWARE_DEMONSTRATED','EXPERIMENTED','SUPPORTED'].includes(row.evidenceState))
    .map(row=>({
      ...row,
      priorityScore:row.downstreamCount*10-Math.min(9,row.independentReplicationCount)
    }))
    .sort((a,b)=>b.priorityScore-a.priorityScore||a.experimentId.localeCompare(b.experimentId));
  return envelope({
    ok:true,status:'REPLICATION_FRONTIER_READY',experiments:rows,
    law:'REPLICATION_PRIORITY_FAVORS_HIGH_DOWNSTREAM_LEVERAGE_WITHOUT_TREATING_PRIORITY_AS_TRUTH'
  });
}
