#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { UBER_SOVEREIGN_LAYERS } from '../src/uber-sovereign-stack.mjs';
import { compileOrganCallabilityInventory } from '../src/organ-callability-inventory.mjs';
import { reachableFromEntryPoints, FOUNDER_INTERACTIVE_ENTRY_POINTS } from './system-readiness.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function gitHead(){try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim().toLowerCase();}catch{return'';}}
function listEntryPoints(dir,extension='.mjs'){const found=[];const walk=relative=>{let entries=[];try{entries=fs.readdirSync(path.join(root,relative),{withFileTypes:true});}catch{return;}for(const entry of entries){const child=`${relative}/${entry.name}`;if(entry.isDirectory())walk(child);else if(entry.name.endsWith(extension))found.push(child);}};walk(dir);return found.sort();}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function atomicWrite(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});fs.renameSync(tmp,file);}
function classification(){return readJson(path.join(root,'config','reachability-classification.json'))||{modules:{}};}
function sourceFacts(){
  const api=listEntryPoints('api');const scripts=listEntryPoints('scripts');const unattendedScripts=scripts.filter(file=>!FOUNDER_INTERACTIVE_ENTRY_POINTS.includes(file));
  const production=reachableFromEntryPoints(['server.mjs','worker.mjs','scripts/agent-mesh-tick.mjs',...api]);
  const unattended=reachableFromEntryPoints(['server.mjs','worker.mjs','scripts/agent-mesh-tick.mjs',...api,...unattendedScripts]);
  const modules=classification().modules||{};const refs=[...new Set(UBER_SOVEREIGN_LAYERS.flatMap(layer=>layer.sourceRefs||[]))];const facts={};
  for(const ref of refs){const full=path.join(root,ref);let stat=null;try{stat=fs.lstatSync(full);}catch{};facts[ref]={exists:Boolean(stat&&(stat.isFile()||stat.isSymbolicLink()===false)),isTest:ref.startsWith('tests/'),productionReachable:production.has(ref),unattendedReachable:unattended.has(ref),operatorEntryPoint:ref.startsWith('ops/')&&Boolean(stat?.isFile()),apiEntryPoint:ref.startsWith('api/')&&Boolean(stat?.isFile()),classification:modules[ref]||null};}
  return facts;
}

const sourceCommit=gitHead();
const runtimePath=process.env.UBERBOND_ORGAN_RUNTIME_EVIDENCE_PATH?path.resolve(process.env.UBERBOND_ORGAN_RUNTIME_EVIDENCE_PATH):path.join(root,'artifacts','runtime','organ-callability-evidence.json');
const outputPath=process.env.UBERBOND_ORGAN_CALLABILITY_OUTPUT?path.resolve(process.env.UBERBOND_ORGAN_CALLABILITY_OUTPUT):path.join(root,'artifacts','sovereign','organ-callability-inventory.json');
const runtimeEvidence=readJson(runtimePath);
const result=compileOrganCallabilityInventory({sourceCommit,layers:UBER_SOVEREIGN_LAYERS,sourceFacts:sourceFacts(),runtimeEvidence,generatedAt:new Date()});
atomicWrite(outputPath,result);
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
if(!result.ok)process.exitCode=2;
