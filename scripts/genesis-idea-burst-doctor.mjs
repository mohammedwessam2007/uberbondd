#!/usr/bin/env node
import fs from 'node:fs';
import { compileGenesisIdeaBurst } from '../src/genesis-idea-burst.mjs';

const path=process.argv[2]||'artifacts/genesis/GENESIS_LIVE_NURSERY_20260922.json';
const artifact=JSON.parse(fs.readFileSync(path,'utf8'));
const result=compileGenesisIdeaBurst({
  signal:artifact.signal,
  affectedDomains:artifact.affectedDomains,
  candidates:artifact.candidates,
  maxGenerators:artifact.activationPolicy?.maxGenerators||12,
  candidateBudgetPerGenerator:artifact.activationPolicy?.candidateBudgetPerGenerator||50
});
const selected=result?.activation?.selectedGeneratorKeys||[];
const declared=artifact.activatedGeneratorKeys||[];
const exactKeys=result.ok&&JSON.stringify(selected)===JSON.stringify(declared);
const ok=result.ok&&result.materializedCandidateCount===artifact.materializedCandidateCount&&exactKeys;
console.log(JSON.stringify({
  ok,
  status:ok?'GENESIS_LIVE_NURSERY_HEALTHY':'GENESIS_LIVE_NURSERY_INVALID',
  materializedCandidateCount:result.materializedCandidateCount||0,
  selectedGeneratorCount:selected.length,
  selectedFirstGenerationCapacity:result?.activation?.selectedFirstGenerationCapacity||0,
  burstDigest:result.burstDigest||null,
  exactActivatedGeneratorKeys:exactKeys,
  externalEffectAuthority:result.externalEffectAuthority||'NONE',
  truthBoundary:result.truthBoundary||null
},null,2));
if(!ok) process.exitCode=1;
