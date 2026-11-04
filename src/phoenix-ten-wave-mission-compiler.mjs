import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectNativeCapabilityUniverse, routeNativeCapability } from './native-capability-universe.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const noAuthority=extra=>({
  externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra
});
const reject=reason=>noAuthority({ok:false,status:'PHOENIX_TEN_WAVE_MISSION_REFUSED',reason});
const expected={3:320,4:256,5:204,6:120,7:120,8:160,9:180,10:200};
const waveNames={
  3:'Capability Genome',
  4:'Cross-Platform Leverage',
  5:'Transcendent Automation',
  6:'Proof-Carrying Evolution',
  7:'Discovery Engine',
  8:'Unknown-World Transfer',
  9:'Missing Machinery',
  10:'Autonomous Possibility Engine'
};
function verifiedIndex(args=[]) {
  const call=spawnSync('python3',[resolve(root,'scripts/phoenix-ten-wave-genome-doctor.py'),...args],{
    cwd:root,encoding:'utf8',timeout:30000,maxBuffer:3*1024*1024,
    env:{PATH:process.env.PATH||'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}
  });
  if(call.error || call.status!==0) return null;
  try{
    const x=JSON.parse(call.stdout);
    const totals=Object.entries(expected).every(([k,n])=>x.wave_summary?.[k]?.count===n
      && /^[a-f0-9]{64}$/.test(x.wave_summary[k].canonical_json_sha256));
    if(x.truth_class!=='RESEARCH_ONLY_NO_INSTALL_NO_RUNTIME_NO_AUTHORITY'
      || x.recovered_proposals!==1560||x.wave4_unrecovered_proposal_count!==0
      || x.repository_urls!==243||!totals) return null;
    return x;
  }catch{return null;}
}
export function getPhoenixWaveStatus(){
  const verified=verifiedIndex();
  if(!verified) return reject('CANONICAL_RESEARCH_CORPUS_DID_NOT_VERIFY');
  const waves=[
    {wave:1,status:'ORIGINAL_WAVE_SPEC_NOT_RECOVERED',count:null},
    {wave:2,status:'ORIGINAL_WAVE_SPEC_NOT_RECOVERED',count:null},
    ...Object.entries(expected).map(([k,n])=>({
      wave:Number(k),name:waveNames[k],count:n,status:'PINNED_RESEARCH_DESIGNS_NOT_INSTALLED',
      sourcePath:verified.wave_summary[k].path,
      canonicalSha256:verified.wave_summary[k].canonical_json_sha256
    }))
  ];
  return noAuthority({ok:true,status:'PHOENIX_TEN_WAVE_SOURCE_STATUS',
    recoveredWaveCount:8,originalWaveSpecsMissing:[1,2],
    recoveredProposals:1560,researchFamilies:verified.family_groups,
    publicRepositoryUrls:243,licenseStatus:'UNVERIFIED',supplierApprovalCount:0,
    semanticDeduplication:'NOT_DONE',waves,
    truthBoundary:'WAVES_1_2_ORIGINAL_SPEC_UNRECOVERED__WAVES_3_10_DESIGN_CORPUS_NOT_EXECUTABLE_SUPPLIERS'});
}
function verifyRow(row,index){
  if(!row||!Number.isInteger(row.wave)||expected[row.wave]===undefined
    ||row.truth_class!=='PROPOSED_RESEARCH_ONLY'
    ||row.promotion_authority!=='NONE'
    ||typeof row.id!=='string'
    ||!/^phoenix-(capability|wave[0-9]+)-[0-9]{4}$/.test(row.id)
    ||typeof row.title!=='string'||!row.title
    ||typeof row.acceptance!=='string'||!row.acceptance
    ||typeof row.source_path!=='string'
    ||row.source_path!==index.wave_summary[String(row.wave)]?.path
    ||!/^\/(capabilities|candidates)\/\d+$/.test(row.source_pointer)
    ||!Array.isArray(row.source_hints)) return false;
  return true;
}
export function listPhoenixWaveProposals(wave,{offset=0,limit=10}={}){
  if(!Number.isInteger(wave)||!Object.hasOwn(expected,wave)
    ||!Number.isInteger(offset)||offset<0||offset>1560
    ||!Number.isInteger(limit)||limit<1||limit>50)
    return reject('WAVE_3_10_AND_BOUNDED_PAGINATION_REQUIRED');
  const x=verifiedIndex(['--wave',String(wave),'--offset',String(offset),'--limit',String(limit)]);
  if(!x||x.match_count!==expected[wave]||x.offset!==offset
    ||!Array.isArray(x.matches)||x.matches.length!==Math.max(0,Math.min(limit,expected[wave]-offset))
    ||x.matches.some(r=>r.wave!==wave||!verifyRow(r,x)))return reject('PINNED_WAVE_INTEGRITY_FAILED');
  return noAuthority({ok:true,status:'PHOENIX_WAVE_PAGE_RESEARCH_ONLY',wave,name:waveNames[wave],
    total:expected[wave],offset,limit,nextOffset:offset+limit<expected[wave]?offset+limit:null,
    proposals:x.matches.map(r=>({id:r.id,title:r.title,family:r.family,
      sourcePath:r.source_path,sourcePointer:r.source_pointer,truthClass:r.truth_class})),
    admissionAuthority:'NONE',supplierExecution:'DENIED'});
}
export function compilePhoenixProposalMission(id,{nativeMarket}={}){
  if(typeof id!=='string'||!/^phoenix-(?:capability|wave(?:[3-9]|10))-[0-9]{4}$/.test(id))
    return reject('CANONICAL_RECOVERED_PROPOSAL_ID_REQUIRED');
  const x=verifiedIndex(['--id',id]);
  if(!x||x.matches?.length!==1||x.matches[0].id!==id||!verifyRow(x.matches[0],x))
    return reject('SOURCE_PINNED_PROPOSAL_UNAVAILABLE_OR_TAMPERED');
  const row=x.matches[0];
  const natives=nativeMarket||inspectNativeCapabilityUniverse({rootDir:root});
  if(natives.ok!==true)return reject('NATIVE_BASELINE_UNAVAILABLE');
  const route=routeNativeCapability({mission:row.title+' '+row.family,universe:natives});
  const suggestions=(route.results||[]).filter(v=>v.score>0).slice(0,3)
    .map(v=>({atomId:v.capability.atomId,sourceHash:v.capability.sourceHash,
      overlapSignal:'LEXICAL_ONLY_NO_SEMANTIC_EQUIVALENCE',score:v.score}));
  const candidate={
    originalId:row.id,originWave:row.wave,family:row.family,originalTitle:row.title,
    originalAcceptanceRequirement:row.acceptance,
    originalSourcePath:row.source_path,originalSourcePointer:row.source_pointer,
    pinnedWaveSourceSha256:x.wave_summary[String(row.wave)].canonical_json_sha256,
    originalDonorHints:row.source_hints,
    trustClass:'RESEARCH_PROPOSAL_NOT_CAPABILITY',
    implementationStatus:'NOT_VERIFIED',
    riskAssessment:'REQUIRES_INDEPENDENT_ASSESSMENT',
    nativeBaselines:suggestions,
    requiredEvidence:[
      'Current-main exact code audit and semantic overlap review; no inference of absence from lexical mismatch',
      'Source/donor identity, redistribution license, transitive dependencies and security clearance',
      'Specific permission, data, credential, side-effect and model/runtime declaration',
      'Negative and positive adversarial tests based on original acceptance, NO-SKILL and CURRENT baseline plus holdouts',
      'Independent source/runtime review, rollback and revocation conditions',
      'If any external effects: explicit founder/provider authority and real economic acceptance receipts'
    ],
    nextStep:'IMPLEMENT_AND_TEST_IN_ISOLATED_WORKTREE_WITHOUT_AUTOMATIC_VENDOR_INSTALL_OR_PROMOTION',
    canExecuteNow:false,canPromoteNow:false
  };
  return noAuthority({ok:true,status:'PHOENIX_SOURCE_VERIFIED_IMPLEMENTATION_CONTRACT',
    proposal:candidate,contractDigest:'sha256:'+sha(candidate),
    truthBoundary:'COMPILED_PLAN_FROM_PINNED_SOURCE__NOT_REAL_IMPLEMENTATION_OR_EXTERNAL_SUPPLIER_AUTHORITY'});
}
