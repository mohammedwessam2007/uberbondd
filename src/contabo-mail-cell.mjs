import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizeResourceCell } from './sovereign-compute-cell-fabric.mjs';
import { compileUberDosoActivation } from './uberdoso-activation.mjs';

export const CONTABO_MAIL_CELL_VERSION='uberbond.contabo-mail-cell.v1';
export const CONTABO_MAIL_PRODUCT=Object.freeze({productId:'V153',productName:'Cloud VPS 4',region:'EU',periodMonths:1,minCpuCores:4,minRamBytes:8*1024**3,minDiskBytes:100*1024**3});
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const cents=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
const fail=(reasonCodes,extra={})=>({ok:false,status:'CONTABO_MAIL_CELL_BLOCKED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});

export function compileContaboMailCellCandidate({evidenceRefs=[]}={}){
  const refs=[...new Set((Array.isArray(evidenceRefs)?evidenceRefs:[]).map(v=>text(v,1200)).filter(Boolean))];
  if(!refs.length)return fail(['provider-capability-evidence-required']);
  const candidate={schemaVersion:'uberbond.contabo-mail-cell-candidate.v1',provider:'contabo',product:{...CONTABO_MAIL_PRODUCT},requiredCapabilities:['STATIC_PUBLIC_IPV4','EDITABLE_PTR','UNRESTRICTED_OUTBOUND_NETWORK','PERSISTENT_STORAGE','DOCKER_CAPABLE'],evidenceRefs:refs,purchaseAuthority:'NONE',credentialAuthority:'NONE'};
  candidate.candidateDigest=hash(candidate);
  return{ok:true,status:'CONTABO_MAIL_CELL_CANDIDATE_READY',candidate,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export function compileContaboPurchasePlan({candidateResult,quote={},ownerAuthorization={}}={}){
  if(!candidateResult?.ok||candidateResult.status!=='CONTABO_MAIL_CELL_CANDIDATE_READY'||!candidateResult.candidate?.candidateDigest)return fail(['valid-candidate-required']);
  const monthly=cents(quote.monthlyCents),dueNow=cents(quote.dueNowCents),currency=text(quote.currency,8)?.toUpperCase(),quoteRef=text(quote.evidenceRef,1200),observedAt=text(quote.observedAt,100);
  const reasons=[];
  if(monthly==null||dueNow==null||!currency||!quoteRef||!observedAt||!Number.isFinite(Date.parse(observedAt)))reasons.push('fresh-price-quote-evidence-required');
  const quoteIdentity={provider:'contabo',productId:CONTABO_MAIL_PRODUCT.productId,region:CONTABO_MAIL_PRODUCT.region,periodMonths:1,monthlyCents:monthly,dueNowCents:dueNow,currency,evidenceRef:quoteRef,observedAt};
  const quoteDigest=hash(quoteIdentity);
  if(ownerAuthorization.approved!==true)reasons.push('explicit-owner-purchase-approval-required');
  if(text(ownerAuthorization.scope,120)!=='CONTABO_MAIL_CELL_CREATE')reasons.push('exact-owner-authorization-scope-required');
  if(text(ownerAuthorization.quoteDigest,64)!==quoteDigest)reasons.push('owner-approval-must-bind-exact-quote');
  const maxMonthly=cents(ownerAuthorization.maxMonthlyCents),maxDueNow=cents(ownerAuthorization.maxDueNowCents);
  if(monthly!=null&&(maxMonthly==null||monthly>maxMonthly))reasons.push('monthly-cost-exceeds-approved-ceiling');
  if(dueNow!=null&&(maxDueNow==null||dueNow>maxDueNow))reasons.push('initial-cost-exceeds-approved-ceiling');
  const approvedAt=text(ownerAuthorization.approvedAt,100);
  if(!approvedAt||!Number.isFinite(Date.parse(approvedAt)))reasons.push('dated-owner-approval-required');
  if(reasons.length)return fail(reasons,{quoteDigest});
  const plan={schemaVersion:'uberbond.contabo-mail-cell-purchase-plan.v1',candidateDigest:candidateResult.candidate.candidateDigest,quote:quoteIdentity,quoteDigest,ownerApproval:{scope:'CONTABO_MAIL_CELL_CREATE',approvedAt:new Date(approvedAt).toISOString(),maxMonthlyCents:maxMonthly,maxDueNowCents:maxDueNow},requestTemplate:{method:'POST',path:'/v1/compute/instances',body:{productId:'V153',region:'EU',period:1,displayName:'uberdoso-mail-cell',defaultUser:'admin'}},law:'PLAN DOES NOT CALL CONTABO OR CREATE SPEND; EXECUTION REQUIRES ACCOUNT CREDENTIALS, SSH SECRET ID, AND A SEPARATE EFFECTFUL ACTUATOR.',purchaseAuthority:'OWNER_APPROVED_BOUNDED_PLAN_ONLY'};
  plan.planDigest=hash(plan);
  return{ok:true,status:'CONTABO_MAIL_CELL_PURCHASE_PLAN_READY',plan,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export function compileContaboCreateInstanceRequest({purchasePlanResult,sshSecretId,imageId='afecbb85-e2fc-46f0-9684-b46b1faf00bb',cloudInit='' }={}){
  if(!purchasePlanResult?.ok||purchasePlanResult.status!=='CONTABO_MAIL_CELL_PURCHASE_PLAN_READY'||!purchasePlanResult.plan?.planDigest)return fail(['approved-purchase-plan-required']);
  const ssh=Number(sshSecretId);const image=text(imageId,120);const userData=text(cloudInit,16000)||undefined;
  if(!Number.isSafeInteger(ssh)||ssh<=0)return fail(['contabo-ssh-secret-id-required']);
  if(!image)return fail(['contabo-image-id-required']);
  const request={method:'POST',url:'https://api.contabo.com/v1/compute/instances',headers:{'content-type':'application/json','x-request-id':'GENERATE_UUID4_AT_EXECUTION','authorization':'BEARER_TOKEN_AT_EXECUTION'},body:{imageId:image,productId:'V153',region:'EU',sshKeys:[ssh],period:1,displayName:'uberdoso-mail-cell',defaultUser:'admin',...(userData?{userData}:{})},authorizationScope:'CONTABO_MAIL_CELL_CREATE',planDigest:purchasePlanResult.plan.planDigest,credentialMaterialIncluded:false};
  request.requestDigest=hash(request);
  return{ok:true,status:'CONTABO_CREATE_INSTANCE_REQUEST_COMPILED',request,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),truthBoundary:'This compiler creates a request document only. It does not authenticate, call Contabo, purchase, deploy, or spend.'};
}

export function compileObservedContaboMailCell({instance={},ptrEvidence={},transportEvidence={},dockerEvidence={},postalImage='',mariaDbImage='',verifiedAt=new Date(),evidenceRefs=[]}={}){
  const at=verifiedAt instanceof Date?verifiedAt:new Date(verifiedAt);if(!Number.isFinite(at.getTime()))return fail(['valid-observation-time-required']);
  const ip=text(instance?.ipConfig?.v4?.ip,64);const cpu=Number(instance.cpuCores),ramMb=Number(instance.ramMb),diskMb=Number(instance.diskMb);
  const refs=[...new Set((Array.isArray(evidenceRefs)?evidenceRefs:[]).map(v=>text(v,1200)).filter(Boolean))];
  const reasons=[];
  if(instance.productId!=='V153'||instance.region!=='EU'||String(instance.status).toLowerCase()!=='running')reasons.push('running-v153-eu-instance-required');
  if(!ip||!Number.isFinite(cpu)||cpu<4||!Number.isFinite(ramMb)||ramMb<8192||!Number.isFinite(diskMb)||diskMb<102400)reasons.push('observed-instance-capacity-required');
  if(ptrEvidence.hostname!=='mta.uberbond.cloud'||ptrEvidence.observed!==true)reasons.push('observed-controlled-ptr-required');
  if(transportEvidence.outboundPort25Observed!==true||transportEvidence.inboundPort25Observed!==true)reasons.push('observed-bidirectional-smtp-reachability-required');
  if(dockerEvidence.available!==true||dockerEvidence.persistentStorage!==true)reasons.push('observed-docker-and-persistent-storage-required');
  if(!refs.length)reasons.push('physical-evidence-references-required');
  if(reasons.length)return fail(reasons);
  const cellRaw={cellId:`contabo-uberdoso-${instance.instanceId}`,resourceType:'COMPUTE',provider:'contabo',sourceRef:refs[0],verifiedAt:at.toISOString(),capabilityTags:['mail-host','static-ipv4','editable-ptr','port-25','docker','persistent-storage'],allowedDataClasses:['SOURCE_CODE','INTERNAL_NON_SECRET'],availableUnits:1,costCents:0,reliability:0.8,latencyScore:0.7,privacyScore:0.7,trustScore:0.7,reversibilityScore:0.9,ownershipClass:'THIRD_PARTY_REPLACEABLE',networkMode:'PUBLIC_INTERNET',credentialCustody:'OWNER'};
  const normalized=normalizeResourceCell(cellRaw);if(!normalized.ok)return fail(['ubercloud-cell-normalization-refused',...(normalized.reasonCodes||[])]);
  const hostEvidence={publicIpv4:ip,ptrHostname:ptrEvidence.hostname,outboundPort25Observed:true,inboundPort25Observed:true,dockerAvailable:true,persistentStorage:true,cpuCores:cpu,ramBytes:ramMb*1024**2,diskBytes:diskMb*1024**2,evidenceRefs:refs};
  const activation=compileUberDosoActivation({postalImage,mariaDbImage,hostEvidence,date:at});
  return{ok:true,status:'CONTABO_MAIL_CELL_PHYSICALLY_OBSERVED',cell:normalized.cell,hostEvidence,uberdosoActivation:activation,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),truthBoundary:'Observed compute may satisfy the physical host boundary, but UberDoso activation remains blocked until its own image/DKIM/DNS evidence gates pass.'};
}
