import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { runUberDosoJob } from '../src/uberdoso-job-handler.mjs';
import { listSendingDomains } from '../src/sending-domain-registry.mjs';
import { listSendingMailboxesForDomain } from '../src/sending-mailbox-registry.mjs';

async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'uberdoso-job-'));
  const store=new Store(root);await store.init();
  const jobs=[];
  const enqueueJob=async(type,payload,options)=>{jobs.push({type,payload,options});return{ok:true,id:`job-${jobs.length}`};};
  return{root,store,jobs,enqueueJob};
}

test('first pulse canonically connects both owned outreach roots and planned first mailboxes without external effects',async()=>{
  const f=await fixture();
  try{
    const result=await runUberDosoJob({store:f.store,enqueueJob:f.enqueueJob,date:'2026-09-13T00:00:00Z'});
    assert.equal(result.ok,true);
    assert.deepEqual(result.createdDomains,['uberbond.agency','uberbond.cloud']);
    assert.deepEqual(result.createdMailboxes,['mohamed@uberbond.agency','mohamed@uberbond.cloud']);
    assert.equal(result.registeredDomainCount,2);
    assert.equal(result.registeredMailboxCount,2);
    assert.equal(result.externalEffectAuthority,'NONE');
    assert.deepEqual(result.externalEffectLedger,{providerCalls:0,messages:0,purchases:0,deployments:0,credentialChanges:0,dnsChanges:0,productionMutations:0,spendCents:0});
    const domains=await listSendingDomains(f.store);
    assert.deepEqual(domains.map(row=>row.domain).sort(),['uberbond.agency','uberbond.cloud']);
    for(const domain of domains){
      const mailboxes=await listSendingMailboxesForDomain(f.store,domain.domainId);
      assert.equal(mailboxes.length,1);
      assert.equal(mailboxes[0].provider,'uberdoso-postal');
    }
    assert.equal(f.jobs.length,0,'no external/DNS job is invented before a physical DNS contract exists');
    assert.ok(result.blocked.some(row=>row.reasonCode==='physical-dns-contract-not-yet-observed'));
  } finally {await fs.rm(f.root,{recursive:true,force:true});}
});

test('repeated pulse is idempotent and does not duplicate registry state',async()=>{
  const f=await fixture();
  try{
    await runUberDosoJob({store:f.store,enqueueJob:f.enqueueJob,date:'2026-09-13T00:00:00Z'});
    const second=await runUberDosoJob({store:f.store,enqueueJob:f.enqueueJob,date:'2026-09-13T00:01:00Z'});
    assert.deepEqual(second.createdDomains,[]);
    assert.deepEqual(second.createdMailboxes,[]);
    const domains=await listSendingDomains(f.store);
    assert.equal(domains.length,2);
    const boxes=(await Promise.all(domains.map(row=>listSendingMailboxesForDomain(f.store,row.domainId)))).flat();
    assert.equal(boxes.length,2);
  } finally {await fs.rm(f.root,{recursive:true,force:true});}
});

test('observed DNS contract allows only durable verification jobs and never warm-up or sending',async()=>{
  const f=await fixture();
  try{
    const expected={
      'uberbond.agency':{mxHostSuffixes:['mta.uberbond.cloud'],spfIncludes:['spf.uberbond.cloud'],dkimSelector:'postal',dmarcMinPolicy:'quarantine'},
      'uberbond.cloud':{mxHostSuffixes:['mta.uberbond.cloud'],spfIncludes:['spf.uberbond.cloud'],dkimSelector:'postal',dmarcMinPolicy:'quarantine'}
    };
    const result=await runUberDosoJob({store:f.store,enqueueJob:f.enqueueJob,expectedRecordsByDomain:expected,date:'2026-09-13T00:00:00Z'});
    assert.equal(result.ok,true);
    assert.ok(f.jobs.length>=2);
    assert.ok(f.jobs.every(job=>job.type==='domainMailbox.dns.verify'));
    assert.ok(f.jobs.every(job=>job.options?.idempotencyKey?.startsWith('uberdoso:dns:')));
    assert.equal(result.externalEffectLedger.messages,0);
    assert.equal(result.externalEffectLedger.dnsChanges,0);
  } finally {await fs.rm(f.root,{recursive:true,force:true});}
});
