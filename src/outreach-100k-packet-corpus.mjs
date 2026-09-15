import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import readline from 'node:readline';

export const OUTREACH_100K_CORPUS_VERSION='uberbond.outreach-100k-packet-corpus.v1.1';
const clean=(v,n=2000)=>String(v??'').trim().slice(0,n);
const int=v=>Number.isFinite(Number(v))&&Number(v)>=0?Math.floor(Number(v)):null;
const email=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
function localParts(timeZone,date){try{return Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}catch{return null;}}
function fail(reasonCodes,extra={}){return{ok:false,status:'OUTREACH_100K_CORPUS_REFUSED',reasonCodes:[...new Set(reasonCodes)],...extra};}

export async function inspectOutreach100kPacketCorpus({filePath,mailboxes=[],campaignId='',expectedCount=100_000,maxBytes=2_000_000_000,businessHourStart=9,businessHourEnd=17,now=new Date()}={}){
  const reasons=[];const target=String(filePath||'');
  let stat;try{stat=await fsp.lstat(target);}catch{return fail(['packet-corpus-file-required']);}
  if(!stat.isFile()||stat.isSymbolicLink())return fail(['packet-corpus-bounded-regular-file-required']);
  if(stat.size<=0||stat.size>maxBytes)return fail(['packet-corpus-size-out-of-range'],{byteLength:stat.size});
  const expected=int(expectedCount);if(expected==null||expected<1)return fail(['positive-expected-count-required']);
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now||''));if(!Number.isFinite(nowMs))return fail(['valid-reference-time-required']);
  const mailboxMap=new Map((Array.isArray(mailboxes)?mailboxes:[]).map(x=>[clean(x.mailboxId,240),x]).filter(([id])=>id));
  if(!mailboxMap.size)return fail(['ready-mailbox-fleet-required']);
  const recipients=new Set(),idem=new Set(),accounts=new Set();
  const providerCounts={},mailboxCounts={},hourBuckets={};
  const mailboxTimes=new Map();let count=0,lastNotBefore=-Infinity;
  const hash=crypto.createHash('sha256');
  const stream=fs.createReadStream(target);stream.on('data',chunk=>hash.update(chunk));
  const rl=readline.createInterface({input:stream,crlfDelay:Infinity});
  for await(const line of rl){
    if(!line.trim())continue; count+=1;
    if(count>expected){reasons.push('packet-corpus-count-exceeds-target');break;}
    let p;try{p=JSON.parse(line);}catch{reasons.push(`packet-${count}:valid-json-required`);continue;}
    const to=clean(p?.message?.to,320).toLowerCase(),recipientId=clean(p?.recipientId,240),provider=clean(p?.recipientProviderId,120).toLowerCase();
    const mailboxId=clean(p?.mailboxId,240),idempotencyKey=clean(p?.idempotencyKey,500),accountKey=clean(p?.accountKey,500),notBefore=clean(p?.notBefore,100),tz=clean(p?.recipientTimeZone,120);
    if(!recipientId)reasons.push(`packet-${count}:recipient-id-required`);
    if(!email(to))reasons.push(`packet-${count}:valid-recipient-email-required`);
    if(recipients.has(to))reasons.push(`packet-${count}:duplicate-recipient`); else recipients.add(to);
    if(!provider)reasons.push(`packet-${count}:recipient-provider-required`); else providerCounts[provider]=(providerCounts[provider]||0)+1;
    if(!idempotencyKey)reasons.push(`packet-${count}:idempotency-key-required`); else if(idem.has(idempotencyKey))reasons.push(`packet-${count}:duplicate-idempotency-key`); else idem.add(idempotencyKey);
    if(accountKey){if(accounts.has(accountKey))reasons.push(`packet-${count}:duplicate-account-day`);else accounts.add(accountKey);}
    const box=mailboxMap.get(mailboxId);if(!box||box.ready===false)reasons.push(`packet-${count}:ready-mailbox-required`);else mailboxCounts[mailboxId]=(mailboxCounts[mailboxId]||0)+1;
    if(clean(p?.campaignId,240)!==clean(campaignId,240))reasons.push(`packet-${count}:campaign-mismatch`);
    if(!clean(p?.message?.subject,998)||!clean(p?.message?.body,100000))reasons.push(`packet-${count}:complete-message-required`);
    const recipient=p?.launchInput?.recipient||{},legal=p?.launchInput?.legal||{},suppression=p?.launchInput?.suppression||{},auth=p?.dispatchAuthorization||{};
    if(clean(recipient?.email,320).toLowerCase()!==to)reasons.push(`packet-${count}:launch-recipient-mismatch`);
    if(clean(p?.launchInput?.campaign?.id,240)!==clean(campaignId,240))reasons.push(`packet-${count}:launch-campaign-mismatch`);
    if(recipient?.verified!==true||recipient?.safeForOutreach!==true||!clean(recipient?.verificationEvidenceRef,1500))reasons.push(`packet-${count}:recipient-verification-evidence-required`);
    if(legal?.eligible!==true||String(legal?.status||'PASSED').toUpperCase()!=='PASSED'||!clean(legal?.evidenceId,1000)||!clean(legal?.policyVersion,160))reasons.push(`packet-${count}:recipient-legal-evidence-required`);
    if(suppression?.checked!==true||suppression?.suppressed===true||suppression?.unsubscribeRequested===true||suppression?.unsubscribed===true)reasons.push(`packet-${count}:recipient-suppression-gate-not-precleared`);
    const at=new Date(notBefore);if(!notBefore||!Number.isFinite(at.getTime()))reasons.push(`packet-${count}:valid-not-before-required`);
    else {
      if(at.getTime()<lastNotBefore)reasons.push(`packet-${count}:corpus-not-globally-sorted-by-not-before`);lastNotBefore=Math.max(lastNotBefore,at.getTime());
      if(auth?.authorized!==true||!clean(auth?.receiptId,240)||!clean(auth?.authorizedBy,240)||clean(auth?.recipientEmail,320).toLowerCase()!==to||clean(auth?.campaignId,240)!==clean(campaignId,240))reasons.push(`packet-${count}:exact-dispatch-authorization-required`);
      const authExpiry=Date.parse(String(auth?.expiresAt||''));if(!Number.isFinite(authExpiry)||authExpiry<=at.getTime()||authExpiry<=nowMs)reasons.push(`packet-${count}:dispatch-authorization-must-cover-scheduled-send`);
      if(box){
        const hour=at.toISOString().slice(0,13);const key=`${mailboxId}|${hour}`;hourBuckets[key]=(hourBuckets[key]||0)+1;
        const parts=localParts(tz,at);const h=parts?Number(parts.hour):NaN;if(!parts||['Sat','Sun'].includes(parts.weekday)||h<businessHourStart||h>=businessHourEnd)reasons.push(`packet-${count}:recipient-business-window-required`);
        const prev=mailboxTimes.get(mailboxId);const gap=Math.max(0,Number(box.minGapSeconds||0)*1000);if(prev!=null&&at.getTime()-prev<gap)reasons.push(`packet-${count}:mailbox-cadence-violation`);mailboxTimes.set(mailboxId,at.getTime());
      }
    }
    if(reasons.length>1000)break;
  }
  if(count!==expected)reasons.push('packet-corpus-exact-count-required');
  for(const [mailboxId,n] of Object.entries(mailboxCounts)){
    const box=mailboxMap.get(mailboxId);if(n>Number(box?.remainingDailyCap||0))reasons.push(`mailbox:${mailboxId}:daily-allocation-exceeds-observed-capacity`);
  }
  for(const [key,n] of Object.entries(hourBuckets)){
    const [mailboxId]=key.split('|');const box=mailboxMap.get(mailboxId);if(n>Number(box?.observedHourlyCap||0))reasons.push(`mailbox:${mailboxId}:hourly-allocation-exceeds-observed-capacity`);
  }
  const digest=`sha256:${hash.digest('hex')}`;
  if(reasons.length)return fail(reasons.slice(0,1200),{count,byteLength:stat.size,recipientSetDigest:digest});
  const observedAt=new Date(stat.mtimeMs).toISOString();
  return {ok:true,status:'OUTREACH_100K_CORPUS_READY',version:OUTREACH_100K_CORPUS_VERSION,count,byteLength:stat.size,recipientSetDigest:digest,recipientProviderCounts:providerCounts,mailboxCounts,hourBucketCount:Object.keys(hourBuckets).length,inventory:{eligibleVerifiedUnsuppressedRemaining:count,recipientSetDigest:digest,recipientProviderCounts:providerCounts,observedAt,evidenceRef:`file:${target}#${digest}`},schedule:{ready:true,remainingDispatchCapacityToday:count,observedAt,evidenceRef:`file:${target}#${digest}`,mailboxCounts,hourBucketCount:Object.keys(hourBuckets).length},truthBoundary:'READY proves the exact NDJSON corpus contains the expected unique precleared recipients, exact per-recipient dispatch authorization valid through scheduled send time, and a globally ordered mailbox/time schedule inside supplied daily/hourly/cadence and recipient-business-window constraints. It does not itself send mail.'};
}
