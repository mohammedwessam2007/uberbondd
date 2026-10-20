import crypto from 'node:crypto';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ZERO_EXTERNAL_EFFECTS} from './effect-ledgers.mjs';

export const PHOENIX_REALIZATION_LEDGER_VERSION='phoenix.realization-ledger.v1';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const digest=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const envelope=extra=>({externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});
const failure=reason=>envelope({ok:false,status:'PHOENIX_REALIZATION_LEDGER_REFUSED',reason});
const counts={3:320,4:256,5:204,6:120,7:120,8:160,9:180,10:200};

// These are reviewable first-party source integrations, NOT installed donor
// repositories, approved external skills or production-connected capabilities.
const LOCAL_SOURCE_PROOFS=Object.freeze({
  'phoenix-capability-0001':{source:'src/phoenix-native-cli-health.mjs',test:'tests/phoenix-native-cli-health.test.mjs',cos:['cli-auth'],scope:'LOCAL_CLI_STATUS_ONLY'},
  'phoenix-wave4-0001':{source:'src/phoenix-native-cli-health.mjs',test:'tests/phoenix-native-cli-health.test.mjs',cos:['cli-auth'],scope:'LOCAL_CLI_STATUS_ONLY'},
  'phoenix-wave5-0001':{source:'src/phoenix-synthetic-gui-replay.mjs',test:'tests/phoenix-synthetic-gui-replay.test.mjs',cos:['gui-record','gui-replay'],scope:'VIRTUAL_FIXTURE_ONLY'},
  'phoenix-wave6-0001':{source:'src/phoenix-objective-escrow.mjs',test:'tests/phoenix-objective-escrow.test.mjs',cos:['objective-escrow-verify'],scope:'LOCAL_PINNED_SIGNER_VERIFIER'},
  'phoenix-wave7-0002':{source:'src/phoenix-bibliographic-identity.mjs',test:'tests/phoenix-bibliographic-identity.test.mjs',cos:['paper-reconcile'],scope:'LOCAL_IDENTITY_RECONCILIATION'},
  'phoenix-wave8-0001':{source:'src/phoenix-wave8-objective-guard.mjs',test:'tests/phoenix-wave8-objective-guard.test.mjs',cos:['wave8-objective-guard'],scope:'LOCAL_NO_PROMOTION_GUARD'},
  'phoenix-wave9-0001':{source:'scripts/phoenix-cos-operator.mjs',test:'tests/phoenix-wave9-unsupported-action.test.mjs',cos:['invoke'],scope:'LOCAL_UNSUPPORTED_ACTION_DENIAL'},
  'phoenix-wave10-0001':{source:'src/phoenix-source-authenticity.mjs',test:'tests/phoenix-source-authenticity.test.mjs',cos:['source-verify'],scope:'LOCAL_PINNED_HASH_MATCH_ONLY'}
});
const ids=new Set(Object.keys(LOCAL_SOURCE_PROOFS));

function verifiedFile(relative) {
  if(!/^((src|tests|scripts)\/)[-a-z0-9_/.]+\.mjs$/.test(relative)||relative.includes('..'))return null;
  const abs=join(root,relative);
  try {
    const stat=fs.lstatSync(abs);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)return null;
    return {abs,sha256:digest(fs.readFileSync(abs))};
  }catch{return null;}
}
function source() {
  const doctor=spawnSync('python3',
    [join(root,'scripts/phoenix-ten-wave-genome-doctor.py'),'--include-records'],{
      cwd:root,encoding:'utf8',timeout:40000,maxBuffer:8*1024*1024,
      env:{PATH:process.env.PATH||'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}
    });
  if(doctor.error||doctor.status!==0)return null;
  try {
    const x=JSON.parse(doctor.stdout);
    if(x.truth_class!=='RESEARCH_ONLY_NO_INSTALL_NO_RUNTIME_NO_AUTHORITY'
      ||x.recovered_proposals!==1560||x.records?.length!==1560
      ||x.repository_urls!==243||x.wave4_unrecovered_proposal_count!==0
      ||!Object.entries(counts).every(([w,n])=>x.wave_summary?.[w]?.count===n)
      ||x.records.some(r=>r.promotion_authority!=='NONE'||r.truth_class!=='PROPOSED_RESEARCH_ONLY')
      ||new Set(x.records.map(r=>r.id)).size!==1560)return null;
    return x;
  }catch{return null;}
}

export function inspectPhoenixRealizationLedger({executeLocalTests=false}={}){
  const corpus=source();
  if(!corpus)return failure('PINNED_SOURCE_CORPUS_UNVERIFIED');
  const mapped={};
  for(const [id,spec] of Object.entries(LOCAL_SOURCE_PROOFS)){
    const source=verifiedFile(spec.source),test=verifiedFile(spec.test);
    if(!source||!test)return failure('DECLARED_IMPLEMENTATION_OR_TEST_SOURCE_MISSING:'+id);
    mapped[id]={...spec,sourceHash:source.sha256,testHash:test.sha256,testState:'NOT_RUN_IN_THIS_INVOCATION'};
  }
  if(executeLocalTests){
    for(const id of ids){
      const rec=mapped[id];
      if(rec.testState!=='NOT_RUN_IN_THIS_INVOCATION')continue;
      const exec=spawnSync(process.execPath,['--test',rec.test],{
        cwd:root,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,
        env:{PATH:process.env.PATH||'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}
      });
      const sameTests=Object.entries(mapped).filter(([,v])=>v.test===rec.test);
      const state=exec.status===0&&!exec.error?'PASSED_LOCAL_FIRST_PARTY_TEST':'FAILED_OR_INCOMPLETE_LOCAL_TEST';
      const evidence={testState:state,exitCode:exec.status,
        testOutputDigest:digest(Buffer.from((exec.stdout||'')+'\n'+(exec.stderr||'')))};
      for(const [otherId] of sameTests)Object.assign(mapped[otherId],evidence);
    }
  }
  const records=corpus.records.map(row=>{
    const proof=mapped[row.id];
    return {
      id:row.id,wave:row.wave,title:row.title,family:row.family,
      originalSourcePath:row.source_path,originalSourcePointer:row.source_pointer,
      sourceWaveSha256:corpus.wave_summary[String(row.wave)].canonical_json_sha256,
      originalAcceptance:row.acceptance,
      sourceHintsCount:row.source_hints.length,
      researchTruthClass:'PROPOSED_RESEARCH_ONLY',
      implementationAssessment:proof
        ? proof.testState==='PASSED_LOCAL_FIRST_PARTY_TEST'
          ? 'BOUNDED_LOCAL_SOFTWARE_TEST_PASSED_NOT_PRODUCTION'
          : proof.testState==='NOT_RUN_IN_THIS_INVOCATION'
            ? 'SOURCE_IMPLEMENTATION_PRESENT_LOCAL_TEST_NOT_RUN_THIS_INVOCATION'
            : 'LOCAL_TEST_FAILURE_NOT_CLEARED'
        : 'IMPLEMENTATION_NOT_ESTABLISHED_FROM_THIS_REVIEW',
      ...(proof?{localImplementation:{
        sourcePath:proof.source,sourceSha256:proof.sourceHash,
        testPath:proof.test,testSha256:proof.testHash,
        testState:proof.testState, ...(proof.testOutputDigest?{testOutputDigest:proof.testOutputDigest}:{}),
        narrowScope:proof.scope,cosCommands:proof.cos
      }}:{}),
      autoAdmission:'DENIED',supplierPromotion:'NONE',
      externalEffects:'NONE'
    };
  });
  const assessed=records.filter(x=>x.localImplementation).length;
  const passed=records.filter(x=>x.localImplementation?.testState==='PASSED_LOCAL_FIRST_PARTY_TEST').length;
  const failed=records.filter(x=>x.localImplementation?.testState==='FAILED_OR_INCOMPLETE_LOCAL_TEST').length;
  const summary={
    totalRecords:records.length,sourceRecoveredWaves:[3,4,5,6,7,8,9,10],
    unrecoveredOriginalWaveSpecs:[1,2],waveCounts:{...counts},
    localImplementationSourceMapped:assessed,locallyTestPassed:passed,
    localTestFailed:failed,notEstablished:records.length-assessed,
    admittedExternalSupplierCount:0,automaticallyExecutableResearchCount:0,
    immutableFounderIdeasPreserved:890,
    untrustedSupplierURLObservations:243,canonicalSupplierIdentityEstimate:240,
    duplicateNameGroups:corpus.exact_normalized_title_collision_groups.length,
    semanticDeduplication:'NOT_COMPLETE',promotionAuthority:'NONE'
  };
  const lineage=records.map(({id,wave,originalSourcePath,originalSourcePointer,
    sourceWaveSha256,implementationAssessment,localImplementation})=>({
    id,wave,originalSourcePath,originalSourcePointer,sourceWaveSha256,
    implementationAssessment,
    localSourceHash:localImplementation?.sourceSha256||null
  }));
  return envelope({ok:failed===0,status:failed===0?'PHOENIX_REALIZATION_INVENTORY_CHECKED':'PHOENIX_LOCAL_TEST_FAILURE',
    schema:PHOENIX_REALIZATION_LEDGER_VERSION,summary,
    ledgerDigest:digest(Buffer.from(JSON.stringify(lineage))),
    records,
    truthBoundary:'ALL_1560_DESIGNS_ARE_LINKED__ONLY_EXPLICIT_REVIEWED_LOCAL_SOURCE_PROOFS_ARE_MAPPED__NO_EXTERNAL_SKILLS_AUTO_APPROVED'});
}
