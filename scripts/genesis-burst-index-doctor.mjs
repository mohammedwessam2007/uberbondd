#!/usr/bin/env node
import fs from 'node:fs';
import { compileGenesisBurstRegistry } from '../src/genesis-burst-registry.mjs';

const index=JSON.parse(fs.readFileSync('./artifacts/genesis/GENESIS_BURST_INDEX.json','utf8'));
const bursts=index.bursts.map(row=>({
  burstId:row.burstId,
  artifactRef:row.artifactRef,
  payload:JSON.parse(fs.readFileSync(row.artifactRef,'utf8'))
}));
const result=compileGenesisBurstRegistry({bursts});
const declared=index.bursts.reduce((sum,row)=>sum+Number(row.materializedCandidateCount||0),0);
const ok=result.ok&&result.burstCount===index.bursts.length&&result.totalMaterializedCandidates===declared;
console.log(JSON.stringify({
  ok,
  status:ok?'GENESIS_BURST_INDEX_HEALTHY':'GENESIS_BURST_INDEX_INVALID',
  burstCount:result.burstCount||0,
  totalMaterializedCandidates:result.totalMaterializedCandidates||0,
  totalSelectedFirstGenerationCapacity:result.totalSelectedFirstGenerationCapacity||0,
  bursts:result.bursts||[],
  externalEffectAuthority:result.externalEffectAuthority||'NONE',
  truthBoundary:result.truthBoundary||null
},null,2));
if(!ok) process.exitCode=1;
