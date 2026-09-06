#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGamechangerMechanismPack } from '../src/gamechanger-mechanism-pack.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=new Map();
for(let i=2;i<process.argv.length;i+=1){const arg=process.argv[i];if(!arg.startsWith('--'))continue;args.set(arg,process.argv[i+1]?.startsWith('--')?true:process.argv[++i]??true);}
const seedPath=resolve(root,String(args.get('--seeds')||'data/gamechanger-mesh/manual-integration-seeds.json'));
const queuePath=resolve(root,String(args.get('--queue')||'artifacts/gamechanger-integration-queue-latest.json'));
const outputPath=resolve(root,String(args.get('--output')||'artifacts/gamechanger-mechanism-pack-latest.json'));
async function readJson(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch{return fallback;}}
const seedManifest=await readJson(seedPath,null);
const integrationQueue=await readJson(queuePath,null);
const result=compileGamechangerMechanismPack({seedManifest,integrationQueue});
if(!result.ok){console.error(JSON.stringify(result,null,2));process.exit(1);}
await mkdir(dirname(outputPath),{recursive:true});
await writeFile(outputPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({status:result.status,mechanismCount:result.pack.mechanismCount,runtimePrimitiveCount:result.pack.runtimePrimitiveCount,internallyIntegratedCount:result.pack.internallyIntegratedCount,targetOrganCount:result.pack.targetOrganCount,engineeringEligibleCount:result.pack.engineeringEligibleCount,allIdeasOperationalized:result.pack.allIdeasOperationalized,allIdeasBoundToExistingOrgans:result.pack.allIdeasBoundToExistingOrgans,output:outputPath,businessEffectAuthority:'NONE'},null,2));
