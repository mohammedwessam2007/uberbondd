import crypto from 'node:crypto';
import { MILLION_BRANCH_DOMAIN_NAMES, MILLION_BRANCH_OPERATOR_NAMES } from './million-branch-ideation-compat-data.mjs';

export const MILLION_BRANCH_IDEATION_GENOME_VERSION='uberbond.million-branch-ideation-genome-compat.v2';
export const MILLION_BRANCH_SOURCE_SHA256='4dc7269a2a8f6dfc1855d1f2cf7231d437b22fe948e4139808a1a97c937065e5';
export const MILLION_BRANCH_DOMAIN_COUNT=20;
export const MILLION_BRANCH_OPERATOR_COUNT=50;
export const MILLION_BRANCH_GENERATOR_COUNT=1000;
const zero=()=>({providerCalls:0,messages:0,spendCents:0,deployments:0,payments:0});
const slug=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const boundedInt=(value,min,max)=>Number.isSafeInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null;

export const MILLION_BRANCH_DOMAINS=Object.freeze(MILLION_BRANCH_DOMAIN_NAMES.map(name=>Object.freeze({id:slug(name),name,scope:`Search-space domain for ${name.toLowerCase()}. Personalization remains behind a separately authorized private context boundary.`})));
export const MILLION_BRANCH_OPERATORS=Object.freeze(MILLION_BRANCH_OPERATOR_NAMES.map(name=>Object.freeze({id:slug(name),name,template:`${name}: generate evidence-bound alternatives for {domain}; treat every output as a hypothesis until separately verified.`})));

export function buildMillionBranchIdeationGenome(){
  const output=[];let id=1;
  for(const domain of MILLION_BRANCH_DOMAINS) for(const operator of MILLION_BRANCH_OPERATORS){
    output.push(Object.freeze({id:id++,key:`${domain.id}::${operator.id}`,domainId:domain.id,domainName:domain.name,operatorId:operator.id,operatorName:operator.name,prompt:operator.template.replaceAll('{domain}',domain.name.toLowerCase())}));
  }
  return Object.freeze(output);
}

export function validateMillionBranchIdeationGenome(){
  const genome=buildMillionBranchIdeationGenome(),reasons=[];
  if(MILLION_BRANCH_DOMAINS.length!==20)reasons.push('domain-count-mismatch');
  if(MILLION_BRANCH_OPERATORS.length!==50)reasons.push('operator-count-mismatch');
  if(genome.length!==1000)reasons.push('generator-count-mismatch');
  if(new Set(genome.map(item=>item.key)).size!==1000)reasons.push('duplicate-generator-key');
  if(new Set(genome.map(item=>item.prompt.toLowerCase())).size!==1000)reasons.push('duplicate-generator-prompt');
  return {ok:reasons.length===0,status:reasons.length?'MILLION_BRANCH_IDEATION_GENOME_INVALID':'MILLION_BRANCH_IDEATION_GENOME_HEALTHY',version:MILLION_BRANCH_IDEATION_GENOME_VERSION,sourceSha256:MILLION_BRANCH_SOURCE_SHA256,domainCount:MILLION_BRANCH_DOMAINS.length,operatorCount:MILLION_BRANCH_OPERATORS.length,generatorCount:genome.length,reasonCodes:reasons,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

function matchDomains(values){
  if(!Array.isArray(values)||values.length>256)return null;
  const queries=values.map(normalize).filter(Boolean);
  if(!queries.length)return[];
  return MILLION_BRANCH_DOMAINS.filter(domain=>{const haystack=normalize(`${domain.id} ${domain.name} ${domain.scope}`);return queries.some(query=>haystack.includes(query)||query.includes(normalize(domain.name)));}).map(domain=>domain.id);
}

export function buildIdeationActivationPlan({context,affectedDomains=[],maxGenerators=12,candidateBudgetPerGenerator=50,seed='uberbond'}={}){
  const cleanContext=String(context||'').trim(),cleanSeed=String(seed||'').trim(),cap=boundedInt(maxGenerators,1,100),budget=boundedInt(candidateBudgetPerGenerator,1,100),matched=matchDomains(affectedDomains),reasons=[];
  if(!cleanContext)reasons.push('context-required');if(!cleanSeed)reasons.push('seed-required');if(!cap)reasons.push('bounded-max-generators-required');if(!budget)reasons.push('bounded-candidate-budget-required');if(matched===null)reasons.push('bounded-affected-domains-required');
  if(reasons.length)return {ok:false,status:'MILLION_BRANCH_ACTIVATION_INVALID',reasonCodes:reasons,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  const all=buildMillionBranchIdeationGenome(),eligible=matched.length?all.filter(item=>matched.includes(item.domainId)):all;
  const selected=eligible.map(item=>({item,score:crypto.createHash('sha256').update(`${cleanSeed}|${cleanContext}|${item.key}`).digest('hex')})).sort((a,b)=>a.score.localeCompare(b.score)||a.item.id-b.item.id).slice(0,Math.min(cap,eligible.length)).map(row=>row.item);
  return {ok:true,status:'MILLION_BRANCH_IDEATION_ACTIVATION_READY',version:MILLION_BRANCH_IDEATION_GENOME_VERSION,matchedDomainIds:matched,selectedGenerators:selected,selectedGeneratorCount:selected.length,totalGeneratorCount:1000,candidateBudgetPerGenerator:budget,selectedFirstGenerationCapacity:selected.length*budget,wholeGenomeFirstGenerationCapacity:1000*budget,executionRule:'IDEATION_ONLY_UNTIL_SEPARATE_EVIDENCE_AUTHORITY_AND_CONSEQUENCE_GATES_PASS',claimBoundary:'GENERATOR_OUTPUTS_ARE_HYPOTHESES_NOT_FACTS_CAPABILITIES_REVENUE_OR_EXTERNAL_PROOF',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export function projectIdeationBranching({activeGenerators=1000,candidatesPerGenerator=50,survivorPercent=10,descendantsPerSurvivor=20,generations=2}={}){
  const a=boundedInt(activeGenerators,1,1000),c=boundedInt(candidatesPerGenerator,1,100),s=boundedInt(survivorPercent,1,100),d=boundedInt(descendantsPerSurvivor,1,100),n=boundedInt(generations,1,8);
  if(![a,c,s,d,n].every(Boolean))return {ok:false,status:'MILLION_BRANCH_PROJECTION_INVALID',reasonCodes:['bounded-branching-inputs-required'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  let current=a*c,total=current;const generationCounts=[current];
  for(let generation=2;generation<=n;generation++){current=Math.max(1,Math.floor(current*s/100))*d;if(!Number.isSafeInteger(current)||!Number.isSafeInteger(total+current))return {ok:false,status:'MILLION_BRANCH_PROJECTION_INVALID',reasonCodes:['projection-overflow'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};generationCounts.push(current);total+=current;}
  return {ok:true,status:'MILLION_BRANCH_PROJECTION_READY',generationCounts,totalCandidateNodes:total,claimBoundary:'PROJECTED_COUNTS_ARE_NOT_EXECUTED_IDEAS_OR_DISCOVERIES',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}
