import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {compileCrownTournament,adjudicateCrownTournament} from '../src/crown-tournament.mjs';

const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const fail=(reason,detail={})=>{console.error(JSON.stringify({ok:false,status:'CROWN_TOURNAMENT_EVIDENCE_REFUSED',reason,...detail,semanticAuthority:'NONE'},null,2));process.exit(2);};
const inputPath=arg('--input'),outputPath=arg('--output');
if(!inputPath)fail('private-evidence-input-required');
let input;try{input=JSON.parse(fs.readFileSync(path.resolve(inputPath),'utf8'));}catch(e){fail('input-read-failed:'+e.message);}
if(input?.schemaVersion!=='uberbond.infinite-opus.crown-tournament-evidence.v1')fail('schema-mismatch');
if(input.sealedCustodianIndependent!==true)fail('independent-sealed-custodian-required');
if(input.rawHiddenPromptsExposedToOptimizer===true||input.plaintextAnswersExposedBeforeEvaluation===true)fail('sealed-task-leakage-refused');
const compiled=compileCrownTournament({
 candidateSnapshotHash:input.candidateSnapshotHash,hiddenTasks:input.hiddenTasks,candidates:input.candidates,budgetAuthorizationRef:input.budgetAuthorizationRef
});
if(!compiled.ok)fail(compiled.status);
const adjudicated=adjudicateCrownTournament({plan:compiled.plan,observations:input.observations});
if(!adjudicated.ok||adjudicated.status!=='TASK_CLASS_CROWN_CANDIDATE_EVIDENCE_READY')fail(adjudicated.status);
const general=adjudicated.roles?.GENERAL_CROWN;
if(!general||general.model!=='anthropic/claude-opus-5.5')fail('general-crown-opus-5-5-not-supported-by-sealed-evidence',{observedCandidate:general?.model??null});
const sealedRefs=[...new Set((input.observations??[]).filter(o=>o.role==='GENERAL_CROWN'&&o.model===general.model).map(o=>o.sealedTrialRef).filter(Boolean))].sort();
if(sealedRefs.length<2)fail('at-least-two-independent-general-crown-sealed-trials-required');
const body={
 schemaVersion:'uberbond.infinite-opus.crown-tournament-receipt.v1',
 observedAt:new Date().toISOString(),candidateSnapshotHash:input.candidateSnapshotHash,
 budgetAuthorizationRef:input.budgetAuthorizationRef,generalCrown:general,sealedTrialRefs:sealedRefs,
 sealedCustodianIndependent:true,rawHiddenPromptsExposedToOptimizer:false,plaintextAnswersExposedBeforeEvaluation:false,
 adjudicationStatus:adjudicated.status,semanticAuthority:'NONE',
 claimBoundary:'This receipt supplies bounded task-class tournament evidence only. It does not itself grant Crown authority.'
};
const receiptHash='sha256:'+crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
const receipt={...body,receiptHash};
if(outputPath)fs.writeFileSync(path.resolve(outputPath),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({ok:true,status:'GENERAL_CROWN_TOURNAMENT_EVIDENCE_READY',receipt,semanticAuthority:'NONE'},null,2));
