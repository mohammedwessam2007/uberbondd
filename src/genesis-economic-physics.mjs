import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_ECONOMIC_PHYSICS_VERSION = 'uberbond.genesis-economic-physics-1.0.0';

function envelope(extra={}){return{businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra};}
function text(v,max=2400){const s=String(v??'').trim();return s&&s.length<=max?s:null;}
function num(v,min=-Infinity,max=Infinity){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
function list(v,max=4096,itemMax=1200){if(!Array.isArray(v)||v.length>max)return null;const out=[],seen=new Set();for(const raw of v){const x=text(raw,itemMax);if(!x)return null;if(!seen.has(x)){seen.add(x);out.push(x);}}return out;}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function weighted(values,weights){let sum=0,w=0;for(const [k,weight] of Object.entries(weights)){const value=num(values?.[k],0,100);if(value==null)continue;sum+=value*weight;w+=weight;}return w?sum/w:null;}
function refs(v){const r=list(v||[],512,2000);return r?r.filter(x=>/^(evidence|signal|receipt|test|doc|outcome|experiment|audit):/i.test(x)):null;}

export function telescopeDeadweightLoss({transactions=[]}={}){
  if(!Array.isArray(transactions)||transactions.length>100000)return envelope({ok:false,status:'DEADWEIGHT_LOSS_INVALID',reasonCodes:['bounded-transactions-required']});
  let potential=0,realized=0,friction=0;const rows=[];
  for(const raw of transactions){const willingness=num(raw?.willingnessToPay,0),cost=num(raw?.cost,0),completed=raw?.completed===true,frictionCost=num(raw?.frictionCost??0,0);if(willingness==null||cost==null||frictionCost==null)continue;const surplus=Math.max(0,willingness-cost);potential+=surplus;friction+=frictionCost;if(completed)realized+=Math.max(0,surplus-frictionCost);rows.push({id:text(raw?.id,160)||`tx-${rows.length+1}`,surplus,completed,frictionCost});}
  const deadweight=Math.max(0,potential-realized);return envelope({ok:true,status:'DEADWEIGHT_LOSS_TELESCOPE_READY',potentialSurplus:potential,realizedSurplus:realized,deadweightLoss:deadweight,frictionCost:friction,rows,claimBoundary:'STRUCTURED_INPUT_ESTIMATE_NOT_WELFARE_OR_CAUSAL_PROOF'});
}

export function buildTransactionCostAtlas({stages=[]}={}){
  if(!Array.isArray(stages)||stages.length>10000)return envelope({ok:false,status:'TRANSACTION_COST_ATLAS_INVALID',reasonCodes:['bounded-stages-required']});
  const normalized=[];for(const raw of stages){const id=text(raw?.id,160),money=num(raw?.moneyCost??0,0),minutes=num(raw?.minutes??0,0),failure=num(raw?.failureProbability??0,0,1),coordination=num(raw?.coordinationTouches??0,0);if(!id||money==null||minutes==null||failure==null||coordination==null)continue;const burden=money+minutes+failure*100+coordination*10;normalized.push({id,moneyCost:money,minutes,failureProbability:failure,coordinationTouches:coordination,burden:Number(burden.toFixed(2))});}
  normalized.sort((a,b)=>b.burden-a.burden||a.id.localeCompare(b.id));return envelope({ok:true,status:'TRANSACTION_COST_ATLAS_READY',stages:normalized,totalBurden:Number(normalized.reduce((s,x)=>s+x.burden,0).toFixed(2)),claimBoundary:'BURDEN_INDEX_IS_COMPARATIVE_DECISION_SUPPORT_NOT_ACCOUNTING_TRUTH'});
}

export function scanTrustFriction({signals=[]}={}){
  if(!Array.isArray(signals)||signals.length>10000)return envelope({ok:false,status:'TRUST_FRICTION_INVALID',reasonCodes:['bounded-signals-required']});
  const rows=signals.map((raw,index)=>{const evidence=num(raw?.evidenceStrength??0,0,100)??0,reversibility=num(raw?.reversibility??0,0,100)??0,reputation=num(raw?.reputation??0,0,100)??0,stakes=num(raw?.stakes??50,0,100)??50,ambiguity=num(raw?.ambiguity??50,0,100)??50;const friction=100-weighted({evidence,reversibility,reputation,lowStakes:100-stakes,clarity:100-ambiguity},{evidence:.3,reversibility:.2,reputation:.2,lowStakes:.1,clarity:.2});return{id:text(raw?.id,160)||`trust-${index+1}`,friction:Number(friction.toFixed(2)),components:{evidence,reversibility,reputation,stakes,ambiguity}};}).sort((a,b)=>b.friction-a.friction);
  return envelope({ok:true,status:'TRUST_FRICTION_SCAN_READY',rows,claimBoundary:'TRUST_FRICTION_IS_HEURISTIC_AND_REQUIRES_BUYER_EVIDENCE'});
}

export function mapCoordinationEntropy({actors=[],handoffs=[]}={}){
  const as=list(actors,10000,200);if(!as||!Array.isArray(handoffs)||handoffs.length>100000)return envelope({ok:false,status:'COORDINATION_ENTROPY_INVALID',reasonCodes:['bounded-actors-and-handoffs-required']});const actorSet=new Set(as),degree=new Map(as.map(a=>[a,0])),invalid=[];
  for(const h of handoffs){const from=text(h?.from,200),to=text(h?.to,200);if(!actorSet.has(from)||!actorSet.has(to)||from===to){invalid.push(h);continue;}degree.set(from,degree.get(from)+1);degree.set(to,degree.get(to)+1);}
  const total=[...degree.values()].reduce((a,b)=>a+b,0);let entropy=0;if(total)for(const d of degree.values()){if(!d)continue;const p=d/total;entropy-=p*Math.log2(p);}const max=as.length>1?Math.log2(as.length):0;return envelope({ok:true,status:'COORDINATION_ENTROPY_MAP_READY',entropy:Number(entropy.toFixed(6)),normalizedEntropy:max?Number((entropy/max*100).toFixed(2)):0,degree:Object.fromEntries(degree),invalidHandoffs:invalid.length,claimBoundary:'NETWORK_ENTROPY_IS_COORDINATION_COMPLEXITY_PROXY_NOT_ORGANIZATIONAL_CAUSAL_PROOF'});
}

export function detectMarginMigration({periods=[]}={}){
  if(!Array.isArray(periods)||periods.length>10000)return envelope({ok:false,status:'MARGIN_MIGRATION_INVALID',reasonCodes:['bounded-periods-required']});const rows=periods.map(raw=>{const id=text(raw?.id,160),revenue=num(raw?.revenue,0),variableCost=num(raw?.variableCost,0),providerCost=num(raw?.providerCost??0,0),founderMinutes=num(raw?.founderMinutes??0,0);if(!id||revenue==null||variableCost==null||providerCost==null||founderMinutes==null)return null;const contribution=revenue-variableCost-providerCost;return{id,revenue,contribution,marginPct:revenue?Number((contribution/revenue*100).toFixed(2)):null,founderMinutes};}).filter(Boolean);const changes=[];for(let i=1;i<rows.length;i++)changes.push({from:rows[i-1].id,to:rows[i].id,marginDeltaPct:rows[i-1].marginPct==null||rows[i].marginPct==null?null:Number((rows[i].marginPct-rows[i-1].marginPct).toFixed(2)),contributionDelta:Number((rows[i].contribution-rows[i-1].contribution).toFixed(2))});return envelope({ok:true,status:'MARGIN_MIGRATION_RADAR_READY',periods:rows,changes,claimBoundary:'MARGIN_MIGRATION_REQUIRES_VERIFIED_REVENUE_AND_COST_INPUTS_FOR_COMMERCIAL_TRUTH'});
}

export function detectInvisibleSubsidy({components=[]}={}){
  if(!Array.isArray(components)||components.length>10000)return envelope({ok:false,status:'INVISIBLE_SUBSIDY_INVALID',reasonCodes:['bounded-components-required']});const rows=[];for(const raw of components){const id=text(raw?.id,160),marketCost=num(raw?.marketCost,0),paidCost=num(raw?.paidCost,0),founderMinutes=num(raw?.founderMinutes??0,0),minuteValue=num(raw?.founderMinuteValue??0,0);if(!id||marketCost==null||paidCost==null||founderMinutes==null||minuteValue==null)continue;const hiddenLabor=founderMinutes*minuteValue,subsidy=Math.max(0,marketCost-paidCost)+hiddenLabor;rows.push({id,marketCost,paidCost,hiddenLabor,subsidy});}rows.sort((a,b)=>b.subsidy-a.subsidy);return envelope({ok:true,status:'INVISIBLE_SUBSIDY_DETECTOR_READY',rows,totalSubsidy:Number(rows.reduce((s,x)=>s+x.subsidy,0).toFixed(2)),claimBoundary:'SUBSIDY_ESTIMATE_DEPENDS_ON_INPUT_COST_AND_FOUNDER_MINUTE_ASSUMPTIONS'});
}

export function mapIncentiveFractures({actors=[]}={}){
  if(!Array.isArray(actors)||actors.length>10000)return envelope({ok:false,status:'INCENTIVE_FRACTURE_INVALID',reasonCodes:['bounded-actors-required']});const normalized=actors.map(raw=>({id:text(raw?.id,160),reward:text(raw?.reward,1000),metric:text(raw?.metric,500),externalities:list(raw?.externalities||[],64,500)||[]})).filter(x=>x.id&&x.reward&&x.metric);const fractures=[];for(let i=0;i<normalized.length;i++)for(let j=i+1;j<normalized.length;j++){const a=normalized[i],b=normalized[j],conflict=(a.externalities.some(x=>b.reward.toLowerCase().includes(x.toLowerCase()))||b.externalities.some(x=>a.reward.toLowerCase().includes(x.toLowerCase()))||a.metric!==b.metric);if(conflict)fractures.push({actors:[a.id,b.id],reason:'metric/reward/externality divergence',severity:Math.min(100,40+a.externalities.length*10+b.externalities.length*10+(a.metric!==b.metric?20:0))});}return envelope({ok:true,status:'INCENTIVE_FRACTURE_MAP_READY',actors:normalized,fractures,claimBoundary:'FRACTURE_MAP_IS_STRUCTURAL_HEURISTIC_NOT_INTENT_ATTRIBUTION'});
}

export function tomographValueLeakage({stages=[]}={}){
  if(!Array.isArray(stages)||stages.length>10000)return envelope({ok:false,status:'VALUE_LEAKAGE_INVALID',reasonCodes:['bounded-stages-required']});const rows=[];let prior=null;for(const raw of stages){const id=text(raw?.id,160),value=num(raw?.value,0);if(!id||value==null)continue;const leakage=prior==null?0:Math.max(0,prior-value);rows.push({id,value,leakageFromPrior:leakage});prior=value;}return envelope({ok:true,status:'VALUE_LEAKAGE_TOMOGRAPHY_READY',stages:rows,totalLeakage:Number(rows.reduce((s,x)=>s+x.leakageFromPrior,0).toFixed(2)),claimBoundary:'STAGE_VALUE_LOSS_IS_ACCOUNTING_MODEL_INPUT_NOT_CAUSAL_ATTRIBUTION'});
}

export function detectMarketBoundary({buyers=[],sellers=[],edges=[]}={}){
  const bs=list(buyers,10000,160),ss=list(sellers,10000,160);if(!bs||!ss||!Array.isArray(edges)||edges.length>100000)return envelope({ok:false,status:'MARKET_BOUNDARY_INVALID',reasonCodes:['bounded-buyers-sellers-edges-required']});const buyerSet=new Set(bs),sellerSet=new Set(ss),valid=edges.filter(e=>buyerSet.has(String(e?.buyer))&&sellerSet.has(String(e?.seller)));const touchedBuyers=new Set(valid.map(e=>String(e.buyer))),touchedSellers=new Set(valid.map(e=>String(e.seller)));return envelope({ok:true,status:'MARKET_BOUNDARY_DETECTOR_READY',connectedBuyerRatio:bs.length?Number((touchedBuyers.size/bs.length).toFixed(4)):0,connectedSellerRatio:ss.length?Number((touchedSellers.size/ss.length).toFixed(4)):0,isolatedBuyers:bs.filter(x=>!touchedBuyers.has(x)),isolatedSellers:ss.filter(x=>!touchedSellers.has(x)),claimBoundary:'GRAPH_CONNECTIVITY_DOES_NOT_DEFINE_ECONOMIC_MARKET_FOR_LEGAL_OR_COMPETITION_PURPOSES'});
}

export function detectEconomicPhaseChange({series=[],threshold=0.35,minWindow=2}={}){
  const t=num(threshold,0,10),window=Number(minWindow);if(!Array.isArray(series)||series.length>100000||t==null||!Number.isSafeInteger(window)||window<1)return envelope({ok:false,status:'ECONOMIC_PHASE_CHANGE_INVALID',reasonCodes:['valid-series-threshold-window-required']});const points=series.map((raw,index)=>({index,id:text(raw?.id,160)||String(index),value:num(raw?.value)})).filter(x=>x.value!=null),changes=[];for(let i=window;i<points.length;i++){const before=points.slice(i-window,i).reduce((s,x)=>s+x.value,0)/window,after=points[i].value,relative=before===0?(after===0?0:Infinity):Math.abs((after-before)/before);if(relative>=t)changes.push({at:points[i].id,beforeMean:Number(before.toFixed(6)),after,relativeChange:Number.isFinite(relative)?Number(relative.toFixed(4)):null});}return envelope({ok:true,status:changes.length?'ECONOMIC_PHASE_CHANGE_DETECTED':'NO_ECONOMIC_PHASE_CHANGE',changes,claimBoundary:'THRESHOLD_CHANGE_IS_REGIME_SIGNAL_NOT_CAUSAL_OR_MARKET_PROOF'});
}

export function compileSymbiosis({entities=[]}={}){
  if(!Array.isArray(entities)||entities.length>1000)return envelope({ok:false,status:'SYMBIOSIS_INVALID',reasonCodes:['bounded-entities-required']});const nodes=entities.map(raw=>({id:text(raw?.id,160),provides:list(raw?.provides||[],128,500)||[],needs:list(raw?.needs||[],128,500)||[]})).filter(x=>x.id),pairs=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],aToB=a.provides.filter(x=>b.needs.includes(x)),bToA=b.provides.filter(x=>a.needs.includes(x));if(aToB.length&&bToA.length)pairs.push({entities:[a.id,b.id],aProvides:aToB,bProvides:bToA,mutualityScore:Math.min(100,(aToB.length+bToA.length)*20)});}return envelope({ok:true,status:'SYMBIOSIS_COMPILER_READY',pairs,claimBoundary:'STRUCTURAL_COMPLEMENTARITY_IS_NOT_PARTNERSHIP_OR_COMMERCIAL_PROOF'});
}

export function findEcosystemKeystones({nodes=[],edges=[]}={}){
  const ns=list(nodes,10000,160);if(!ns||!Array.isArray(edges)||edges.length>100000)return envelope({ok:false,status:'KEYSTONE_FINDER_INVALID',reasonCodes:['bounded-nodes-and-edges-required']});const set=new Set(ns),degree=new Map(ns.map(id=>[id,{in:0,out:0}]));for(const e of edges){const from=String(e?.from),to=String(e?.to);if(!set.has(from)||!set.has(to)||from===to)continue;degree.get(from).out++;degree.get(to).in++;}const ranked=[...degree.entries()].map(([id,d])=>({id,...d,centrality:d.in+d.out})).sort((a,b)=>b.centrality-a.centrality||a.id.localeCompare(b.id));return envelope({ok:true,status:'ECOSYSTEM_KEYSTONE_FINDER_READY',ranked,claimBoundary:'DEGREE_CENTRALITY_IS_TOPOLOGICAL_HEURISTIC_NOT_ECONOMIC_DEPENDENCY_PROOF'});
}

export function generateCategoryCandidate({pain,mechanism,buyer,oldCategories=[],evidenceRefs=[]}={}){
  const p=text(pain,1200),m=text(mechanism,1200),b=text(buyer,800),olds=list(oldCategories,256,500),e=refs(evidenceRefs);if(!p||!m||!b||!olds||!e)return envelope({ok:false,status:'CATEGORY_GENESIS_INVALID',reasonCodes:['pain-mechanism-buyer-and-valid-evidence-list-required']});const name=`${b.split(/\s+/).slice(0,2).join(' ')} ${m.split(/\s+/).slice(0,3).join(' ')}`.replace(/\b\w/g,c=>c.toUpperCase()).slice(0,100);const category={categoryId:`category_${digest({p,m,b}).slice(0,18)}`,name,pain:p,mechanism:m,buyer:b,oldCategories:olds,status:'CANDIDATE',evidenceRefs:e};return envelope({ok:true,status:'CATEGORY_GENESIS_CANDIDATE_READY',category,claimBoundary:'CATEGORY_CANDIDATE_IS_POSITIONING_HYPOTHESIS_NOT_ESTABLISHED_MARKET'});
}

export function mineFrontierResidue({signals=[]}={}){
  if(!Array.isArray(signals)||signals.length>10000)return envelope({ok:false,status:'FRONTIER_RESIDUE_INVALID',reasonCodes:['bounded-signals-required']});const residue=signals.filter(s=>s?.mainOutcome===false||String(s?.status||'').toUpperCase()==='NEGATIVE').map((s,index)=>({id:text(s?.id,160)||`residue-${index+1}`,failedOutcome:text(s?.failedOutcome,1000)||'unknown',unexpectedCapabilities:list(s?.unexpectedCapabilities||[],128,500)||[],sideEffects:list(s?.sideEffects||[],128,500)||[],reusableArtifacts:list(s?.reusableArtifacts||[],128,500)||[]}));return envelope({ok:true,status:'FRONTIER_RESIDUE_MINED',residue,claimBoundary:'FAILED_PRIMARY_OUTCOME_CAN_DONATE_MECHANISMS_BUT_NOT_PROVE_VALUE'});
}

export function rankNegativeResultArbitrage({negativeResults=[]}={}){
  if(!Array.isArray(negativeResults)||negativeResults.length>10000)return envelope({ok:false,status:'NEGATIVE_RESULT_ARBITRAGE_INVALID',reasonCodes:['bounded-negative-results-required']});const ranked=negativeResults.map((r,index)=>{const replication=num(r?.replicationConfidence??50,0,100)??50,avoidance=num(r?.wastedCostAvoided??0,0),transfer=num(r?.crossDomainTransfer??50,0,100)??50;const score=Math.min(100,replication*.4+Math.min(100,avoidance)*.3+transfer*.3);return{id:text(r?.id,160)||`negative-${index+1}`,score:Number(score.toFixed(2)),lesson:text(r?.lesson,1600)||'unspecified'};}).sort((a,b)=>b.score-a.score);return envelope({ok:true,status:'NEGATIVE_RESULT_ARBITRAGE_READY',ranked,claimBoundary:'NEGATIVE_RESULT_VALUE_IS_LEARNING_PRIORITY_NOT_MONETARY_PROOF'});
}

export function modelPreferenceFormation({touches=[]}={}){
  if(!Array.isArray(touches)||touches.length>10000)return envelope({ok:false,status:'PREFERENCE_FORMATION_INVALID',reasonCodes:['bounded-touches-required']});const dimensions=new Map();for(const t of touches){const dim=text(t?.dimension,160),delta=num(t?.preferenceDelta,-100,100),evidence=num(t?.evidenceStrength??50,0,100);if(!dim||delta==null||evidence==null)continue;const prior=dimensions.get(dim)||0;dimensions.set(dim,prior+delta*(evidence/100));}return envelope({ok:true,status:'PREFERENCE_FORMATION_ENGINE_READY',dimensions:Object.fromEntries([...dimensions.entries()].map(([k,v])=>[k,Number(v.toFixed(3))])),claimBoundary:'PREFERENCE_UPDATE_MODEL_IS_HYPOTHESIS_AND_MUST_NOT_INFER_PRIVATE_PSYCHOLOGY'});
}

export function telescopeNonConsumption({segments=[]}={}){
  if(!Array.isArray(segments)||segments.length>10000)return envelope({ok:false,status:'NON_CONSUMPTION_INVALID',reasonCodes:['bounded-segments-required']});const ranked=segments.map((s,index)=>{const population=num(s?.population,0),need=num(s?.needIntensity??0,0,100),access=num(s?.accessDifficulty??0,0,100),current=num(s?.currentAdoption??0,0,1);if(population==null||need==null||access==null||current==null)return null;const score=population*need/100*access/100*(1-current);return{id:text(s?.id,160)||`segment-${index+1}`,nonConsumptionScore:Number(score.toFixed(2)),population,needIntensity:need,accessDifficulty:access,currentAdoption:current};}).filter(Boolean).sort((a,b)=>b.nonConsumptionScore-a.nonConsumptionScore);return envelope({ok:true,status:'NON_CONSUMPTION_TELESCOPE_READY',ranked,claimBoundary:'NON_CONSUMPTION_SCORE_IS_RESEARCH_PRIORITY_NOT_DEMAND_OR_BUDGET_PROOF'});
}

export function simulateMarketCreation({segments=[],frictionReduction=0,valueIncrease=0}={}){
  const friction=num(frictionReduction,0,100),value=num(valueIncrease,0,100);if(!Array.isArray(segments)||segments.length>10000||friction==null||value==null)return envelope({ok:false,status:'MARKET_CREATION_SIMULATOR_INVALID',reasonCodes:['bounded-segments-and-deltas-required']});const scenarios=segments.map((s,index)=>{const baseline=num(s?.adoption??0,0,1)??0,need=num(s?.needIntensity??50,0,100)??50;const uplift=(friction*.004+value*.003)*(need/100);return{id:text(s?.id,160)||`segment-${index+1}`,baselineAdoption:baseline,syntheticAdoption:Math.min(1,Number((baseline+uplift).toFixed(4))),evidenceClass:'SYNTHETIC_SCENARIO'};});return envelope({ok:true,status:'MARKET_CREATION_SIMULATION_READY',scenarios,claimBoundary:'SYNTHETIC_ADOPTION_IS_NOT_FORECAST_OR_DEMAND_PROOF'});
}

export function modelProblemFormation({signals=[]}={}){
  if(!Array.isArray(signals)||signals.length>10000)return envelope({ok:false,status:'PROBLEM_FORMATION_INVALID',reasonCodes:['bounded-signals-required']});const byProblem=new Map();for(const s of signals){const p=text(s?.problem,500),severity=num(s?.severity??50,0,100),frequency=num(s?.frequency??50,0,100),workaround=num(s?.workaroundCost??0,0);if(!p||severity==null||frequency==null||workaround==null)continue;const current=byProblem.get(p)||{problem:p,count:0,score:0};current.count++;current.score+=severity*.4+frequency*.3+Math.min(100,workaround)*.3;byProblem.set(p,current);}const problems=[...byProblem.values()].map(p=>({...p,formationScore:Number((p.score/p.count).toFixed(2))})).sort((a,b)=>b.formationScore-a.formationScore);return envelope({ok:true,status:'PROBLEM_FORMATION_ENGINE_READY',problems,claimBoundary:'PUBLIC_OR_SUPPLIED_PROBLEM_SIGNALS_DO_NOT_PROVE_PURCHASE_INTENT'});
}

export function detectPainToBudgetTransition({observations=[]}={}){
  if(!Array.isArray(observations)||observations.length>10000)return envelope({ok:false,status:'PAIN_TO_BUDGET_INVALID',reasonCodes:['bounded-observations-required']});const transitions=[];for(const o of observations){const id=text(o?.id,160),pain=num(o?.pain??0,0,100),workaroundCost=num(o?.workaroundCost??0,0),budgetSignal=num(o?.budgetSignal??0,0,100),authoritySignal=num(o?.authoritySignal??0,0,100);if(!id||pain==null||workaroundCost==null||budgetSignal==null||authoritySignal==null)continue;const readiness=pain*.25+Math.min(100,workaroundCost)*.25+budgetSignal*.3+authoritySignal*.2;transitions.push({id,readiness:Number(readiness.toFixed(2)),state:readiness>=70?'BUDGET_RESEARCH_CANDIDATE':readiness>=45?'PAIN_WITH_EARLY_BUDGET_SIGNALS':'PAIN_ONLY'});}return envelope({ok:true,status:'PAIN_TO_BUDGET_TRANSITION_READY',transitions,claimBoundary:'BUDGET_SIGNAL_STATE_IS_NOT_VERIFIED_BUDGET_OR_PURCHASE_AUTHORITY'});
}

export function detectDemandPhaseChange({observations=[]}={}){
  const series=Array.isArray(observations)?observations.map((o,index)=>({id:text(o?.id,160)||String(index),value:(num(o?.independentBuyerSignals??0,0)??0)+(num(o?.budgetSignals??0,0)??0)*2+(num(o?.paidCommitments??0,0)??0)*5})):[];const result=detectEconomicPhaseChange({series,threshold:.5,minWindow:2});return result.ok?envelope({ok:true,status:result.changes.length?'DEMAND_PHASE_CHANGE_DETECTED':'NO_DEMAND_PHASE_CHANGE',changes:result.changes,claimBoundary:'DEMAND_PHASE_SIGNAL_REQUIRES_REAL_INDEPENDENT_BUYER_AND_PAYMENT_EVIDENCE'}):result;
}

export function generateCategoryVocabulary({mechanisms=[],buyers=[],outcomes=[]}={}){
  const ms=list(mechanisms,128,300),bs=list(buyers,128,300),os=list(outcomes,128,300);if(!ms||!bs||!os)return envelope({ok:false,status:'CATEGORY_VOCABULARY_INVALID',reasonCodes:['bounded-vocabulary-inputs-required']});const candidates=[];for(const buyer of bs.slice(0,8))for(const mechanism of ms.slice(0,8))for(const outcome of os.slice(0,8)){candidates.push({term:`${buyer} ${mechanism} ${outcome}`.replace(/\s+/g,' ').trim(),status:'CANDIDATE_LABEL'});if(candidates.length>=128)break;}return envelope({ok:true,status:'CATEGORY_VOCABULARY_GENERATED',candidates,claimBoundary:'GENERATED_LABEL_IS_NOT_ESTABLISHED_CATEGORY_OR_BUYER_LANGUAGE'});
}

export function compileBuyerMentalModel({beliefs=[],decisionRules=[],proofPreferences=[],risks=[]}={}){
  const b=list(beliefs,128,1000),d=list(decisionRules,128,1000),p=list(proofPreferences,128,1000),r=list(risks,128,1000);if(!b||!d||!p||!r)return envelope({ok:false,status:'BUYER_MENTAL_MODEL_INVALID',reasonCodes:['bounded-model-fields-required']});return envelope({ok:true,status:'BUYER_MENTAL_MODEL_GENOME_READY',genome:{beliefs:b,decisionRules:d,proofPreferences:p,risks:r},claimBoundary:'MENTAL_MODEL_IS_EXPLICIT_RESEARCH_HYPOTHESIS_NOT_INFERRED_PRIVATE_PSYCHOLOGY'});
}

export function buildUniversalSurplusGraph({nodes=[],edges=[]}={}){
  const ns=list(nodes,10000,160);if(!ns||!Array.isArray(edges)||edges.length>100000)return envelope({ok:false,status:'UNIVERSAL_SURPLUS_GRAPH_INVALID',reasonCodes:['bounded-nodes-and-edges-required']});const set=new Set(ns),normalized=[];for(const e of edges){const from=String(e?.from),to=String(e?.to),surplus=num(e?.surplus,0);if(!set.has(from)||!set.has(to)||surplus==null)continue;normalized.push({from,to,surplus});}const captured=Object.fromEntries(ns.map(id=>[id,Number(normalized.filter(e=>e.to===id).reduce((s,e)=>s+e.surplus,0).toFixed(2))]));return envelope({ok:true,status:'UNIVERSAL_SURPLUS_GRAPH_READY',nodes:ns,edges:normalized,capturedSurplus:captured,claimBoundary:'SURPLUS_GRAPH_ONLY_HAS_COMMERCIAL_TRUTH_WHEN_INPUT_VALUES_ARE_VERIFIED'});
}

export function analyzeFrictionConservation({before=[],after=[]}={}){
  const normalize=rows=>Array.isArray(rows)?rows.map(r=>({id:text(r?.id,160),friction:num(r?.friction,0)})).filter(x=>x.id&&x.friction!=null):[];const b=normalize(before),a=normalize(after),beforeTotal=b.reduce((s,x)=>s+x.friction,0),afterTotal=a.reduce((s,x)=>s+x.friction,0);return envelope({ok:true,status:'FRICTION_CONSERVATION_READY',beforeTotal,afterTotal,netChange:Number((afterTotal-beforeTotal).toFixed(2)),movedNotRemoved:afterTotal>=beforeTotal*.9,claimBoundary:'FRICTION_ACCOUNTING_REQUIRES_COMPLETE_STAGE_BOUNDARY_TO_SUPPORT_CONSERVATION_CLAIM'});
}

export function estimateConstraintShadowPrice({baselineObjective,relaxedObjective,relaxationUnits=1}={}){
  const base=num(baselineObjective),relaxed=num(relaxedObjective),units=num(relaxationUnits,Number.EPSILON);if(base==null||relaxed==null||units==null)return envelope({ok:false,status:'SHADOW_PRICE_INVALID',reasonCodes:['numeric-objectives-and-positive-relaxation-required']});return envelope({ok:true,status:'CONSTRAINT_SHADOW_PRICE_READY',shadowPrice:Number(((relaxed-base)/units).toFixed(6)),claimBoundary:'SHADOW_PRICE_IS_LOCAL_COUNTERFACTUAL_ESTIMATE_NOT_MARKET_PRICE'});
}

export function calculateBottleneckCentrality({nodes=[],edges=[],capacities={}}={}){
  const ns=list(nodes,10000,160);if(!ns||!Array.isArray(edges)||edges.length>100000)return envelope({ok:false,status:'BOTTLENECK_CENTRALITY_INVALID',reasonCodes:['bounded-graph-required']});const set=new Set(ns),flowDegree=new Map(ns.map(id=>[id,0]));for(const e of edges){const from=String(e?.from),to=String(e?.to),weight=num(e?.weight??1,0);if(!set.has(from)||!set.has(to)||weight==null)continue;flowDegree.set(from,flowDegree.get(from)+weight);flowDegree.set(to,flowDegree.get(to)+weight);}const ranked=ns.map(id=>{const cap=num(capacities?.[id]??1,Number.EPSILON)??1;return{id,centrality:Number((flowDegree.get(id)/cap).toFixed(6)),flow:flowDegree.get(id),capacity:cap};}).sort((a,b)=>b.centrality-a.centrality);return envelope({ok:true,status:'BOTTLENECK_CENTRALITY_READY',ranked,claimBoundary:'FLOW_OVER_CAPACITY_IS_GRAPH_HEURISTIC_NOT_PRODUCTION_THROUGHPUT_PROOF'});
}

export function detectScarcityMigration({periods=[]}={}){
  if(!Array.isArray(periods)||periods.length>10000)return envelope({ok:false,status:'SCARCITY_MIGRATION_INVALID',reasonCodes:['bounded-periods-required']});const rows=periods.map(p=>({id:text(p?.id,160),resources:p?.resources&&typeof p.resources==='object'?p.resources:{}})).filter(x=>x.id),leaders=rows.map(row=>{const ranked=Object.entries(row.resources).map(([k,v])=>[k,num(v,0)]).filter(([,v])=>v!=null).sort((a,b)=>b[1]-a[1]);return{id:row.id,scarcest:ranked[0]?.[0]||null,scarcityScore:ranked[0]?.[1]??null};});const migrations=[];for(let i=1;i<leaders.length;i++)if(leaders[i-1].scarcest!==leaders[i].scarcest)migrations.push({from:leaders[i-1],to:leaders[i]});return envelope({ok:true,status:'SCARCITY_MIGRATION_ENGINE_READY',leaders,migrations,claimBoundary:'SCARCITY_SCORE_REQUIRES_EXPLICIT_RESOURCE_MEASUREMENT_BOUNDARY'});
}

export function analyzeAbundanceConsequence({before={},after={}}={}){
  const keys=[...new Set([...Object.keys(before||{}),...Object.keys(after||{})])],changes=[];for(const key of keys){const b=num(before?.[key]),a=num(after?.[key]);if(b==null||a==null)continue;changes.push({key,before:b,after:a,delta:Number((a-b).toFixed(6)),direction:a>b?'MORE_ABUNDANT':a<b?'MORE_SCARCE':'UNCHANGED'});}return envelope({ok:true,status:'ABUNDANCE_CONSEQUENCE_ENGINE_READY',changes,claimBoundary:'RESOURCE_CHANGE_DOES_NOT_BY_ITSELF_IDENTIFY_ECONOMIC_CAUSAL_CONSEQUENCES'});
}

export function propagateZeroMarginalCostShockwave({oldMarginalCost,newMarginalCost,dependencies=[]}={}){
  const old=num(oldMarginalCost,0),next=num(newMarginalCost,0);if(old==null||next==null||!Array.isArray(dependencies)||dependencies.length>10000)return envelope({ok:false,status:'ZERO_MARGINAL_COST_SHOCKWAVE_INVALID',reasonCodes:['costs-and-bounded-dependencies-required']});const reduction=old?Math.max(0,(old-next)/old):0,affected=dependencies.map(d=>({id:text(d?.id,160),costShare:num(d?.costShare??0,0,1)})).filter(x=>x.id&&x.costShare!=null).map(x=>({...x,estimatedUnitCostReductionPct:Number((reduction*x.costShare*100).toFixed(2))})).sort((a,b)=>b.estimatedUnitCostReductionPct-a.estimatedUnitCostReductionPct);return envelope({ok:true,status:'ZERO_MARGINAL_COST_SHOCKWAVE_READY',marginalCostReductionPct:Number((reduction*100).toFixed(2)),affected,claimBoundary:'COST_SHOCKWAVE_IS_MECHANICAL_COUNTERFACTUAL_AND_NOT_DEMAND_OR_MARGIN_PROOF'});
}

export function mapValueChainPhases({stages=[]}={}){
  if(!Array.isArray(stages)||stages.length>10000)return envelope({ok:false,status:'VALUE_CHAIN_PHASE_INVALID',reasonCodes:['bounded-stages-required']});const rows=stages.map((s,index)=>{const value=num(s?.valueAdded??0),cost=num(s?.cost??0),control=num(s?.control??50,0,100);if(value==null||cost==null||control==null)return null;return{id:text(s?.id,160)||`stage-${index+1}`,valueAdded:value,cost,control,netValue:Number((value-cost).toFixed(2)),phase:value>cost*2?'VALUE_CREATION':cost>value?'VALUE_DESTRUCTION':'VALUE_TRANSFER'};}).filter(Boolean);return envelope({ok:true,status:'VALUE_CHAIN_PHASE_MAP_READY',stages:rows,claimBoundary:'VALUE_CHAIN_PHASE_REQUIRES_VERIFIED_BOUNDARY_AND_COST_INPUTS_FOR_COMMERCIAL_USE'});
}

export function detectHiddenComplements({products=[]}={}){
  if(!Array.isArray(products)||products.length>10000)return envelope({ok:false,status:'HIDDEN_COMPLEMENT_INVALID',reasonCodes:['bounded-products-required']});const rows=products.map(p=>({id:text(p?.id,160),requires:list(p?.requires||[],128,500)||[],enables:list(p?.enables||[],128,500)||[]})).filter(x=>x.id),pairs=[];for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i],b=rows[j],matches=[...a.enables.filter(x=>b.requires.includes(x)),...b.enables.filter(x=>a.requires.includes(x))];if(matches.length)pairs.push({products:[a.id,b.id],sharedMechanisms:[...new Set(matches)],score:Math.min(100,matches.length*25)});}return envelope({ok:true,status:'HIDDEN_COMPLEMENT_DETECTOR_READY',pairs,claimBoundary:'STRUCTURAL_COMPLEMENTARITY_IS_NOT_BUNDLING_OR_CROSS_SELL_PROOF'});
}

export function invertConstraint({constraint,baseline,opposite,risks=[]}={}){
  const c=text(constraint,1000),b=text(baseline,1200),o=text(opposite,1200),r=list(risks,128,800);if(!c||!b||!o||!r)return envelope({ok:false,status:'CONSTRAINT_INVERSION_INVALID',reasonCodes:['constraint-baseline-opposite-required']});return envelope({ok:true,status:'CONSTRAINT_INVERSION_READY',hypothesis:{constraint:c,baseline:b,invertedWorld:o,risks:r,questions:['What becomes possible only in the inverted world?','Which current mechanism becomes obsolete?','Which new failure mode appears?','What reversible observation distinguishes the two worlds?']},claimBoundary:'INVERTED_CONSTRAINT_IS_COUNTERFACTUAL_SEARCH_NOT_REALITY'});
}
