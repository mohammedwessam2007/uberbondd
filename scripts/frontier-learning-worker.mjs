#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFrontierLearningRuntimePlan, runFrontierLearningCycle } from '../src/frontier-learning-runtime.mjs';
import { adaptGamechangerReceipt } from '../src/gamechanger-frontier-learning-adapter.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2);
const args=new Map();for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--'))args.set(a,argv[i+1]?.startsWith('--')?true:argv[++i]??true);}
if(args.has('--plan')){console.log(JSON.stringify(buildFrontierLearningRuntimePlan(),null,2));process.exit(0);}

function readJson(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
const inputPath=path.resolve(root,String(args.get('--gamechanger')||'artifacts/gamechanger-mesh-latest.json'));
const raw=process.stdin.isTTY?'':fs.readFileSync(0,'utf8').trim();
let observations=[];let inputMode='GAMECHANGER_RECEIPT';let adapterReceipt=null;
if(raw){const payload=JSON.parse(raw);observations=Array.isArray(payload.observations)?payload.observations:[];inputMode='POLICY_CLEARED_STDIN';}
else{
  const receipt=readJson(inputPath,null);
  if(receipt){adapterReceipt=adaptGamechangerReceipt(receipt);observations=adapterReceipt.ok?adapterReceipt.observations:[];}
}
const cycle=runFrontierLearningCycle({observations,maxInvestigations:Number(args.get('--max-investigations')||8)});
console.log(JSON.stringify({schemaVersion:'uberbond.frontier-learning-worker.v1',inputMode,inputPath:inputMode==='GAMECHANGER_RECEIPT'?inputPath:null,adapterReceipt,cycle,executionAuthority:'NONE'},null,2));
