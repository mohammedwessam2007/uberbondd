import { createWinnrApiClient, WINNR_WEBHOOK_EVENTS } from './uberwinnr-adapter.mjs';

export const UBERWINNR_PROVIDER_CONTRACT_VERSION='uberbond.uberwinnr-provider-contract.v1';

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const lower=(v,n=1000)=>clean(v,n).toLowerCase();
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());

function blocked(capability,reasonCodes=['provider-client-not-ready']){
  return {ok:false,provider:'winnr',capability,status:'WINNR_PROVIDER_BLOCKED',reasonCodes,externalEffectAuthority:'NONE'};
}
function unsupported(capability,reason){
  return {ok:false,provider:'winnr',capability,status:'UNSUPPORTED_CAPABILITY',reason:clean(reason,500),externalEffectAuthority:'NONE'};
}
function approvalDecision(capability,ownerApproval={},estimatedCostCents=null,now=new Date()){
  if(ownerApproval?.granted!==true||!clean(ownerApproval?.grantedBy,120))return {ok:false,status:'OWNER_APPROVAL_REQUIRED'};
  const expiry=Date.parse(ownerApproval?.expiresAt||'');
  if(!Number.isFinite(expiry)||expiry<=now.getTime())return {ok:false,status:'OWNER_APPROVAL_EXPIRED'};
  const scopes=(Array.isArray(ownerApproval?.scope)?ownerApproval.scope:[ownerApproval?.scope]).map(v=>clean(v,160)).filter(Boolean);
  if(!scopes.some(scope=>['*',capability,`winnr:${capability}`].includes(scope)))return {ok:false,status:'OWNER_APPROVAL_SCOPE_MISMATCH'};
  const cost=Number(estimatedCostCents);
  if(Number.isFinite(cost)){
    const limit=Number(ownerApproval?.spendLimitCents);
    if(!Number.isFinite(limit)||cost>limit)return {ok:false,status:'SPEND_LIMIT_EXCEEDED'};
  }
  return {ok:true};
}
function normalizedMailbox(row={}){
  const address=lower(row.email||row.address||row.user_name||row.username,320);
  return {
    id:clean(row.id||row.user_id||row.userId||address,240)||null,
    address:emailOk(address)?address:null,
    domain:lower(row.domain||address.split('@')[1],253)||null,
    status:clean(row.status||row.state,120).toUpperCase()||'UNKNOWN',
    currentDailyCap:Number.isFinite(Number(row.daily_limit??row.dailyLimit??row.send_limit??row.sendLimit))?Number(row.daily_limit??row.dailyLimit??row.send_limit??row.sendLimit):null
  };
}
function normalizedDomain(row={}){
  return {
    id:clean(row.id||row.domain_id||row.domainId,240)||null,
    domain:lower(row.domain||row.name,253)||null,
    status:clean(row.status||row.state,120).toUpperCase()||'UNKNOWN',
    dnsStatus:clean(row.dns_status||row.dnsStatus,120).toUpperCase()||null
  };
}
function rows(data,keys=[]){
  if(Array.isArray(data))return data;
  for(const key of keys)if(Array.isArray(data?.[key]))return data[key];
  return [];
}

export function createWinnrInfrastructureAdapter(config={},options={}){
  const token=clean(config.apiKey||config.token,500);
  const configured=Boolean(token);
  const client=createWinnrApiClient({
    token,
    authorized:config.accountAuthorized===true,
    termsCompatible:config.termsCompatible===true,
    evidenceRef:clean(config.termsEvidenceRef,1500),
    fetchImpl:options.fetchImpl||globalThis.fetch
  });
  const clientReasons=client?.reasonCodes||[];
  const ready=()=>client?.ok===true;
  const read=async(capability,fn)=>{
    if(!ready())return blocked(capability,clientReasons.length?clientReasons:['winnr-client-not-ready']);
    return fn();
  };
  const write=async(capability,ownerApproval,estimatedCostCents,fn)=>{
    if(!ready())return blocked(capability,clientReasons.length?clientReasons:['winnr-client-not-ready']);
    const decision=approvalDecision(capability,ownerApproval,estimatedCostCents,options.now?.()||new Date());
    if(!decision.ok)return {ok:false,provider:'winnr',capability,status:decision.status,externalEffectAuthority:'NONE'};
    return fn();
  };

  return {
    providerName:'winnr',
    configured,
    policyVersion:UBERWINNR_PROVIDER_CONTRACT_VERSION,

    identity:async()=>({
      ok:configured,provider:'winnr',
      status:configured?'CONFIGURED_ADAPTER_PRESENT':'PROVIDER_AUTH_REQUIRED',
      authentication:'bearer-api-token',
      termsCompatible:config.termsCompatible===true,
      termsEvidenceRef:clean(config.termsEvidenceRef,1500)||null,
      liveExternalEffects:'explicit-owner-approval-required'
    }),
    authenticationMethod:async()=>({ok:true,provider:'winnr',status:'BEARER_API_TOKEN',authentication:'Authorization: Bearer <token>'}),
    dryRunSupported:async()=>({ok:true,provider:'winnr',status:'READ_ONLY_PREFLIGHT_SUPPORTED'}),
    liveSupported:async()=>({ok:ready(),provider:'winnr',status:ready()?'LIVE_PROVIDER_CLIENT_READY':'LIVE_PROVIDER_CLIENT_BLOCKED',reasonCodes:clientReasons}),
    outageState:async()=>({ok:true,provider:'winnr',status:'OBSERVE_FROM_PROVIDER_READS_AND_HTTP_RESULTS'}),
    termsAndAllowedPurposes:async()=>config.termsCompatible===true&&clean(config.termsEvidenceRef,1500)
      ? {ok:true,provider:'winnr',status:'TERMS_COMPATIBILITY_EVIDENCED',evidenceRef:clean(config.termsEvidenceRef,1500)}
      : {ok:false,provider:'winnr',status:'TERMS_COMPATIBILITY_UNPROVEN'},

    listWorkspaces:async()=>read('listWorkspaces',async()=>{
      const result=await client.getAccount();
      return result.ok?{...result,workspaces:[{id:clean(result.data?.id||result.data?.account_id,240)||'winnr-account',name:clean(result.data?.name,240)||'Winnr account'}]}:result;
    }),
    createWorkspace:async()=>unsupported('createWorkspace','Winnr is account-scoped; UberBond does not invent a workspace-creation endpoint.'),

    listMailboxes:async({domain=''}={})=>read('listMailboxes',async()=>{
      const result=await client.listMailboxes({domain});
      const items=rows(result.data,['email_users','users','items','results']);
      return result.ok?{...result,mailboxes:items.map(normalizedMailbox).filter(x=>x.id||x.address)}:result;
    }),
    mailboxHealth:async({mailboxId,email=''}={})=>read('mailboxHealth',async()=>{
      const id=clean(mailboxId,240);
      if(id){
        const result=await client.getMailbox({userId:id});
        return result.ok?{...result,mailbox:normalizedMailbox(result.data),mailboxState:normalizedMailbox(result.data).status}:result;
      }
      const address=lower(email,320);
      if(!emailOk(address))return blocked('mailboxHealth',['mailbox-id-or-email-required']);
      const result=await client.listMailboxes({domain:address.split('@')[1]});
      const item=rows(result.data,['email_users','users','items','results']).map(normalizedMailbox).find(x=>x.address===address);
      return !result.ok?result:item?{...result,mailbox:item,mailboxState:item.status}:{...result,ok:false,status:'MAILBOX_NOT_OBSERVED'};
    }),

    dnsRequirements:async({domainId}={})=>read('dnsRequirements',async()=>{
      const result=await client.getDnsRecords({domainId});
      return result.ok?{...result,status:'DNS_REQUIREMENTS_OBSERVED',expectedRecords:result.data}:result;
    }),
    verifyDns:async({domainId,ownerApproval=null}={})=>write('verifyDns',ownerApproval,null,()=>client.verifyDns({domainId,writeAuthorized:true})),
    warmupCapable:async()=>({ok:true,provider:'winnr',status:'OPTIONAL_PROVIDER_WARMUP_AVAILABLE_BUT_NOT_REQUIRED',required:false}),
    startWarmup:async()=>unsupported('startWarmup','UberWarm² owns the default evidence ramp; Winnr paid warming is an optional separately approved experiment.'),
    pauseWarmup:async()=>unsupported('pauseWarmup','UberWarm² does not require provider warming to launch the evidence canary.'),
    warmupStatus:async()=>({ok:true,provider:'winnr',status:'UBERWARM2_IS_CANONICAL_RAMP_STATE',providerWarmupRequired:false}),
    discoverSendingLimit:async(args={})=>{
      const result=await (args.mailboxId?read('discoverSendingLimit',()=>client.getMailbox({userId:args.mailboxId})):Promise.resolve(blocked('discoverSendingLimit',['mailbox-id-required'])));
      if(!result.ok)return result;
      const mailbox=normalizedMailbox(result.data);
      return {...result,status:'MAILBOX_PROVIDER_FACT_OBSERVED',mailbox,currentDailyCap:mailbox.currentDailyCap,truthBoundary:'A provider mailbox object does not create cold-send authority; UberWarm² remains the live cap.'};
    },
    bounceSignal:async()=>({ok:true,provider:'winnr',status:'USE_SIGNED_EMAIL_BOUNCED_WEBHOOK',event:'email.bounced'}),
    complaintSignal:async()=>({ok:true,provider:'winnr',status:'USE_SIGNED_EMAIL_COMPLAINED_WEBHOOK',event:'email.complained'}),
    replySignal:async()=>({ok:true,provider:'winnr',status:'USE_SIGNED_EMAIL_RECEIVED_WEBHOOK_OR_IMAP',event:'email.received'}),
    campaignStatus:async()=>unsupported('campaignStatus','Winnr supplies mailbox transport; UberBond owns campaign state.'),
    rateLimits:async()=>({ok:true,provider:'winnr',status:'OBSERVE_PROVIDER_HEADERS_AND_CURRENT_FIRST_PARTY_DOCS'}),
    receipts:async({operationId=''}={})=>({ok:true,provider:'winnr',status:'LOCAL_AND_PROVIDER_RECEIPT_RECONCILIATION_REQUIRED',operationId:clean(operationId,240)||null}),

    domainAvailability:async()=>unsupported('domainAvailability','UberBond first-cash route uses marketplace inventory rather than buying a fresh provider domain.'),
    listDomains:async()=>read('listDomains',async()=>{
      const result=await client.listDomains();
      const items=rows(result.data,['domains','items','results']);
      return result.ok?{...result,domains:items.map(normalizedDomain).filter(x=>x.id||x.domain)}:result;
    }),
    domainDns:async({domainId}={})=>read('domainDns',()=>client.getDnsRecords({domainId})),
    provisionDomains:async({domains=[],body=null,ownerApproval=null}={})=>write('provisionDomains',ownerApproval,null,()=>{
      const supplied=Array.isArray(body?.domains)?body.domains:domains;
      return client.connectOwnedDomains({domains:supplied,manualDns:body?.manual_dns!==false,writeAuthorized:true});
    }),
    provisionMailboxes:async({mailboxes=[],body=null,ownerApproval=null}={})=>write('provisionMailboxes',ownerApproval,null,()=>{
      const domain=lower(body?.domain,253);
      const users=Array.isArray(body?.users)?body.users:(Array.isArray(mailboxes)?mailboxes:[]).map(row=>({username:lower(row?.username||String(row?.email||'').split('@')[0],120),name:clean(row?.name||row?.firstName,200)}));
      if(!domain||!users.length)return Promise.resolve(blocked('provisionMailboxes',['domain-and-users-required']));
      return client.createMailboxesBulk({domain,users,writeAuthorized:true});
    }),
    configureDns:async()=>unsupported('configureDns','With manual DNS, publication belongs to the external DNS authority; Winnr only supplies records and verifies them.'),
    configureForwarding:async()=>unsupported('configureForwarding','Winnr exposes standard IMAP; UberBond does not require a forwarding SaaS.'),
    exportMailboxes:async({body=null,ownerApproval=null}={})=>write('exportMailboxes',ownerApproval,null,()=>{
      const request=body&&typeof body==='object'?body:{};
      return client.exportMailboxes({
        format:request.format||'default',
        domains:request.domains||[],
        emails:request.emails||[],
        allDomains:request.getAllDomains===true||request.allDomains===true,
        writeAuthorized:true
      });
    }),
    prewarmPurchase:async()=>unsupported('prewarmPurchase','The first paid pre-warmed canary remains an explicit founder checkout action; this adapter will not spend automatically.'),
    operationStatus:async({operationId='',path=''}={})=>read('operationStatus',()=>client.getJob({jobId:operationId||String(path||'').split('/').pop()})),
    webhookEvents:async()=>({ok:true,provider:'winnr',status:'SIGNED_WEBHOOK_EVENTS_DOCUMENTED',events:[...WINNR_WEBHOOK_EVENTS]}),
    cancel:async()=>unsupported('cancel','Pre-warmed cancellation is destructive and intentionally left as a separate explicit owner action.'),

    getAccount:()=>read('getAccount',()=>client.getAccount()),
    getUsage:()=>read('getUsage',()=>client.getUsage()),
    browsePrewarmed:(args={})=>read('browsePrewarmed',()=>client.browsePrewarmed(args)),
    getPrewarmed:({domain}={})=>read('getPrewarmed',()=>client.getPrewarmed({domain})),
    checkPrewarmedBlocklist:({domain,blocklist=''}={})=>read('checkPrewarmedBlocklist',()=>client.checkPrewarmedBlocklist({domain,blocklist})),
    listMyPrewarmed:()=>read('listMyPrewarmed',()=>client.listMyPrewarmed()),
    rawClient:client,
    truthBoundary:'The canonical Winnr adapter can observe and prepare provider state, but purchases remain founder-authorized. Provider objects, advertised health and API success never become recipient-network inbox placement or cold-send authority.'
  };
}
