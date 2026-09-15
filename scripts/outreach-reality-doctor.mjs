#!/usr/bin/env node
import fs from 'node:fs';
import { verifySendingDomainDns } from '../src/dns-verification.mjs';
import { UBERDOSO_ROOTS } from '../src/uberdoso-kernel.mjs';
import { compileUberDosoActivation } from '../src/uberdoso-activation.mjs';
import { compileUberLaunchRuntimeEvidence } from '../src/uberlaunch-runtime-evidence.mjs';
export const OUTREACH_REALITY_DOCTOR_VERSION='uberbond.outreach-reality-doctor.v1';
const DEFAULTS={evidence:'/var/lib/uberbond-control/outreach-100k-evidence.json',candidates:'/var/lib/uberbond-control/outreach-100k-candidates.ndjson',corpus:'/var/lib/uberbond-control/outreach-100k-corpus.ndjson',bundle:'/var/lib/uberbond-control/outreach-100k-runtime-bundle.json'};
const regular=p=>{try{const s=fs.lstatSync(p);return s.isFile()&&!s.isSymbolicLink()&&s.size>0;}catch{return false;}};
const json=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}};
export async function runOutreachRealityDoctor({paths=DEFAULTS,resolver,now=new Date()}={}){
 const dns={}; for(const domain of UBERDOSO_ROOTS) dns[domain]=await verifySendingDomainDns({domain,resolver,date:now});
 const evidence=regular(paths.evidence)?json(paths.evidence):null;
 const runtimeEvidence=compileUberLaunchRuntimeEvidence(evidence?.runtimeEvidence||evidence||{});
 const artifacts={evidence:regular(paths.evidence),candidates:regular(paths.candidates),corpus:regular(paths.corpus),bundle:regular(paths.bundle)};
 const activation=compileUberDosoActivation(evidence?.uberdosoActivation||{}); const blockers=[];
 for(const [domain,result] of Object.entries(dns)) if(result.overallStatus!=='GREEN') blockers.push(`dns-not-green:${domain}:${result.overallStatus}`);
 if(!artifacts.evidence) blockers.push('runtime-evidence-file-missing'); if(!artifacts.candidates) blockers.push('precleared-candidates-file-missing');
 if(runtimeEvidence.state!=='RUNTIME_EVIDENCE_READY') blockers.push(...runtimeEvidence.waitReasonCodes);
 if(!activation.ok) blockers.push(...activation.reasonCodes.map(x=>`uberdoso:${x}`));
 return {schemaVersion:OUTREACH_REALITY_DOCTOR_VERSION,observedAt:new Date(now).toISOString(),state:blockers.length?'WAIT_EXTERNAL_REALITY':'REALITY_INPUTS_PRESENT__RUN_CANONICAL_100K_PREPARER',dns,artifacts,runtimeEvidence,uberdosoActivation:activation,blockers:[...new Set(blockers)],automaticSendAuthority:false,automaticSpendAuthority:false,externalEffectAuthority:'NONE',truthBoundary:'Reads public DNS and local evidence artifacts only; never mutates DNS, provisions infrastructure, spends, contacts recipients, or substitutes for the canonical 100K certificate.'};
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){const out=await runOutreachRealityDoctor();process.stdout.write(`${JSON.stringify(out,null,2)}\n`);process.exitCode=out.state==='WAIT_EXTERNAL_REALITY'?2:0;}
