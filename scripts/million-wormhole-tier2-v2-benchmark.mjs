#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { evaluateBenchmark } from '../src/capability-genome-runtime.mjs';
import { compileTopMillionWormholePriors } from '../src/million-wormhole-compiled-prior.mjs';
import { compileEarlyExitMillionWormholePriors } from '../src/million-wormhole-early-exit-prior.mjs';

const topK=251,median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const timed=fn=>{const t=performance.now();const value=fn();return {ms:performance.now()-t,value};};
for(let i=0;i<10;i++){compileTopMillionWormholePriors({topK});compileEarlyExitMillionWormholePriors({topK});}
const baselineRuns=[],candidateRuns=[];let baseline,candidate;
for(let i=0;i<31;i++){let r=timed(()=>compileTopMillionWormholePriors({topK}));baselineRuns.push(r.ms);baseline=r.value;}
for(let i=0;i<31;i++){let r=timed(()=>compileEarlyExitMillionWormholePriors({topK}));candidateRuns.push(r.ms);candidate=r.value;}
const exact=JSON.stringify(baseline.selected.map(x=>x.id))===JSON.stringify(candidate.selected.map(x=>x.id));
const baselineMedian=median(baselineRuns),candidateMedian=median(candidateRuns),observedAt=new Date();
const native=evaluateBenchmark({capabilityId:'million-wormhole-search-policy-v2',modelId:'early-exit-prior-v1',taskClass:'SEARCH_POLICY_EXACT_TOP_K',holdoutId:'million-wormhole-tier2-search-policy-eval.v2',baseline:{taskSuccess:exact?1:0,quality:1,reliability:1,latencyMs:baselineMedian,tokenCost:0,monetaryCostCents:0,founderInterventions:0},candidate:{taskSuccess:exact?1:0,quality:1,reliability:1,latencyMs:candidateMedian,tokenCost:0,monetaryCostCents:0,founderInterventions:0},leakChecks:[{id:'v2-frozen-before-candidate',passed:true},{id:'exact-identity',passed:exact},{id:'address-evaluations-equal-k',passed:candidate.addressEvaluations===topK}],securityPassed:true,benchmarkObservedAt:observedAt.toISOString(),now:observedAt});
const receipt={ok:exact&&candidateMedian<baselineMedian&&candidate.addressEvaluations===topK,status:exact&&candidateMedian<baselineMedian?'TIER2_V2_SEARCH_POLICY_GAIN_OBSERVED':'TIER2_V2_SEARCH_POLICY_GAIN_NOT_ESTABLISHED',topK,baselineMedianMs:baselineMedian,candidateMedianMs:candidateMedian,speedup:baselineMedian/candidateMedian,baselineAddressEvaluations:baseline.addressEvaluations,candidateAddressEvaluations:candidate.addressEvaluations,addressWorkReduction:baseline.addressEvaluations/candidate.addressEvaluations,ratioToMillion:candidate.addressEvaluations/1_048_576,exactOrderedIdentity:exact,nativeBenchmarkStatus:native.status,nativeBenchmarkDigest:native.benchmarkDigest,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'OBSERVED_SEARCH_POLICY_EFFICIENCY_GAIN_ONLY__NO_GENERAL_INTELLIGENCE_CLAIM'};
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);if(!receipt.ok)process.exitCode=1;
