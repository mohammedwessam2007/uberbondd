import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileContaboMailCellCandidate,
  compileContaboPurchasePlan,
  compileContaboCreateInstanceRequest,
  compileObservedContaboMailCell
} from '../src/contabo-mail-cell.mjs';

const candidate=()=>compileContaboMailCellCandidate({evidenceRefs:['contabo:static-ipv4','contabo:rdns','contabo:unrestricted-outbound','contabo:cloud-vps-4']});
const quote={monthlyCents:500,dueNowCents:500,currency:'EUR',evidenceRef:'quote:checkout-1',observedAt:'2026-09-13T01:00:00Z'};
function quoteDigest(){
  const blocked=compileContaboPurchasePlan({candidateResult:candidate(),quote,ownerAuthorization:{}});
  return blocked.quoteDigest;
}
const auth=()=>({approved:true,scope:'CONTABO_MAIL_CELL_CREATE',quoteDigest:quoteDigest(),maxMonthlyCents:500,maxDueNowCents:500,approvedAt:'2026-09-13T01:01:00Z'});

test('candidate is compile-only and binds the smallest qualifying EU product',()=>{
  const result=candidate();
  assert.equal(result.ok,true);
  assert.equal(result.candidate.product.productId,'V153');
  assert.equal(result.candidate.product.region,'EU');
  assert.equal(result.candidate.product.periodMonths,1);
  assert.equal(result.externalEffectLedger.purchases,0);
});

test('purchase plan refuses without explicit owner approval bound to exact quote',()=>{
  const result=compileContaboPurchasePlan({candidateResult:candidate(),quote,ownerAuthorization:{}});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('explicit-owner-purchase-approval-required'));
  assert.ok(result.reasonCodes.includes('owner-approval-must-bind-exact-quote'));
  assert.equal(result.externalEffectLedger.spendCents,0);
});

test('purchase plan refuses stale scope, quote mismatch, or cost above ceiling',()=>{
  const wrongScope=compileContaboPurchasePlan({candidateResult:candidate(),quote,ownerAuthorization:{...auth(),scope:'ANYTHING_ELSE'}});
  assert.equal(wrongScope.ok,false);
  assert.ok(wrongScope.reasonCodes.includes('exact-owner-authorization-scope-required'));
  const wrongQuote=compileContaboPurchasePlan({candidateResult:candidate(),quote,ownerAuthorization:{...auth(),quoteDigest:'0'.repeat(64)}});
  assert.equal(wrongQuote.ok,false);
  assert.ok(wrongQuote.reasonCodes.includes('owner-approval-must-bind-exact-quote'));
  const tooLow=compileContaboPurchasePlan({candidateResult:candidate(),quote,ownerAuthorization:{...auth(),maxMonthlyCents:499}});
  assert.equal(tooLow.ok,false);
  assert.ok(tooLow.reasonCodes.includes('monthly-cost-exceeds-approved-ceiling'));
});

test('approved purchase plan still performs no purchase and only compiles an API request',()=>{
  const plan=compileContaboPurchasePlan({candidateResult:candidate(),quote,ownerAuthorization:auth()});
  assert.equal(plan.ok,true);
  assert.equal(plan.status,'CONTABO_MAIL_CELL_PURCHASE_PLAN_READY');
  assert.equal(plan.externalEffectAuthority,'NONE');
  assert.equal(plan.externalEffectLedger.purchases,0);
  const missing=compileContaboCreateInstanceRequest({purchasePlanResult:plan});
  assert.equal(missing.ok,false);
  assert.ok(missing.reasonCodes.includes('contabo-ssh-secret-id-required'));
  const request=compileContaboCreateInstanceRequest({purchasePlanResult:plan,sshSecretId:42});
  assert.equal(request.ok,true);
  assert.equal(request.request.body.productId,'V153');
  assert.equal(request.request.body.region,'EU');
  assert.equal(request.request.body.period,1);
  assert.equal(request.request.credentialMaterialIncluded,false);
  assert.equal(request.externalEffectLedger.deployments,0);
  assert.equal(request.externalEffectLedger.spendCents,0);
});

test('observed cell refuses fake PTR, blocked SMTP, and undersized instance',()=>{
  const base={instanceId:123,productId:'V153',region:'EU',status:'running',cpuCores:4,ramMb:8192,diskMb:102400,ipConfig:{v4:{ip:'203.0.113.25'}}};
  const result=compileObservedContaboMailCell({instance:{...base,cpuCores:1},ptrEvidence:{hostname:'wrong.example',observed:true},transportEvidence:{outboundPort25Observed:false,inboundPort25Observed:true},dockerEvidence:{available:true,persistentStorage:true},evidenceRefs:['receipt:host']});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('observed-instance-capacity-required'));
  assert.ok(result.reasonCodes.includes('observed-controlled-ptr-required'));
  assert.ok(result.reasonCodes.includes('observed-bidirectional-smtp-reachability-required'));
});

test('real observed cell becomes an UberCloud cell while UberDoso keeps its own activation gates',()=>{
  const result=compileObservedContaboMailCell({
    instance:{instanceId:123,productId:'V153',region:'EU',status:'running',cpuCores:4,ramMb:8192,diskMb:102400,ipConfig:{v4:{ip:'203.0.113.25'}}},
    ptrEvidence:{hostname:'mta.uberbond.cloud',observed:true},
    transportEvidence:{outboundPort25Observed:true,inboundPort25Observed:true},
    dockerEvidence:{available:true,persistentStorage:true},
    postalImage:'ghcr.io/postalserver/postal@sha256:'+'a'.repeat(64),
    mariaDbImage:'mariadb@sha256:'+'b'.repeat(64),
    verifiedAt:'2026-09-13T01:30:00Z',
    evidenceRefs:['receipt:instance','receipt:ptr','receipt:smtp']
  });
  assert.equal(result.ok,true);
  assert.equal(result.cell.provider,'contabo');
  assert.ok(result.cell.capabilityTags.includes('mail-host'));
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.uberdosoActivation.status,'UBERDOSO_HOST_READY__POSTAL_BOOT_AND_DKIM_REQUIRED');
});
