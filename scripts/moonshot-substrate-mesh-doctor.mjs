import fs from 'node:fs';
import { loadFounderMoonshotLiteralCorpus, validateFounderMoonshotLiteralCorpus } from '../src/founder-moonshot-literal-corpus.mjs';
import { buildMoonshotRealizationLedger } from '../src/moonshot-realization-factory.mjs';
import { compileMoonshotTechnologyTree } from '../src/moonshot-technology-tree-compiler.mjs';
import { compileMoonshotSubstrateMesh } from '../src/moonshot-substrate-mesh.mjs';

const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const corpus=await loadFounderMoonshotLiteralCorpus({});
const validation=validateFounderMoonshotLiteralCorpus(corpus);
const spine=readJson('./config/moonshot-common-ancestor-spine.json');
const overlay=readJson('./config/moonshot-realization-state-overlay.json');

if(!validation.ok){
  process.stdout.write(JSON.stringify(validation,null,2)+'\n');
  process.exitCode=1;
}else{
  const ledger=buildMoonshotRealizationLedger({entries:corpus.entries});
  const tree=ledger.ok?compileMoonshotTechnologyTree({
    moonshots:ledger.rows,
    ancestorSpine:spine.ancestors||[],
    overlayEntries:overlay.entries||{}
  }):ledger;
  const mesh=tree.ok?compileMoonshotSubstrateMesh({
    moonshots:ledger.rows,
    technologyTree:tree,
    energyEquivalent:null,
    localCells:[],
    modelSuppliers:[]
  }):tree;
  process.stdout.write(JSON.stringify({
    schema:'uberbond.moonshot-substrate-mesh-doctor.v1',
    ok:mesh.ok,
    status:mesh.status,
    routeCount:mesh.routeCount||0,
    firstStableId:mesh.firstStableId||null,
    lastStableId:mesh.lastStableId||null,
    houseEnergy:mesh.houseEnergy||null,
    internalRealityCount:mesh.internalRealityCount||0,
    externalRealityCount:mesh.externalRealityCount||0,
    truthBoundary:mesh.truthBoundary||null
  },null,2)+'\n');
  if(!mesh.ok||mesh.routeCount!==890) process.exitCode=1;
}
