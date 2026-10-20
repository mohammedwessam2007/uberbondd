#!/usr/bin/env node
import fs from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectPhoenixRealizationLedger} from '../src/phoenix-ten-wave-realization-ledger.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=join(root,'artifacts/capability-genome/research/phoenix-wave-realization-ledger.json');
const [mode='status',arg1,arg2]=process.argv.slice(2);
const allowed=(mode==='status'&&arg1===undefined)||(mode==='verify'&&arg1===undefined)||
  (mode==='write-artifact'&&arg1===undefined)||(mode==='record'&&/^(phoenix-capability|phoenix-wave(?:[3-9]|10))-[0-9]{4}$/.test(arg1||'')&&arg2===undefined)||
  (mode==='wave'&&/^(?:[3-9]|10)$/.test(arg1||'')&&arg2===undefined);
if(!allowed){
  process.stdout.write(JSON.stringify({ok:false,status:'REALIZATION_REQUEST_REFUSED',reason:'FIXED_MODES_ONLY_NO_ARBITRARY_EXECUTION'})+'\n');
  process.exitCode=2;
}else {
  const report=inspectPhoenixRealizationLedger({executeLocalTests:mode==='verify'});
  if(!report.ok){console.log(JSON.stringify({ok:false,status:report.status,reason:'CORPUS_OR_TEST_GUARD_REFUSED'}));process.exitCode=1;}
  else if(mode==='write-artifact'){
    fs.mkdirSync(dirname(output),{recursive:true});
    if(fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink())throw new Error('RESEARCH_ARTIFACT_SYMLINK_REFUSED');
    const artifact={...report,records:report.records.map(r=>({
      id:r.id,wave:r.wave,originalSourcePath:r.originalSourcePath,
      originalSourcePointer:r.originalSourcePointer,sourceWaveSha256:r.sourceWaveSha256,
      implementationAssessment:r.implementationAssessment,
      ...(r.localImplementation?{localImplementation:r.localImplementation}:{}),
      autoAdmission:'DENIED',supplierPromotion:'NONE',externalEffects:'NONE'
    }))};
    fs.writeFileSync(output,JSON.stringify(artifact,null,2)+'\n');
    console.log(JSON.stringify({ok:true,status:'RESEARCH_ONLY_REALIZATION_ARTIFACT_SAVED',path:'artifacts/capability-genome/research/phoenix-wave-realization-ledger.json',summary:report.summary,ledgerDigest:report.ledgerDigest}));
  }else if(mode==='record'){
    const record=report.records.find(x=>x.id===arg1);
    if(!record){console.log(JSON.stringify({ok:false,status:'NO_SUCH_PINNED_RECORD'}));process.exitCode=1;}
    else console.log(JSON.stringify({ok:true,status:'SOURCE_LINKED_CAPABILITY_REALIZATION',record}));
  }else if(mode==='wave'){
    console.log(JSON.stringify({ok:true,status:'WAVE_REALIZATION_STATUS',wave:Number(arg1),
      summary:report.summary,records:report.records.filter(x=>x.wave===Number(arg1)).map(x=>({
        id:x.id,implementationAssessment:x.implementationAssessment,
        ...(x.localImplementation?{testState:x.localImplementation.testState,scope:x.localImplementation.narrowScope}:{})
      }))}));
  }else {
    const {records,...meta}=report;
    console.log(JSON.stringify(meta,null,2));
  }
}
