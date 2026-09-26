import crypto from 'node:crypto';
import { encryptJson, decryptJson } from './crypto.mjs';
import { createUberSmtpSubmissionTransport } from './ubersmtp-submission-adapter.mjs';

export const UBERFLEET_VERSION='uberbond.uberfleet.v1';
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
const stable=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');

export function buildEncryptedSmtpAccount({
  slot='',email='',provider='smtp-relay',host='',port=465,secure=true,username='',password='',
  sendingDomainId='',sendingMailboxId='',sendingWorkspaceId='',routeEvidenceRef='',
  routeAuthorized=false,termsCompatible=false,plannedDailyCap=0,plannedHourlyCap=0,minGapSeconds=0
}={},encryptionKey=''){
  const reasons=[];
  const normalizedEmail=clean(email,320).toLowerCase();
  const normalizedSlot=clean(slot||`smtp:${stable(normalizedEmail).slice(0,20)}`,120);
  const normalizedHost=clean(host,253);
  const p=Number(port);
  if(!normalizedSlot)reasons.push('slot-required');
  if(!emailOk(normalizedEmail))reasons.push('valid-email-required');
  if(!normalizedHost)reasons.push('smtp-host-required');
  if(!Number.isInteger(p)||p<1||p>65535)reasons.push('valid-smtp-port-required');
  if(!clean(username,500)||!String(password||''))reasons.push('smtp-credential-pair-required');
  if(!clean(sendingDomainId,120)||!clean(sendingMailboxId,120)||!clean(sendingWorkspaceId,120))reasons.push('domain-mailbox-workspace-linkage-required');
  if(!clean(routeEvidenceRef,1500))reasons.push('route-evidence-required');
  if(routeAuthorized!==true)reasons.push('route-authorization-required');
  if(termsCompatible!==true)reasons.push('route-terms-compatibility-required');
  const daily=Number(plannedDailyCap), hourly=Number(plannedHourlyCap), gap=Number(minGapSeconds);
  if(!Number.isFinite(daily)||daily<0)reasons.push('valid-planned-daily-cap-required');
  if(!Number.isFinite(hourly)||hourly<0)reasons.push('valid-planned-hourly-cap-required');
  if(!Number.isFinite(gap)||gap<0)reasons.push('valid-min-gap-required');
  if(reasons.length)return {ok:false,status:'UBERFLEET_ACCOUNT_REFUSED',reasonCodes:[...new Set(reasons)]};
  const tokens=encryptJson({kind:'smtp-basic',username:clean(username,500),password:String(password)},encryptionKey);
  return {
    ok:true,
    status:'UBERFLEET_ACCOUNT_READY_FOR_IMPORT',
    account:{
      id:`smtp-${stable(normalizedEmail).slice(0,24)}`,
      slot:normalizedSlot,
      email:normalizedEmail,
      provider:clean(provider,80).toLowerCase()||'smtp-relay',
      connected:true,
      tokens,
      sendingDomainId:clean(sendingDomainId,120),
      sendingMailboxId:clean(sendingMailboxId,120),
      sendingWorkspaceId:clean(sendingWorkspaceId,120),
      plannedDailyCap:Math.floor(daily),
      plannedHourlyCap:Math.floor(hourly),
      minGapSeconds:Math.floor(gap),
      smtpRoute:{
        host:normalizedHost,port:p,secure:secure!==false,
        evidenceRef:clean(routeEvidenceRef,1500),
        authorized:true,termsCompatible:true
      }
    },
    secretPersistence:'AES_256_GCM_ENCRYPTED_IN_ACCOUNT_TOKENS',
    plaintextCredentialReturned:false
  };
}

export function openSmtpAccountCredential(account={},encryptionKey=''){
  const secret=decryptJson(account.tokens,encryptionKey);
  if(secret?.kind!=='smtp-basic'||!clean(secret.username,500)||!String(secret.password||''))throw new Error('invalid-encrypted-smtp-account-credential');
  return {username:clean(secret.username,500),password:String(secret.password)};
}

function healthMap(rows=[]){return new Map((Array.isArray(rows)?rows:[]).map(x=>[String(x?.inbox||''),x]));}
function todayUsage(events=[],day){
  const m=new Map();
  for(const e of Array.isArray(events)?events:[]){
    if(String(e?.eventType||'')!=='sent')continue;
    if(!String(e?.occurredAt||e?.createdAt||'').startsWith(day))continue;
    const slot=String(e?.inbox||''); if(slot)m.set(slot,(m.get(slot)||0)+1);
  }
  return m;
}
function eligibleAccount(account,health,provider){
  if(account?.connected!==true||!emailOk(account?.email))return false;
  if(provider&&String(account?.provider||'').toLowerCase()!==provider)return false;
  if(health?.paused===true)return false;
  if(account?.provider==='smtp-relay'){
    if(!account?.smtpRoute?.authorized||!account?.smtpRoute?.termsCompatible||!clean(account?.smtpRoute?.evidenceRef,1500))return false;
    if(!account?.tokens)return false;
  }
  return true;
}
export function selectFleetMailbox({
  prospectId='',currentSlot='',accounts=[],senderHealth=[],outboundEvents=[],provider='',date=new Date()
}={}){
  const h=healthMap(senderHealth);
  const normalizedProvider=clean(provider,80).toLowerCase();
  const candidates=(Array.isArray(accounts)?accounts:[]).filter(a=>eligibleAccount(a,h.get(String(a.slot||'')),normalizedProvider));
  if(!candidates.length)return {ok:false,status:'UBERFLEET_NO_ELIGIBLE_MAILBOX',reasonCodes:['no-healthy-connected-provider-matched-mailbox']};
  const sticky=candidates.find(a=>String(a.slot||'')===String(currentSlot||''));
  if(sticky)return {ok:true,status:'UBERFLEET_STICKY_MAILBOX',slot:sticky.slot,accountId:sticky.id,email:sticky.email};
  const day=(date instanceof Date?date:new Date(date)).toISOString().slice(0,10);
  const usage=todayUsage(outboundEvents,day);
  const ranked=candidates.map(a=>{
    const used=usage.get(String(a.slot||''))||0;
    const cap=Number(a.currentDailyCap??a.plannedDailyCap??a.dailyCap??0);
    const ratio=cap>0?used/cap:used;
    const tie=stable(`${prospectId}:${a.slot}`);
    return {a,used,cap,ratio,tie};
  }).sort((x,y)=>x.ratio-y.ratio||x.used-y.used||x.tie.localeCompare(y.tie));
  const chosen=ranked[0];
  return {
    ok:true,status:'UBERFLEET_MAILBOX_ALLOCATED',
    slot:chosen.a.slot,accountId:chosen.a.id,email:chosen.a.email,
    usedToday:chosen.used,declaredCap:chosen.cap||null,
    truthBoundary:'Selection uses only currently connected, non-paused, provider-matched accounts. It does not create provider capacity or reputation.'
  };
}

export async function dispatchSmtpFleetAccount({
  account={},encryptionKey='',message={},transportFactory=createUberSmtpSubmissionTransport
}={}){
  const route=account?.smtpRoute||{};
  let credential;
  try{credential=openSmtpAccountCredential(account,encryptionKey);}
  catch(error){return {classification:'REJECTED',reasonCodes:['smtp-account-credential-unavailable'],dispatchError:clean(error.message,300)};}
  const transport=transportFactory({
    host:route.host,port:route.port,secure:route.secure!==false,
    username:credential.username,password:credential.password,
    authorized:route.authorized===true,termsCompatible:route.termsCompatible===true,
    evidenceRef:route.evidenceRef
  });
  if(!transport?.ok||typeof transport.send!=='function')return {classification:'REJECTED',reasonCodes:transport?.reasonCodes||['smtp-transport-not-ready']};
  try{
    const result=await transport.send({...message,from:message.from||account.email});
    if(result?.confirmed!==true||!clean(result.providerReceiptId,500))return {classification:'UNCERTAIN',reasonCodes:['smtp-provider-confirmation-required'],messageId:result?.messageId||null};
    return {
      classification:'ACCEPTED',
      providerReferenceId:clean(result.providerReceiptId,500),
      messageId:clean(result.messageId,500)||'',
      evidence:{provider:'smtp-relay',receiptId:clean(result.providerReceiptId,500),routeEvidenceRef:clean(route.evidenceRef,1500)}
    };
  }catch(error){
    return {classification:'UNCERTAIN',reasonCodes:['smtp-provider-call-threw'],dispatchError:clean(error.message,500),automaticRetryAuthorized:false};
  }
}
