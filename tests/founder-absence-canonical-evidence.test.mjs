import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildFounderAbsenceReport } from '../scripts/founder-absence-doctor.mjs';
import { compileModelProviderRuntimeEvidence } from '../src/model-provider-runtime-evidence.mjs';
import { compileRemainingCutEvidence } from '../src/remaining-cut-evidence.mjs';

const SHA=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim().toLowerCase();
const REF=n=>`sha256:${String(n).repeat(64).slice(0,64)}`;
const ZERO={credentialChanges:0,deployments:0,dnsChanges:0,messages:0,providerCalls:0,purchases:0,spendCents:0,productionMutations:0};

function modelReceipt(sourceCommit=SHA){
  return compileModelProviderRuntimeEvidence({
    sourceCommit,
    provider:'open-model',
    runtime:'TRANSFORMERS_HTTP',
    runtimeHost:'uberlit-local-transformer',
    taskId:'founder-absence-canonical-evidence-test',
    configuredModel:'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    observedModel:'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    identityVerification:'MATCHED',
    outcome:'COMPLETED',
    resultDigest:REF('a'),
    inputTokens:10,
    outputTokens:5,
    totalTokens:15,
    costCents:0,
    costCeilingCents:0,
    businessEffectAuthority:'NONE',
    externalEffectLedger:ZERO
  });
}

function messagingReceipt(){
  return compileRemainingCutEvidence({
    sourceCommit:SHA,
    cutId:'MESSAGING_PROVIDER',
    evidenceRefs:[REF('b')],
    observed:{
      providerIndependenceObserved:true,
      paths:[
        {provider:'GMAIL',authorized:true,callable:true,senderIdentityEvidenceRef:REF('c'),policyEvidenceRef:REF('d'),activationEvidenceRef:REF('e'),canaryEvidenceRef:REF('f')},
        {provider:'OUTLOOK',authorized:true,callable:true,senderIdentityEvidenceRef:REF('1'),policyEvidenceRef:REF('2'),activationEvidenceRef:REF('3'),canaryEvidenceRef:REF('4')}
      ]
    }
  });
}

function paymentReceipt(){
  return compileRemainingCutEvidence({
    sourceCommit:SHA,
    cutId:'PAYMENT_PROVIDER',
    evidenceRefs:[REF('5')],
    observed:{
      mode:'SECOND_RAIL',
      provider:'STRIPE',
      environment:'LIVE',
      authorized:true,
      callable:true,
      settlementOrRecoveryObserved:true,
      evidenceRef:REF('6')
    }
  });
}

function write(dir,name,value){const file=path.join(dir,name);fs.writeFileSync(file,`${JSON.stringify(value)}\n`);return file;}

function row(report,id){const found=report.blockers.find(item=>item.id===id);assert.ok(found,`missing blocker ${id}`);return found;}

test('exact-source canonical receipts remove only their obsolete owner blockers',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ub-founder-canonical-'));
  try{
    const model=write(dir,'model.json',modelReceipt());
    const messaging=write(dir,'messaging.json',messagingReceipt());
    const payment=write(dir,'payment.json',paymentReceipt());
    const report=buildFounderAbsenceReport({env:{
      UBERBOND_MODEL_PROVIDER_RECEIPT_PATH:model,
      UBERBOND_MESSAGING_PROVIDER_RECEIPT_PATH:messaging,
      UBERBOND_PAYMENT_PROVIDER_RECEIPT_PATH:payment
    }});
    for(const cut of ['MODEL_PROVIDER','MESSAGING_PROVIDER','PAYMENT_PROVIDER'])assert.equal(report.canonicalReceiptEvidence[cut].accepted,true,cut);
    for(const id of ['zero-configured-model-providers','zero-activated-email-provider-accounts','zero-payment-provider-account']){
      const blocker=row(report,id);
      assert.equal(blocker.open,false,id);
      assert.equal(blocker.status,'VERIFIED_RESOLVED',id);
      assert.match(blocker.resolutionEvidence.join('\n'),/canonical.*Evidence=OBSERVED/);
      assert.equal(report.ownerActionQueue.some(action=>action.blockerId===id),false,id);
    }
    assert.equal(JSON.stringify(report).includes(dir),false,'receipt filesystem path leaked into report');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('tampered receipt fails closed and leaves the owner blocker open',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ub-founder-tamper-'));
  try{
    const forged=structuredClone(modelReceipt());forged.observed.costCents=1;
    const model=write(dir,'model.json',forged);
    const report=buildFounderAbsenceReport({env:{UBERBOND_MODEL_PROVIDER_RECEIPT_PATH:model}});
    assert.equal(report.canonicalReceiptEvidence.MODEL_PROVIDER.accepted,false);
    assert.equal(row(report,'zero-configured-model-providers').open,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('receipt from another source commit cannot resolve this tree',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ub-founder-wrong-source-'));
  try{
    const model=write(dir,'model.json',modelReceipt('a'.repeat(40)));
    const report=buildFounderAbsenceReport({env:{UBERBOND_MODEL_PROVIDER_RECEIPT_PATH:model}});
    assert.equal(report.canonicalReceiptEvidence.MODEL_PROVIDER.accepted,false);
    assert.ok(report.canonicalReceiptEvidence.MODEL_PROVIDER.reasonCodes.includes('model-provider-source-mismatch'));
    assert.equal(row(report,'zero-configured-model-providers').open,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
