#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compileUberBondCognitiveGraph, cognitiveGraphIntegrity } from '../src/uberbond-cognitive-graph.mjs';
import { compileClosedLoopActivation } from '../src/uberbond-cognitive-bus.mjs';
import { compileWallbreakerReflexes } from '../src/wallbreaker-cognitive-reflex.mjs';

const execFileAsync=promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const output=path.resolve(arg('--output')||path.join(root,'artifacts','uberbond-cognitive-cycle-latest.json'));
const feedbackPath=arg('--autonomic-events')?path.resolve(arg('--autonomic-events')):null;
const temp=path.join(os.tmpdir(),`uberbond-cognitive-base-${process.pid}-${Date.now()}.json`);
async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return null;}}
function invalid(status,reasonCodes){return{ok:false,status,reasonCodes,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};}

try{
  const run=await execFileAsync(process.execPath,['scripts/uberbond-cognitive-cycle.mjs','--output',temp],{cwd:root,timeout:120_000,maxBuffer:8_000_000});
  const base=await readJson(temp);
  if(!base||base.schemaVersion!=='uberbond.cognitive-cycle.v1'||base.externalEffectAuthority!=='NONE'){
    process.stderr.write(`${JSON.stringify(invalid('AUTONOMIC_COGNITIVE_BASE_INVALID',['canonical-base-cycle-required']),null,2)}\n`);process.exit(2);
  }
  const feedback=feedbackPath?await readJson(feedbackPath):null;
  if(feedbackPath&&(!feedback||feedback.schemaVersion!=='uberbond.autonomic-feedback-events.v1'||feedback.externalEffectAuthority!=='NONE'||!Array.isArray(feedback.events))){
    process.stderr.write(`${JSON.stringify(invalid('AUTONOMIC_FEEDBACK_INVALID',['validated-autonomic-feedback-required']),null,2)}\n`);process.exit(2);
  }
  const feedbackEvents=feedback?.events||[];
  const bad=feedbackEvents.filter(event=>event?.ok!==true||event?.status!=='COGNITIVE_EVENT_READY');
  if(bad.length){process.stderr.write(`${JSON.stringify(invalid('AUTONOMIC_FEEDBACK_INVALID',['feedback-contains-invalid-cognitive-event']),null,2)}\n`);process.exit(2);}
  const graph=compileUberBondCognitiveGraph();const integrity=cognitiveGraphIntegrity(graph);
  if(!graph.ok||!integrity.ok){process.stderr.write(`${JSON.stringify(invalid('AUTONOMIC_COGNITIVE_GRAPH_INVALID',['integral-cognitive-graph-required']),null,2)}\n`);process.exit(2);}
  const events=[...(base.events||[]),...feedbackEvents];
  const cycle=compileClosedLoopActivation({graph,events});
  if(!cycle.ok){process.stderr.write(`${JSON.stringify(cycle,null,2)}\n`);process.exit(2);}
  const wallbreaker=compileWallbreakerReflexes(events);
  if(!wallbreaker.ok){process.stderr.write(`${JSON.stringify(wallbreaker,null,2)}\n`);process.exit(2);}
  const receipt={...base,generatedAt:new Date().toISOString(),sources:{...(base.sources||{}),autonomicFeedback:Boolean(feedback)},autonomicFeedback:feedback?{feedbackDigest:feedback.feedbackDigest||null,eventCount:feedbackEvents.length,metabolismReceiptId:feedback.metabolismReceiptId||null,revenueReceiptId:feedback.revenueReceiptId||null}:null,events,activationSummary:{eventCount:cycle.eventCount,activationCount:cycle.activationCount,targetCounts:cycle.targetCounts},routes:cycle.routes,wallbreaker:{reflexCount:wallbreaker.reflexCount,failureClassCounts:wallbreaker.failureClassCounts,countermoveCounts:wallbreaker.countermoveCounts,reflexes:wallbreaker.reflexes},businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:`${base.truthBoundary||''} AUTONOMIC FEEDBACK EVENTS ARE VERIFIED LOCAL RECEIPTS ONLY; THEIR ROUTING DOES NOT CREATE EXTERNAL CONSEQUENCE AUTHORITY.`.trim()};
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,`${JSON.stringify(receipt,null,2)}\n`,{mode:0o600});
  process.stdout.write(`${JSON.stringify({ok:true,status:'UBERBOND_AUTONOMIC_COGNITIVE_CYCLE_COMPILED',events:cycle.eventCount,activations:cycle.activationCount,feedbackEvents:feedbackEvents.length,targetCounts:cycle.targetCounts,output,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'},null,2)}\n`);
}finally{await fs.rm(temp,{force:true}).catch(()=>{});}
