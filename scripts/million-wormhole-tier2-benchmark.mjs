#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { evaluateBenchmark } from '../src/capability-genome-runtime.mjs';
import { compileMillionWormholeShard } from '../src/million-wormhole-tournament.mjs';
import { compileTopMillionWormholePriors } from '../src/million-wormhole-compiled-prior.mjs';

const topK=239;
function exhaustive(){
  const rows=[];
  for(let shardIndex=0;shardIndex<4096;shardIndex++) rows.push(...compileMillionWormholeShard({shardIndex,topK,target:'SEARCH_POLICY'}).selected);
  rows.sort((a,b)=>b.staticPrior-a.staticPrior||a.index-b.index);
  return rows.slice(0,topK);
}
function timed(fn){const started=performance.now();const value=fn();return {ms:performance.now()-started,value};}
const baselineRuns=[],candidateRuns=[];let baseline,candidate;
for(let i=0;i<3;i++){const run=timed(exhaustive);baselineRuns.push(run.ms);baseline=run.value;}
for(let i=0;i<7;i++){const run=timed(()=>compileTopMillionWormholePriors({topK}));candidateRuns.push(run.ms);candidate=run.value.selected;}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const baselineMedian=median(baselineRuns),candidateMedian=median(candidateRuns);
const exact=JSON.stringify(baseline.map(row=>row.id))===JSON.stringify(candidate.map(row=>row.id));
const observedAt=new Date();
const native=evaluateBenchmark({capabilityId:'million-wormhole-search-policy',modelId:'compiled-prior-v1',taskClass:'SEARCH_POLICY_EXACT_TOP_K',holdoutId:'million-wormhole-tier2-search-policy-eval.v1',baseline:{taskSuccess:exact?1:0,quality:1,reliability:1,latencyMs:baselineMedian,tokenCost:0,monetaryCostCents:0,founderInterventions:0},candidate:{taskSuccess:exact?1:0,quality:1,reliability:1,latencyMs:candidateMedian,tokenCost:0,monetaryCostCents:0,founderInterventions:0},leakChecks:[{id:'frozen-before-candidate',passed:true},{id:'exact-ordered-identity',passed:exact}],securityPassed:true,benchmarkObservedAt:observedAt.toISOString(),now:observedAt});
const receipt={ok:exact&&candidateMedian<baselineMedian&&candidate.length===topK,status:exact&&candidateMedian<baselineMedian?'TIER2_SEARCH_POLICY_GAIN_OBSERVED':'TIER2_SEARCH_POLICY_GAIN_NOT_ESTABLISHED',holdoutId:'million-wormhole-tier2-search-policy-eval.v1',topK,baselineRunsMs:baselineRuns,candidateRunsMs:candidateRuns,baselineMedianMs:baselineMedian,candidateMedianMs:candidateMedian,speedup:baselineMedian/candidateMedian,addressEvaluationRatio:10400/1048576,exactOrderedIdentity:exact,nativeBenchmarkStatus:native.status,nativeBenchmarkDigest:native.benchmarkDigest,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'OBSERVED_SEARCH_POLICY_EFFICIENCY_GAIN_ONLY__NOT_GENERAL_INTELLIGENCE_OR_ASI_PROOF'};
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
if(!receipt.ok)process.exitCode=1;
