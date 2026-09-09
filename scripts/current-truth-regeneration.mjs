#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCurrentRealityFreeze } from './current-reality-freeze.mjs';
import { verifyCurrentTruthRegenerationWithReferenceIntegrity } from '../src/current-truth-reference-integrity.mjs';
import { truthInputDirtyPaths } from '../src/current-truth-regeneration.mjs';
export { truthInputDirtyPaths } from '../src/current-truth-regeneration.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function git(args,{trim=true}={}){try{const out=execFileSync('git',args,{cwd:root,encoding:'utf8'}).replace(/\r/g,'');return trim?out.trim():out;}catch{return null;}}
function readJson(relative){try{return JSON.parse(readFileSync(join(root,relative),'utf8'));}catch{return{};}}
function run(command,args){const result=spawnSync(command,args,{cwd:root,env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);return{command:[command,...args].join(' '),exitCode:result.status??1,started:!result.error,error:result.error?String(result.error.message||result.error):null};}
export function parseGitPorcelainPaths(porcelain=''){return String(porcelain).split('\n').filter(Boolean).map(line=>{const path=line.slice(3).trim();return path.includes(' -> ')?path.split(' -> ').at(-1):path;}).filter(Boolean);}
export function newlyDirtyPaths(before=[],after=[]){const prior=new Set(Array.isArray(before)?before:[]);return [...new Set((Array.isArray(after)?after:[]).filter(path=>!prior.has(path)))].sort();}
export function parseTrackedPaths(output=''){return [...new Set(String(output).split('\n').map(path=>path.trim()).filter(Boolean))].sort();}
function trackedPaths(){const output=git(['ls-files'],{trim:false});return output===null?null:parseTrackedPaths(output);}
function dirtyPaths(){const porcelain=git(['status','--porcelain'],{trim:false});return porcelain===null?null:parseGitPorcelainPaths(porcelain);}
export function executeCurrentTruthRegeneration(){
 const headSha=git(['rev-parse','HEAD']);const before=dirtyPaths();const tracked=trackedPaths();if(!headSha||before===null||tracked===null||tracked.length===0)return{ok:false,status:'CURRENT_TRUTH_REGENERATION_REFUSED',reasonCodes:['git-head-status-and-tracked-tree-required'],businessEffectAuthority:'NONE'};
 const dirtyTruthInputs=truthInputDirtyPaths(before);if(dirtyTruthInputs.length)return{ok:false,status:'CURRENT_TRUTH_REGENERATION_REFUSED',reasonCodes:['clean-truth-input-checkout-required-before-regeneration'],dirtyTruthInputsBefore:dirtyTruthInputs,ignoredPreexistingWorkspaceDirt:before.filter(p=>!dirtyTruthInputs.includes(p)),businessEffectAuthority:'NONE'};
 const readinessRun=run('node',['scripts/system-readiness.mjs']);if(readinessRun.exitCode!==0)return{ok:false,status:'CURRENT_TRUTH_REGENERATION_REFUSED',reasonCodes:['readiness-generator-failed'],generatorResults:{readiness:readinessRun},businessEffectAuthority:'NONE'};
 const coverageRun=run('node',['scripts/sovereign-coverage-matrix.mjs']);if(coverageRun.exitCode!==0)return{ok:false,status:'CURRENT_TRUTH_REGENERATION_REFUSED',reasonCodes:['coverage-generator-failed'],generatorResults:{readiness:readinessRun,coverage:coverageRun},businessEffectAuthority:'NONE'};
 const leafGraphRun=run('node',['scripts/canonical-execution-leaf-materializer.mjs']);if(leafGraphRun.exitCode!==0)return{ok:false,status:'CURRENT_TRUTH_REGENERATION_REFUSED',reasonCodes:['canonical-leaf-graph-generator-failed'],generatorResults:{readiness:readinessRun,coverage:coverageRun,leafGraph:leafGraphRun},businessEffectAuthority:'NONE'};
 const readiness=readJson('artifacts/system-readiness.json');const coverage=readJson('artifacts/sovereign/implementation-coverage-matrix.json');const leafGraph=readJson('artifacts/sovereign/canonical-execution-leaf-graph.json');const freeze=buildCurrentRealityFreeze({rootDir:root});const after=dirtyPaths();
 return verifyCurrentTruthRegenerationWithReferenceIntegrity({headSha,readiness,coverage,leafGraph,freeze,trackedPaths:tracked,dirtyPaths:newlyDirtyPaths(before,after||[]),preRegenerationDirtyPaths:before,generatorResults:{readiness:readinessRun,coverage:coverageRun,leafGraph:leafGraphRun}});
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);if(direct){const receipt=executeCurrentTruthRegeneration();process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);if(!receipt.ok)process.exitCode=1;}