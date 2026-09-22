import fs from 'node:fs';
import { buildMoonshotRealizationLedger } from '../src/moonshot-realization-factory.mjs';
import { compileMoonshotTechnologyTree } from '../src/moonshot-technology-tree-compiler.mjs';
import { compileMoonshotSubstrateMesh } from '../src/moonshot-substrate-mesh.mjs';

const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const corpus=readJson('./artifacts/research/FOUNDER_MOONSHOT_LITERAL_CORPUS_890.json');
const spine=readJson('./config/moonshot-common-ancestor-spine.json');
const overlay=readJson('./config/moonshot-realization-state-overlay.json');

const entries=Array.isArray(corpus)?corpus:(corpus.entries||[]);
const ledger=buildMoonshotRealizationLedger({entries});
if(!ledger.ok){
  process.stdout.write(JSON.stringify(ledger,null,2)+'\n');
  process.exitCode=1;
}else{
  const tree=compileMoonshotTechnologyTree({
    moonshots:ledger.rows,
    ancestorSpine:spine.ancestors||[],
    overlayEntries:overlay.entries||{}
  });
  const mesh=compileMoonshotSubstrateMesh({
    moonshots:ledger.rows,
    technologyTree:tree,
    energyEquivalent:null,
    localCells:[],
    modelSuppliers:[]
  });
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
