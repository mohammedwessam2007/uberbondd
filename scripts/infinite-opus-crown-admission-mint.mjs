import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {issueCrownAdmissionReceipt} from '../src/crown-admission.mjs';

const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const fail=(reason)=>{console.error(JSON.stringify({ok:false,status:'CROWN_ADMISSION_MINT_REFUSED',reason,semanticAuthority:'NONE'},null,2));process.exit(2);};
const tournamentPath=arg('--tournament'),evidencePath=arg('--call-evidence'),outputPath=arg('--output');
if(!tournamentPath||!evidencePath)fail('tournament-and-call-evidence-required');
let tournament,evidence;try{tournament=JSON.parse(fs.readFileSync(path.resolve(tournamentPath),'utf8'));evidence=JSON.parse(fs.readFileSync(path.resolve(evidencePath),'utf8'));}catch(e){fail('input-read-failed:'+e.message);}
if(tournament?.schemaVersion!=='uberbond.infinite-opus.crown-tournament-receipt.v1')fail('tournament-schema-mismatch');
const {receiptHash,...body}=tournament;
const expected='sha256:'+crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
if(receiptHash!==expected)fail('tournament-receipt-integrity-failed');
if(tournament.generalCrown?.model!=='anthropic/claude-opus-5.5'||tournament.adjudicationStatus!=='TASK_CLASS_CROWN_CANDIDATE_EVIDENCE_READY')fail('general-crown-tournament-evidence-insufficient');
if(!Array.isArray(tournament.sealedTrialRefs)||tournament.sealedTrialRefs.length<2)fail('sealed-trial-evidence-insufficient');
if(evidence?.schemaVersion!=='uberbond.infinite-opus.crown-call-evidence.v1')fail('call-evidence-schema-mismatch');
if(evidence.exactModelId!=='anthropic/claude-opus-5.5'||evidence.taskClassRole!=='GENERAL_CROWN')fail('call-evidence-model-or-role-mismatch');
if(evidence.providerIdentity!=='Anthropic')fail('observed-anthropic-provider-required');
if(evidence.routeIdentity!=='openrouter:auto-provider-zdr-deny-required-parameters-v1')fail('governed-route-identity-required');
if(evidence.providerBillObserved!==true||evidence.modelIdentityVerified!==true||evidence.modelCallabilityVerified!==true)fail('observed-live-provider-evidence-required');
const receiptResult=issueCrownAdmissionReceipt({
 ...evidence,
 tournamentEvidenceVerified:true,
 roleTournamentEvidenceRef:'tournament://'+tournament.receiptHash,
 evidenceReferences:[...new Set([...(evidence.evidenceReferences??[]),...tournament.sealedTrialRefs,'tournament://'+tournament.receiptHash])],
 sideEffectAuthority:'NONE',
 authorizationStatus:'AUTHORIZED_FOR_THIS_CALL'
});
if(!receiptResult.ok)fail(receiptResult.reasons?.join('|')||receiptResult.status);
if(outputPath)fs.writeFileSync(path.resolve(outputPath),JSON.stringify(receiptResult.receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({ok:true,status:'GENERAL_CROWN_ADMISSION_MINTED',receipt:receiptResult.receipt,
 semanticAuthority:receiptResult.semanticAuthority,spendPerformed:false,
 truthBoundary:'Minting performs no provider call. Authority is derived only from the supplied live bill/model/callability evidence plus sealed tournament receipt.'},null,2));
