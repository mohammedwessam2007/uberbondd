#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileNeuralAtlasPlan,NEURAL_REPOSITORY_TARGET} from '../src/neural-repository-atlas.mjs';
import {executeGithubRepositorySearch,buildMeasuredRepositoryCorpus,writeMeasuredCorpusBatch} from '../src/capability-genome-harvest.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=new Map(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i===-1?[arg,true]:[arg.slice(0,i),arg.slice(i+1)];}));
const offset=Math.max(0,Number(args.get('--offset')||0));
const batchSize=Math.max(1,Math.min(100,Number(args.get('--batch-size')||20)));
const maxProviderCalls=Math.max(1,Math.min(1000,Number(args.get('--max-provider-calls')||100)));
const plan=compileNeuralAtlasPlan({target:Number(args.get('--target')||NEURAL_REPOSITORY_TARGET),pushedAfter:args.get('--pushed-after')||null});
const slice=plan.queries.slice(offset,offset+batchSize);
const partitions=slice.map((q,i)=>({id:`neural_${offset+i}`,query:q.query,perPage:100,maxPages:10,family:q.family,starBand:q.starBand}));

if(!args.has('--execute-github')){
 console.log(JSON.stringify({ok:true,status:'NEURAL_HARVEST_PLAN_ONLY',target:plan.target,totalQueries:plan.queryCount,offset,batchSize,selectedQueries:slice,nextOffset:Math.min(plan.queryCount,offset+slice.length),networkReadsExecuted:false},null,2));
 process.exit(0);
}
if(process.env.UBERBOND_CAPABILITY_GENOME_NETWORK_READS!=='1'){
 console.log(JSON.stringify({ok:false,status:'NEURAL_HARVEST_NETWORK_READS_NOT_AUTHORIZED',reasonCodes:['set-UBERBOND_CAPABILITY_GENOME_NETWORK_READS=1'],businessEffectAuthority:'NONE'},null,2));
 process.exit(2);
}
if(!process.env.UBERBOND_CAPABILITY_GENOME_CORPUS_DIR){
 console.log(JSON.stringify({ok:false,status:'NEURAL_HARVEST_CORPUS_DIR_REQUIRED',reasonCodes:['UBERBOND_CAPABILITY_GENOME_CORPUS_DIR-required'],businessEffectAuthority:'NONE'},null,2));
 process.exit(2);
}
if(slice.length===0){console.log(JSON.stringify({ok:true,status:'NEURAL_HARVEST_PLAN_EXHAUSTED',offset,totalQueries:plan.queryCount},null,2));process.exit(0);}

const execution=await executeGithubRepositorySearch({partitions,maxProviderCalls});
const corpus=Array.isArray(execution.queryReceipts)&&execution.queryReceipts.length?buildMeasuredRepositoryCorpus({sourceId:'github-public-capability-search',queryReceipts:execution.queryReceipts,observedAt:new Date()}):null;
const stored=corpus?.ok?writeMeasuredCorpusBatch({corpusDir:process.env.UBERBOND_CAPABILITY_GENOME_CORPUS_DIR,corpus,repositoryRoot:root}):null;
console.log(JSON.stringify({ok:Boolean(execution.ok&&corpus?.ok&&stored?.ok),status:'NEURAL_HARVEST_BATCH_FINISHED',target:plan.target,totalQueries:plan.queryCount,offset,batchSize:slice.length,nextOffset:Math.min(plan.queryCount,offset+slice.length),providerCalls:execution.providerCalls||0,distinctRepositoryCandidates:corpus?.manifest?.distinctRepositoryCandidates||0,partitionsRequiringRefinement:execution.partitionsRequiringRefinement||[],storage:stored?.ok?{status:stored.status,batchId:stored.batchId,batchDir:stored.batchDir}:stored,truthBoundary:'BATCH_RECEIPTS_ARE_DISCOVERY_EVIDENCE_ONLY_NOT_50000_COMPLETION_NOT_RUNTIME_APPROVAL'},null,2));
if(!(execution.ok&&corpus?.ok&&stored?.ok))process.exitCode=1;
