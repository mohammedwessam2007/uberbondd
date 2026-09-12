#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractConcepts, repoIndex } from './sovereign-coverage-matrix.mjs';
import { compileCoverageMatrix } from '../src/sovereign-coverage-matrix.mjs';
import { verifyCoverageStateEvidenceIntegrity } from '../src/coverage-state-evidence-integrity.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const readEntries=path=>JSON.parse(readFileSync(join(root,path),'utf8')).entries||[];
const FORECAST_ENGINE='Sovereign Option & Outcome Forecast Engine';
const LANE_BY_CLASS={PERSONAL_CIVILIZATION_ORGAN:'OMEGA-01',FORECAST_REQUIREMENT:'OMEGA-02',FORECAST_OUTPUT:'OMEGA-02',FORECAST_MECHANISM:'OMEGA-02',FORECAST_DIMENSION:'OMEGA-02',CALIBRATION_FIELD:'OMEGA-13',DECISION_PACKET_FIELD:'OMEGA-02',ONTOLOGY:'OMEGA-03',SOVEREIGNTY_DIMENSION:'OMEGA-04',AUTHORITY_LAW:'OMEGA-04',BOUNDARY:'OMEGA-04',COMPUTE_RUNTIME:'OMEGA-06',GENESIS_MECHANISM:'OMEGA-07',CAPABILITY_ATOM:'OMEGA-08',CAPABILITY_DOMAIN:'OMEGA-08',EXTERNAL_SUPPLIER:'OMEGA-08',REFERENCE_SURFACE:'OMEGA-09',ECONOMIC_DONOR:'OMEGA-09',STRATEGIC_STAGE:'OMEGA-09',NAMED_INITIATIVE:'OMEGA-14',HIERARCHY:'OMEGA-14',LOOP_STAGE:'OMEGA-14',TERMINAL_LAW:'OMEGA-14',ALIAS:'OMEGA-14',CONCEPT:'OMEGA-14'};

/**
 * A short canonical reference such as TGI can intentionally have zero
 * distinctive filename tokens. That is not an unknown implementation state:
 * REFERENCE_SURFACE canon explicitly means a mechanism/vendor/runtime reference
 * that UberBond must keep discoverable without pretending it is vendored or
 * installed. Normalize only the exact no-evidence shape. Any source/test hit,
 * any other class, or any other UNKNOWN remains untouched.
 */
export function normalizeShortReferenceSurfaces(matrix={}){
  if(!matrix?.ok||!Array.isArray(matrix.rows))return matrix;
  let normalized=0;
  const rows=matrix.rows.map(row=>{
    const evidence=row?.currentEvidence||{};
    const sources=Array.isArray(evidence.sourceModules)?evidence.sourceModules.filter(Boolean):[];
    const tests=Array.isArray(evidence.testModules)?evidence.testModules.filter(Boolean):[];
    const eligible=row?.class==='REFERENCE_SURFACE'
      && row?.currentState==='UNKNOWN'
      && evidence.matchStrength==='NO_DISTINCTIVE_TOKENS'
      && evidence.matchScope==='NONE'
      && sources.length===0
      && tests.length===0;
    if(!eligible)return row;
    normalized+=1;
    return{...row,currentState:'REFERENCE_ONLY_BY_CANON'};
  });
  if(normalized===0)return matrix;
  const byState={...(matrix.counts?.byState||{})};
  byState.UNKNOWN=Math.max(0,Number(byState.UNKNOWN||0)-normalized);
  byState.REFERENCE_ONLY_BY_CANON=Number(byState.REFERENCE_ONLY_BY_CANON||0)+normalized;
  return{...matrix,rows,counts:{...(matrix.counts||{}),byState}};
}

export function compileTerminalCoverage(){
  const {concepts,missingSources}=extractConcepts();
  if(missingSources.length)return{ok:false,status:'COVERAGE_SOURCE_MISSING',missingSources};
  let sourceCommit=null;try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
  let manifest,enforcement,externalGates;
  try{manifest=[...readEntries('artifacts/sovereign/implementation-manifest.json'),...readEntries('artifacts/sovereign/implementation-manifest-terminal-closure.json')];}
  catch(error){return{ok:false,status:'COVERAGE_TERMINAL_MANIFEST_UNREADABLE',detail:error.message};}
  try{enforcement=readEntries('artifacts/sovereign/enforcement-manifest.json');}
  catch(error){return{ok:false,status:'COVERAGE_ENFORCEMENT_UNREADABLE',detail:error.message};}
  try{externalGates=readEntries('artifacts/sovereign/external-gate-manifest.json');}
  catch(error){return{ok:false,status:'COVERAGE_EXTERNAL_GATES_UNREADABLE',detail:error.message};}
  const compiled=compileCoverageMatrix({concepts,repoIndex:repoIndex(),laneMap:LANE_BY_CLASS,manifest,enforcement,externalGates,sourceCommit});
  if(!compiled.ok)return compiled;
  const matrix=normalizeShortReferenceSurfaces(compiled);
  const integrity=verifyCoverageStateEvidenceIntegrity(matrix);
  if(!integrity.ok)return{ok:false,status:'COVERAGE_STATE_EVIDENCE_INTEGRITY_REFUSED',reasonCodes:integrity.reasonCodes,violations:integrity.violations,businessEffectAuthority:'NONE'};
  return{...matrix,stateEvidenceIntegrity:integrity.status};
}

export function writeTerminalCoverage(){
  const matrix=compileTerminalCoverage();
  if(!matrix.ok)return matrix;
  const output=join(root,'artifacts/sovereign/implementation-coverage-matrix.json');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,`${JSON.stringify(matrix,null,2)}\n`,'utf8');
  return{ok:true,status:matrix.status,counts:matrix.counts,stateEvidenceIntegrity:matrix.stateEvidenceIntegrity,output:'artifacts/sovereign/implementation-coverage-matrix.json',businessEffectAuthority:'NONE'};
}

const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){const out=writeTerminalCoverage();console.log(JSON.stringify(out,null,2));if(!out.ok)process.exitCode=2;}
