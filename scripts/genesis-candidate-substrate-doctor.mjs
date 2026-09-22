#!/usr/bin/env node
import fs from 'node:fs';
import { loadFounderMoonshotLiteralCorpus, validateFounderMoonshotLiteralCorpus } from '../src/founder-moonshot-literal-corpus.mjs';
import { buildMoonshotRealizationLedger } from '../src/moonshot-realization-factory.mjs';
import { compileMoonshotTechnologyTree } from '../src/moonshot-technology-tree-compiler.mjs';
import { compileMoonshotSubstrateMesh } from '../src/moonshot-substrate-mesh.mjs';
import { compileGenesisCandidateSubstrateBridge, compileGenesisCandidateProbeWave } from '../src/genesis-candidate-substrate-bridge.mjs';

const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const corpus=await loadFounderMoonshotLiteralCorpus({});
const validation=validateFounderMoonshotLiteralCorpus(corpus);
const nursery=readJson('./artifacts/genesis/GENESIS_LIVE_NURSERY_20260922.json');
const spine=readJson('./config/moonshot-common-ancestor-spine.json');
const overlay=readJson('./config/moonshot-realization-state-overlay.json');

let result=validation;
if(validation.ok){
  const ledger=buildMoonshotRealizationLedger({entries:corpus.entries});
  const tree=ledger.ok?compileMoonshotTechnologyTree({moonshots:ledger.rows,ancestorSpine:spine.ancestors||[],overlayEntries:overlay.entries||{}}):ledger;
  const mesh=tree.ok?compileMoonshotSubstrateMesh({moonshots:ledger.rows,technologyTree:tree,energyEquivalent:null,localCells:[],modelSuppliers:[]}):tree;
  const bridge=mesh.ok?compileGenesisCandidateSubstrateBridge({nursery,moonshotMesh:mesh}):mesh;
  const wave=bridge.ok?compileGenesisCandidateProbeWave({bridge,maxCandidates:8,minimumUtility:.8,requireVerifiedHouseEnergy:false}):bridge;
  result={bridge,wave};
}
const ok=result?.bridge?.ok===true&&result.bridge.candidateRouteCount===nursery.materializedCandidateCount&&result?.wave?.ok===true;
console.log(JSON.stringify({
  ok,
  status:ok?'GENESIS_CANDIDATE_SUBSTRATE_DOCTOR_HEALTHY':'GENESIS_CANDIDATE_SUBSTRATE_DOCTOR_INVALID',
  candidateRouteCount:result?.bridge?.candidateRouteCount||0,
  moonshotSourceCount:result?.bridge?.moonshotSourceCount||0,
  houseEnergy:result?.bridge?.houseEnergy||null,
  probeWaveCount:result?.wave?.candidateCount||0,
  topCandidateIds:(result?.wave?.candidates||[]).map(x=>x.candidateId),
  externalEffectAuthority:result?.bridge?.externalEffectAuthority||'NONE',
  truthBoundary:result?.bridge?.truthBoundary||null
},null,2));
if(!ok) process.exitCode=1;
