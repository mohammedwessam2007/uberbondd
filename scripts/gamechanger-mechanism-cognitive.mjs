#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { augmentCognitiveReceiptWithGamechangerMechanisms } from '../src/gamechanger-mechanism-cognitive.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=new Map();
for(let i=2;i<process.argv.length;i+=1){const arg=process.argv[i];if(!arg.startsWith('--'))continue;args.set(arg,process.argv[i+1]?.startsWith('--')?true:process.argv[++i]??true);}
const receiptPath=resolve(root,String(args.get('--receipt')||'artifacts/uberbond-cognitive-cycle-latest.json'));
const packPath=resolve(root,String(args.get('--pack')||'artifacts/gamechanger-mechanism-pack-latest.json'));
const outputPath=resolve(root,String(args.get('--output')||receiptPath));
async function readJson(path){try{return JSON.parse(await readFile(path,'utf8'));}catch{return null;}}
const receipt=await readJson(receiptPath), mechanismPack=await readJson(packPath);
const result=augmentCognitiveReceiptWithGamechangerMechanisms({receipt,mechanismPack,packRef:`artifact:${packPath}`});
if(!result.ok){console.error(JSON.stringify(result,null,2));process.exit(2);}
await writeFile(outputPath,JSON.stringify(result.receipt,null,2)+'\n','utf8');
console.log(JSON.stringify({status:result.status,addedEvents:result.addedEvents,addedRoutes:result.addedRoutes,addedActivations:result.addedActivations,output:outputPath,businessEffectAuthority:'NONE'},null,2));
