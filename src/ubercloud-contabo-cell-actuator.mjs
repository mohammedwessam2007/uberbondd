import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERCLOUD_CONTABO_CELL_VERSION='uberbond.ubercloud-contabo-cell.v1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const IPV4=/^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const CURRENCIES=new Set(['EUR','USD']);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const integer=(v,min=0,max=10_000_000)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;};
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const fail=(reasonCodes,extra={})=>({ok:false,status:'UBERCLOUD_CONTABO_CELL_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',spendAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero(),...extra});

function quoteEvidence(raw={},nowMs){
  const productId=text(raw.productId,40)?.toUpperCase();
  const productName=text(raw.productName,120);
  const monthlyPriceCents=integer(raw.monthlyPriceCents,1);
  const setupFeeCents=integer(raw.setupFeeCents??0,0);
  const currency=text(raw.currency,3)?.toUpperCase();
  const evidenceRef=text(raw.evidenceRef,1000);
  const observedMs=Date.parse(text(raw.observedAt,100)||'');
  const expiresMs=Date.parse(text(raw.expiresAt,100)||'');
  const reasons=[];
  if(productId!=='V153'||productName!=='Cloud VPS 4')reasons.push('contabo-cloud-vps-4-quote-required');
  if(monthlyPriceCents==null||setupFeeCents==null||!CURRENCIES.has(currency))reasons.push('bounded-current-price-required');
  if(!evidenceRef)reasons.push('price-evidence-reference-required');
  if(!Number.isFinite(observedMs)||!Number.isFinite(expiresMs)||observedMs>nowMs||expiresMs<nowMs||expiresMs<=observedMs)reasons.push('current-price-validity-window-required');
  return reasons.length?{ok:false,reasonCodes:reasons}:{ok:true,quote:{productId,productName,monthlyPriceCents,setupFeeCents,currency,evidenceRef,observedAt:new Date(observedMs).toISOString(),expiresAt:new Date(expiresMs).toISOString(),expectedInitialSpendCents:monthlyPriceCents+setupFeeCents}};
}

export function compileContaboMailCellPlan({
  sourceCommit,
  quote,
  regionId,
  imageId,
  sshKeySecretId,
  hostname='mta.uberbond.cloud',
  period=1,
  now=new Date()
}={}){
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  if(!Number.isFinite(nowMs))return fail(['valid-observation-time-required']);
  const source=text(sourceCommit,40)?.toLowerCase();
  const region=text(regionId,120),image=text(imageId,160),host=text(hostname,253)?.toLowerCase();
  const sshKey=integer(sshKeySecretId,1,Number.MAX_SAFE_INTEGER);
  const reasons=[];
  if(!SHA40.test(source||''))reasons.push('exact-source-commit-required');
  const observedQuote=quoteEvidence(quote,nowMs);if(!observedQuote.ok)reasons.push(...observedQuote.reasonCodes);
  if(!region||!image)reasons.push('contabo-region-and-image-required');
  if(sshKey==null)reasons.push('contabo-ssh-key-secret-id-required');
  if(host!=='mta.uberbond.cloud')reasons.push('canonical-mail-hostname-required');
  if(period!==1)reasons.push('one-month-initial-period-required');
  if(reasons.length)return fail(reasons);
  const plan={
    schemaVersion:'uberbond.contabo-mail-cell-plan.v1',
    provider:'contabo',
    serviceId:'uberdoso-owned-mail-cell',
    sourceCommit:source,
    hostname:host,
    quote:observedQuote.quote,
    request:{
      productId:'V153',
      regionId:region,
      imageId:image,
      period:1,
      displayName:'uberdoso-mail-cell',
      defaultUser:'admin',
      sshKeys:[sshKey]
    },
    handoff:{nextControlPlane:'UBERCEL_UBERLIT_LINUX',nextRuntime:'UBERDOSO_POSTAL',requiredObservation:['instance-id','public-ipv4','ptr-updated','host-reachability']},
    businessEffectAuthority:'NONE',
    spendAuthority:'NONE',
    deploymentAuthority:'NONE'
  };
  return{ok:true,status:'CONTABO_MAIL_CELL_PLAN_READY',plan,planDigest:digest(plan),businessEffectAuthority:'NONE',spendAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero()};
}

function validateAuthorization(raw={},planResult,nowMs){
  const reasons=[];
  const id=text(raw.authorizationId,200),evidenceRef=text(raw.evidenceRef,1000);
  const planDigest=text(raw.planDigest,80)?.toLowerCase();
  const approvedByRole=text(raw.approvedByRole,80)?.toUpperCase();
  const currency=text(raw.currency,3)?.toUpperCase();
  const maxSpendCents=integer(raw.maxSpendCents,1);
  const approvedMs=Date.parse(text(raw.approvedAt,100)||''),expiresMs=Date.parse(text(raw.expiresAt,100)||'');
  if(!id||!evidenceRef||approvedByRole!=='FOUNDER')reasons.push('explicit-founder-authorization-required');
  if(!SHA256.test(planDigest||'')||planDigest!==planResult?.planDigest)reasons.push('authorization-plan-digest-mismatch');
  if(raw.spendAuthority!=='EXPLICIT_ONE_SHOT'||raw.oneShot!==true)reasons.push('one-shot-spend-authority-required');
  if(currency!==planResult?.plan?.quote?.currency)reasons.push('authorization-currency-mismatch');
  if(maxSpendCents==null||maxSpendCents<Number(planResult?.plan?.quote?.expectedInitialSpendCents||Infinity))reasons.push('spend-ceiling-below-current-quote');
  if(!Number.isFinite(approvedMs)||!Number.isFinite(expiresMs)||approvedMs>nowMs||expiresMs<nowMs||expiresMs<=approvedMs)reasons.push('current-bounded-authorization-window-required');
  return reasons.length?{ok:false,reasonCodes:reasons}:{ok:true,authorization:{authorizationId:id,evidenceRef,approvedByRole,planDigest,currency,maxSpendCents,approvedAt:new Date(approvedMs).toISOString(),expiresAt:new Date(expiresMs).toISOString(),spendAuthority:'EXPLICIT_ONE_SHOT',oneShot:true}};
}

export async function executeContaboMailCellAcquisition({
  planResult,
  authorization,
  claimAuthorization,
  client,
  now=new Date()
}={}){
  if(!planResult?.ok||planResult.status!=='CONTABO_MAIL_CELL_PLAN_READY'||!planResult.plan||digest(planResult.plan)!==planResult.planDigest)return fail(['valid-contabo-mail-cell-plan-required']);
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));if(!Number.isFinite(nowMs))return fail(['valid-observation-time-required']);
  const auth=validateAuthorization(authorization,planResult,nowMs);if(!auth.ok)return fail(auth.reasonCodes);
  if(typeof claimAuthorization!=='function')return fail(['durable-spend-authorization-claimant-required']);
  if(!client||typeof client.createInstance!=='function')return fail(['contabo-api-client-required']);
  const claim=await claimAuthorization({authorizationId:auth.authorization.authorizationId,planDigest:planResult.planDigest,maxSpendCents:auth.authorization.maxSpendCents,currency:auth.authorization.currency});
  if(!claim?.ok||!text(claim.claimRef,1000))return fail(['spend-authorization-already-used-or-unclaimable']);

  let created;
  try{created=await client.createInstance(structuredClone(planResult.plan.request));}
  catch(error){return{ok:false,status:'CONTABO_MAIL_CELL_ACQUISITION_UNCERTAIN',reasonCodes:['instance-create-threw-after-spend-authorization-claim'],claimRef:claim.claimRef,errorClass:error?.name||'Error',businessEffectAuthority:'NONE',spendAuthority:'CONSUMED',deploymentAuthority:'CONSUMED',externalEffectLedger:{...zero(),providerCalls:null,purchases:null,deployments:null,spendCents:null}};}
  const instanceId=text(created?.instanceId,120);
  if(!created?.ok||!instanceId)return{ok:false,status:'CONTABO_MAIL_CELL_ACQUISITION_UNCERTAIN',reasonCodes:['canonical-instance-creation-receipt-required'],claimRef:claim.claimRef,businessEffectAuthority:'NONE',spendAuthority:'CONSUMED',deploymentAuthority:'CONSUMED',externalEffectLedger:{...zero(),providerCalls:null,purchases:null,deployments:null,spendCents:null}};
  const ip=text(created.publicIpv4,64);
  const receipt={
    schemaVersion:UBERCLOUD_CONTABO_CELL_VERSION,
    provider:'contabo',
    instanceId,
    publicIpv4:IPV4.test(ip||'')?ip:null,
    hostname:planResult.plan.hostname,
    sourceCommit:planResult.plan.sourceCommit,
    planDigest:planResult.planDigest,
    authorizationId:auth.authorization.authorizationId,
    authorizationEvidenceRef:auth.authorization.evidenceRef,
    claimRef:claim.claimRef,
    quoteEvidenceRef:planResult.plan.quote.evidenceRef,
    expectedInitialSpendCents:planResult.plan.quote.expectedInitialSpendCents,
    currency:planResult.plan.quote.currency,
    nextControlPlane:'UBERCEL_UBERLIT_LINUX',
    nextRuntime:'UBERDOSO_POSTAL',
    ptrStatus:'PENDING_OBSERVATION_OR_UPDATE',
    truthBoundary:'This receipt proves the provider reported an instance creation after an explicitly bounded one-shot founder spend authorization. It does not prove PTR, SMTP reachability, persistent UberLit/Postal operation, DKIM, DNS publication, mailbox health, or delivery authority.'
  };
  return{ok:true,status:'CONTABO_MAIL_CELL_ACQUIRED__PHYSICAL_RECONCILIATION_REQUIRED',receipt,receiptDigest:digest(receipt),businessEffectAuthority:'NONE',spendAuthority:'CONSUMED',deploymentAuthority:'CONSUMED',externalEffectLedger:{...zero(),providerCalls:1,purchases:1,deployments:1,spendCents:planResult.plan.quote.expectedInitialSpendCents}};
}

export function createContaboApiClient({clientId,clientSecret,apiUser,apiPassword,fetchFn=globalThis.fetch,requestId=()=>crypto.randomUUID()}={}){
  const cid=text(clientId,500),secret=text(clientSecret,1000),user=text(apiUser,500),password=text(apiPassword,1000);
  if(!cid||!secret||!user||!password||typeof fetchFn!=='function')throw new Error('contabo-runtime-credentials-and-fetch-required');
  let token=null;
  async function accessToken(){
    if(token)return token;
    const body=new URLSearchParams({client_id:cid,client_secret:secret,username:user,password,grant_type:'password'});
    const response=await fetchFn('https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
    if(!response?.ok)throw new Error(`contabo-auth-failed:${response?.status??'unknown'}`);
    const json=await response.json();token=text(json?.access_token,10_000);if(!token)throw new Error('contabo-access-token-required');return token;
  }
  return{
    async createInstance(request){
      const bearer=await accessToken();
      const response=await fetchFn('https://api.contabo.com/v1/compute/instances',{method:'POST',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json','x-request-id':requestId()},body:JSON.stringify(request)});
      if(!response?.ok)throw new Error(`contabo-instance-create-failed:${response?.status??'unknown'}`);
      const json=await response.json();
      const instanceId=text(json?.instanceId??json?.data?.[0]?.instanceId,120);
      const publicIpv4=text(json?.ipConfig?.v4?.ip??json?.data?.[0]?.ipConfig?.v4?.ip??json?.publicIpv4,64);
      return{ok:Boolean(instanceId),instanceId,publicIpv4:IPV4.test(publicIpv4||'')?publicIpv4:null,rawStatus:'CREATED'};
    },
    async setPtr({ip,ptr}){
      const address=text(ip,64),hostname=text(ptr,253)?.toLowerCase();
      if(!IPV4.test(address||'')||!hostname)throw new Error('valid-ip-and-ptr-required');
      const bearer=await accessToken();
      const response=await fetchFn(`https://api.contabo.com/v1/dns/ptrs/${encodeURIComponent(address)}`,{method:'PUT',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json','x-request-id':requestId()},body:JSON.stringify({ptr:hostname})});
      if(!response?.ok)throw new Error(`contabo-ptr-update-failed:${response?.status??'unknown'}`);
      return{ok:true,status:'PTR_UPDATE_ACCEPTED',ip:address,ptr:hostname};
    }
  };
}
