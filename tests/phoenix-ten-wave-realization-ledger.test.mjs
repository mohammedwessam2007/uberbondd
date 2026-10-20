import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import fs from 'node:fs';
import {inspectPhoenixRealizationLedger} from '../src/phoenix-ten-wave-realization-ledger.mjs';
import {runPhoenixCosCommand} from '../scripts/phoenix-cos-operator.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function zero(r){
  assert.equal(r.externalEffectAuthority,'NONE');
  assert.equal(r.businessEffectAuthority,'NONE');
  assert.equal(r.externalEffectLedger.providerCalls,0);
  assert.equal(r.externalEffectLedger.messages,0);
  assert.equal(r.externalEffectLedger.spendCents,0);
  assert.equal(r.externalEffectLedger.deployments,0);
}

test('all 1560 original research records carry immutable provenance without automatic admission',()=>{
  const r=inspectPhoenixRealizationLedger();
  assert.equal(r.ok,true);
  assert.equal(r.records.length,1560);
  assert.equal(new Set(r.records.map(x=>x.id)).size,1560);
  assert.equal(r.summary.localImplementationSourceMapped,8);
  assert.equal(r.summary.notEstablished,1552);
  assert.equal(r.summary.admittedExternalSupplierCount,0);
  assert.equal(r.summary.automaticallyExecutableResearchCount,0);
  assert.deepEqual(r.summary.unrecoveredOriginalWaveSpecs,[1,2]);
  assert.ok(r.records.every(x=>x.autoAdmission==='DENIED'&&x.supplierPromotion==='NONE'
    &&x.externalEffects==='NONE'&&x.originalAcceptance));
  assert.ok(r.records.every(x=>/^\/(?:candidates|capabilities)\/\d+$/.test(x.originalSourcePointer)));
  assert.match(r.ledgerDigest,/^sha256:[a-f0-9]{64}$/);
  zero(r);
});

test('all mapped current first-party implementation tests execute and return passing local proofs',()=>{
  const r=inspectPhoenixRealizationLedger({executeLocalTests:true});
  assert.equal(r.ok,true);
  assert.equal(r.summary.locallyTestPassed,8);
  assert.equal(r.summary.localTestFailed,0);
  const mapped=r.records.filter(x=>x.localImplementation);
  assert.equal(mapped.length,8);
  assert.ok(mapped.every(x=>x.implementationAssessment==='BOUNDED_LOCAL_SOFTWARE_TEST_PASSED_NOT_PRODUCTION'
    &&x.localImplementation.testState==='PASSED_LOCAL_FIRST_PARTY_TEST'));
  assert.ok(mapped.every(x=>x.localImplementation.sourceSha256.startsWith('sha256:')
    &&x.localImplementation.testSha256.startsWith('sha256:')));
  assert.ok(mapped.every(x=>x.autoAdmission==='DENIED'));
  zero(r);
});

test('CoS exposes paginated wave realization, individual source identity and summary only',()=>{
  const summary=runPhoenixCosCommand(['realization']);
  assert.equal(summary.ok,true);
  assert.equal(summary.summary.totalRecords,1560);
  assert.equal(summary.summary.notEstablished,1552);
  zero(summary);
  const page=runPhoenixCosCommand(['realization','wave','10','195','10']);
  assert.equal(page.ok,true);
  assert.equal(page.total,200);
  assert.equal(page.records.length,5);
  assert.equal(page.records[4].id,'phoenix-wave10-0200');
  zero(page);
  const known=runPhoenixCosCommand(['realization','record','phoenix-wave8-0001']);
  assert.equal(known.ok,true);
  assert.equal(known.record.localImplementation.narrowScope,'LOCAL_NO_PROMOTION_GUARD');
  assert.equal(known.record.autoAdmission,'DENIED');
  zero(known);
  const unknown=runPhoenixCosCommand(['realization','record','phoenix-wave8-9999']);
  assert.equal(unknown.ok,false);
  zero(unknown);
});

test('no hidden auto-import, licensing promotion, arbitrary paths or provider execution via CLI',()=>{
  for(const args of [
    ['realization','promote','phoenix-wave8-0001'],
    ['realization','record','../../.env'],
    ['realization','wave','1'],
    ['realization','wave','8','-1','30'],
    ['realization','wave','8','0','5000'],
    ['realization','verify','--network'],
    ['realization','status','--write']
  ]){
    const denied=runPhoenixCosCommand(args);
    assert.equal(denied.ok,false,JSON.stringify(args));
    zero(denied);
  }
  const proc=spawnSync(process.execPath,['scripts/phoenix-ten-wave-realization.mjs','--deploy'],
    {cwd:root,encoding:'utf8',timeout:20000});
  assert.notEqual(proc.status,0);
  assert.equal(JSON.parse(proc.stdout).status,'REALIZATION_REQUEST_REFUSED');
});

test('durable artifact is a source-pointer research inventory, not supplier execution permission',()=>{
  const p=resolve(root,'artifacts/capability-genome/research/phoenix-wave-realization-ledger.json');
  const a=JSON.parse(fs.readFileSync(p,'utf8'));
  assert.equal(a.ok,true);
  assert.equal(a.summary.totalRecords,1560);
  assert.equal(a.records.length,1560);
  assert.equal(a.summary.admittedExternalSupplierCount,0);
  assert.ok(a.records.every(r=>r.autoAdmission==='DENIED'));
  assert.ok(a.records.every(r=>!r.originalAcceptance && !r.title));
  assert.ok(a.records.filter(r=>r.localImplementation).length===8);
  zero(a);
});
