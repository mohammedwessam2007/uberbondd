import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import { encryptJson, decryptJson } from './crypto.mjs';

export const UBERIMAP_VERSION='uberbond.uberimap.v1.2';
const clean=(v,n=2000)=>String(v??'').trim().slice(0,n);
const hash=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');
const loopback=h=>['127.0.0.1','::1','localhost'].includes(String(h||'').toLowerCase());
const quote=v=>`"${String(v??'').replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`;
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
function imapDate(value){
  const d=value instanceof Date?value:new Date(value||Date.now());
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getUTCDate()).padStart(2,'0')}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}
function waitForData(socket,predicate,{timeoutMs=30000,maxBytes=8*1024*1024}={}){
  return new Promise((resolve,reject)=>{
    let chunks=[],size=0;
    const timer=setTimeout(()=>done(new Error('imap-response-timeout')),timeoutMs);
    const onData=chunk=>{
      const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
      size+=b.length;
      if(size>maxBytes)return done(new Error('imap-response-too-large'));
      chunks.push(b);
      const buf=Buffer.concat(chunks);
      if(predicate(buf))done(null,buf);
    };
    const onError=err=>done(err);
    const onClose=()=>done(new Error('imap-connection-closed'));
    function done(err,value){
      clearTimeout(timer); socket.off('data',onData); socket.off('error',onError); socket.off('close',onClose);
      err?reject(err):resolve(value);
    }
    socket.on('data',onData);socket.once('error',onError);socket.once('close',onClose);
  });
}

function safeNetworkCode(error){
  const code=clean(error?.code||error?.name||'',80).toUpperCase().replace(/[^A-Z0-9_-]/g,'_');
  if(code&&code!=='ERROR')return code;
  const message=String(error?.message||'').toLowerCase();
  if(message.includes('timeout'))return'ETIMEDOUT';
  if(message.includes('certificate'))return'TLS_CERTIFICATE_ERROR';
  if(message.includes('greeting'))return'IMAP_GREETING_ERROR';
  return'UNKNOWN_NETWORK_ERROR';
}

/**
 * Open the IMAP socket with deterministic address-family fallback. Render and
 * other cloud runtimes can expose DNS AAAA records without a usable IPv6 route;
 * relying on resolver order made a healthy mailbox appear dead. IPv4 is tried
 * first, then IPv6. TLS still validates the original hostname through SNI.
 */
export async function connectImapSocket({host,port=993,secure=true,timeoutMs=10000}={}){
  if(!secure&&!loopback(host))throw new Error('plaintext-imap-only-allowed-on-loopback');
  const literal=net.isIP(host);
  const families=literal?[literal]:[4,6];
  const failures=[];
  for(const family of families){
    let socket;
    try{
      const options={host,port,...(literal?{}:{family})};
      socket=secure
        ? tls.connect({...options,servername:net.isIP(host)?undefined:host,rejectUnauthorized:true})
        : net.createConnection(options);
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{socket.destroy();const e=new Error('imap-connect-timeout');e.code='ETIMEDOUT';reject(e);},timeoutMs);
        const ev=secure?'secureConnect':'connect';
        socket.once(ev,()=>{clearTimeout(timer);resolve();});
        socket.once('error',e=>{clearTimeout(timer);reject(e);});
      });
      const greeting=await waitForData(socket,b=>/\r\n$/.test(b.toString('latin1')),{timeoutMs,maxBytes:65536});
      if(!/^\*\s+(OK|PREAUTH)/i.test(greeting.toString('utf8')))throw new Error('imap-server-greeting-not-ok');
      return socket;
    }catch(error){
      try{socket?.destroy();}catch{}
      failures.push(`${family}:${safeNetworkCode(error)}`);
    }
  }
  const error=new Error(`imap-connect-failed:${failures.join('|')||'no-route'}`);
  error.code='IMAP_CONNECT_FAILED';
  error.reasonCodes=failures;
  throw error;
}
// Walks an IMAP response the way a client must: a literal is skipped by its declared byte length, so text inside
// a message body can never complete a command or start a fetch response. Returns the first non-undefined verdict of
// visit(), or null when the response is incomplete or no verdict was reached.
function walkImapResponse(buffer,visit){
  const latin=buffer.toString('latin1');
  let i=0;
  while(i<latin.length){
    const eol=latin.indexOf('\r\n',i);
    if(eol<0)return null;
    const line=latin.slice(i,eol);
    const lit=line.match(/\{(\d+)\}$/);
    if(lit){
      const len=Number(lit[1]);
      const start=eol+2;
      if(!Number.isSafeInteger(len)||start+len>latin.length)return null;
      const verdict=visit({line,literal:buffer.subarray(start,start+len)});
      if(verdict!==undefined)return verdict;
      i=start+len;
      continue;
    }
    const verdict=visit({line,literal:null});
    if(verdict!==undefined)return verdict;
    i=eol+2;
  }
  return null;
}
// OK, NO or BAD for our own tag, read only from a real response line; null while incomplete or absent.
function imapTaggedStatus(buffer,tag){
  return walkImapResponse(buffer,({line})=>{
    const m=line.match(/^(\S+) (OK|NO|BAD)(?:\s|$)/i);
    return m&&m[1]===tag?m[2].toUpperCase():undefined;
  });
}
// The BODY[] literal of a single FETCH response, framed by declared length.
function literalFromFetch(buffer){
  return walkImapResponse(buffer,({line,literal})=>{
    if(literal&&/BODY(?:\.PEEK)?\[\]\s+\{\d+\}$/i.test(line))return Buffer.from(literal);
    return undefined;
  });
}
function headerMap(text){
  const head=String(text||'').replace(/\r?\n[ \t]+/g,' ');
  const out={};
  for(const line of head.split(/\r?\n/)){
    const idx=line.indexOf(':');if(idx<=0)continue;
    const k=line.slice(0,idx).trim().toLowerCase(),v=line.slice(idx+1).trim();
    out[k]=out[k]?`${out[k]}, ${v}`:v;
  }
  return out;
}
// Quoted-printable to bytes. An escape becomes one byte; literal text keeps its UTF-8 encoding, so a multi-byte character
// survives intact. Soft line breaks are removed first.
function decodeQpBytes(s){
  const text=String(s||'').replace(/=\r?\n/g,'');
  const parts=[];let last=0;
  for(const m of text.matchAll(/=([A-Fa-f0-9]{2})/g)){
    if(m.index>last)parts.push(Buffer.from(text.slice(last,m.index),'utf8'));
    parts.push(Buffer.from([parseInt(m[1],16)]));
    last=m.index+3;
  }
  if(last<text.length)parts.push(Buffer.from(text.slice(last),'utf8'));
  return Buffer.concat(parts);
}
// The declared charset of the part, UTF-8 when absent. An unknown label decodes as UTF-8 instead of failing the message.
function decodeBytes(bytes,headers){
  const label=String(headers['content-type']||'').match(/charset\s*=\s*"?([^";\s]+)"?/i)?.[1]?.toLowerCase()||'utf-8';
  try{return new TextDecoder(label).decode(bytes);}catch{return bytes.toString('utf8');}
}
function decodePart(body,headers){
  const enc=String(headers['content-transfer-encoding']||'').toLowerCase();
  if(enc.includes('base64')){try{return decodeBytes(Buffer.from(String(body).replace(/\s+/g,''),'base64'),headers);}catch{return String(body);}}
  if(enc.includes('quoted-printable'))return decodeBytes(decodeQpBytes(body),headers);
  return String(body);
}
// Bounds for the reply's own plain text. A message past any cap is quarantined whole: its body is withheld, because a
// partly read body can stand in for something the recipient never wrote.
export const UBERIMAP_MIME_LIMITS=Object.freeze({maxDepth:8,maxParts:200,maxBodyBytes:262144});
function mimeFault(reason){const error=new Error(reason);error.mimeReason=reason;return error;}
// Walks the MIME tree and returns the first text/plain part, decoded, or null when the entity has none. Every part is
// visited, so a limit breached late in the message still quarantines it. Faults throw and are caught by readPlainBody.
function plainTextOf(entity,depth,state){
  if(depth>UBERIMAP_MIME_LIMITS.maxDepth)throw mimeFault('MIME_DEPTH_EXCEEDED');
  const m=/\r?\n\r?\n/.exec(entity);
  const head=headerMap(m?entity.slice(0,m.index):entity);
  const bodyRaw=m?entity.slice(m.index+m[0].length):'';
  const ct=String(head['content-type']||'');
  const media=(ct.match(/^\s*([^\s;,]+)/)?.[1]||'text/plain').toLowerCase();
  if(media.startsWith('multipart/')){
    const boundary=ct.match(/boundary\s*=\s*"?([^";\s]+)"?/i)?.[1];
    if(!boundary)throw mimeFault('MIME_BOUNDARY_MISSING');
    let text=null;
    for(const segment of bodyRaw.split(`--${boundary}`).slice(1)){
      if(segment.startsWith('--'))break;
      state.parts+=1;
      if(state.parts>UBERIMAP_MIME_LIMITS.maxParts)throw mimeFault('MIME_PART_LIMIT');
      const found=plainTextOf(segment.replace(/^\r?\n/,''),depth+1,state);
      if(text===null&&found!==null)text=found;
    }
    return text;
  }
  // A single-part top-level text body is read whole, as before, so an HTML-only reply still shows an opt-out. Nested parts
  // count only as text/plain; any other binary part is never read as text.
  if(!(media==='text/plain'||(depth===0&&media.startsWith('text/'))))return null;
  const decoded=decodePart(bodyRaw,head);
  state.bytes+=Buffer.byteLength(decoded,'utf8');
  if(state.bytes>UBERIMAP_MIME_LIMITS.maxBodyBytes)throw mimeFault('MIME_BODY_TOO_LARGE');
  return decoded;
}
// The reply's own words as plain text, or an empty body with a quarantine reason. Never throws.
function readPlainBody(raw){
  try{
    const text=plainTextOf(raw,0,{parts:0,bytes:0});
    if(text===null)return {body:'',quarantine:null};
    return {body:clean(text
      .replace(/\r/g,'')
      .split('\n')
      .filter(line=>!/^>/.test(line.trim())&&!/^On .+wrote:$/i.test(line.trim()))
      .join('\n'),100000),quarantine:null};
  }catch(error){
    return {body:'',quarantine:error?.mimeReason||'MIME_MALFORMED'};
  }
}
export function parseRawEmail(value){
  const raw=Buffer.isBuffer(value)?value.toString('utf8'):String(value||'');
  const split=raw.search(/\r?\n\r?\n/);
  const headers=headerMap(split>=0?raw.slice(0,split):raw);
  const from=clean(headers.from,1000);
  const fromEmail=(from.match(/<([^>]+@[^>]+)>/)?.[1]||from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||'').toLowerCase();
  const refs=String(headers.references||'').match(/<[^>]+>/g)||[];
  // Lower-cased top-level media type only (e.g. 'multipart/report'), '' when absent.
  const contentType=String(headers['content-type']||'').match(/^\s*([^\s;,]+)/)?.[1]?.toLowerCase()||'';
  // RFC 3834: any Auto-Submitted value other than 'no' marks a machine-generated message.
  const autoSubmittedHeader=String(headers['auto-submitted']||'').trim();
  const autoSubmitted=autoSubmittedHeader.length>0&&!/^no$/i.test(autoSubmittedHeader);
  // Complaint (ARF) and unsubscribe signals the pipeline consumes. Derived from headers and the body only, bounded.
  const reportType=String(headers['content-type']||'').match(/report-type\s*=\s*"?([^";\s]+)"?/i)?.[1]?.toLowerCase()||'';
  const listUnsubscribe=clean(headers['list-unsubscribe'],1000)||'';
  const bodyPart=split>=0?raw.slice(split):'';
  const embeddedMessageIds=[...new Set((bodyPart.match(/^message-id:\s*<[^>\r\n]+>/gim)||[]).map(line=>clean(line.replace(/^message-id:\s*/i,''),500)))].slice(0,20);
  // The machine-readable original sender of an ARF report (RFC 5965). It is a claim inside the body, not an authenticated
  // header, so the pipeline only uses it to cross-check the linked outbound message.
  const originalMailFrom=(bodyPart.match(/^original-mail-from:\s*(?:rfc822;\s*)?<?([^\s<>;]+@[^\s<>;]+)>?/im)?.[1]||'').toLowerCase().slice(0,320);
  // DSN fields are only claims inside the machine-readable message/delivery-status MIME part.
  // Bound parsing and cross-check with the exact stored outbound recipient before health effects.
  const dsnPart=reportType==='delivery-status'
    ? (bodyPart.slice(0,262144).match(/^content-type:\s*message\/delivery-status[^\r\n]*\r?\n([\s\S]*?)(?=^--[^\r\n]+|$(?![\s\S]))/im)?.[1]||'') : '';
  const deliveryFinalRecipients=[...new Set([...dsnPart.matchAll(/^final-recipient:\s*rfc822;\s*<?([^\s<>;]+@[^\s<>;]+)>?/gim)]
    .map(match=>match[1].toLowerCase()))].slice(0,20);
  const deliveryActions=[...new Set([...dsnPart.matchAll(/^action:\s*([a-z-]+)/gim)].map(match=>match[1].toLowerCase()))].slice(0,20);
  const deliveryStatuses=[...new Set([...dsnPart.matchAll(/^status:\s*([245]\.\d+\.\d+)/gim)].map(match=>match[1]))].slice(0,20);

  const plain=readPlainBody(raw);
  return {
    id:clean(headers['message-id'],500)||`imapmsg:${hash(raw).slice(0,32)}`,
    messageId:clean(headers['message-id'],500)||null,
    inReplyTo:clean(headers['in-reply-to'],500)||null,
    references:refs.map(x=>clean(x,500)),
    from,fromEmail,to:clean(headers.to,1000),subject:clean(headers.subject,1000),
    date:clean(headers.date,200)||null,
    contentType,autoSubmitted,reportType,listUnsubscribe,embeddedMessageIds,originalMailFrom,
    deliveryFinalRecipients,deliveryActions,deliveryStatuses,
    // Null when the body was read whole. A quarantined message has an empty body and a reason code, and goes to review.
    body:plain.body,mimeQuarantine:plain.quarantine
  };
}
export function buildEncryptedImapAccount({
  slot='',email='',host='',port=993,secure=true,username='',password='',evidenceRef='',authorized=false,termsCompatible=false
}={},encryptionKey=''){
  const reasons=[];const e=clean(email,320).toLowerCase();const h=clean(host,253);const p=Number(port);
  if(!emailOk(e))reasons.push('valid-forwarding-email-required');
  if(!h)reasons.push('imap-host-required');
  if(!Number.isInteger(p)||p<1||p>65535)reasons.push('valid-imap-port-required');
  if(!clean(username,500)||!String(password||''))reasons.push('imap-credential-pair-required');
  if(!clean(evidenceRef,1500))reasons.push('imap-route-evidence-required');
  if(authorized!==true)reasons.push('imap-route-authorization-required');
  if(termsCompatible!==true)reasons.push('imap-route-terms-compatibility-required');
  if(reasons.length)return {ok:false,status:'UBERIMAP_ACCOUNT_REFUSED',reasonCodes:reasons};
  const account={
    id:`imap-${hash(e).slice(0,24)}`,slot:clean(slot||`imap:${hash(e).slice(0,20)}`,120),
    email:e,provider:'imap-forwarding',connected:true,
    tokens:encryptJson({kind:'imap-basic',username:clean(username,500),password:String(password)},encryptionKey),
    imapRoute:{host:h,port:p,secure:secure!==false,evidenceRef:clean(evidenceRef,1500),authorized:true,termsCompatible:true},
    lastImapUid:0,lastReplyPoll:0
  };
  return {ok:true,status:'UBERIMAP_ACCOUNT_READY_FOR_IMPORT',account,plaintextCredentialReturned:false};
}
export function openImapCredential(account={},encryptionKey=''){
  const x=decryptJson(account.tokens,encryptionKey);
  if(x?.kind!=='imap-basic'||!clean(x.username,500)||!String(x.password||''))throw new Error('invalid-encrypted-imap-account-credential');
  return {username:clean(x.username,500),password:String(x.password)};
}
// The [UIDVALIDITY n] response code from SELECT; 0 when the server did not report one.
function uidValidityFrom(buffer){
  const value=Number(buffer.toString('utf8').match(/\[UIDVALIDITY\s+(\d+)\]/i)?.[1]);
  return Number.isSafeInteger(value)&&value>0?value:0;
}
export function createUberImapReader({
  host='',port=993,secure=true,username='',password='',authorized=false,termsCompatible=false,evidenceRef='',
  connectFactory=connectImapSocket,timeoutMs=30000
}={}){
  const reasons=[];const h=clean(host,253),p=Number(port);
  if(!h)reasons.push('imap-host-required');
  if(!Number.isInteger(p)||p<1||p>65535)reasons.push('valid-imap-port-required');
  if(!username||!password)reasons.push('imap-credential-pair-required');
  if(/[\r\n\0]/.test(String(username)+String(password)))reasons.push('imap-credential-control-characters-refused');
  if(authorized!==true)reasons.push('imap-route-authorization-required');
  if(termsCompatible!==true)reasons.push('imap-route-terms-compatibility-required');
  if(!clean(evidenceRef,1500))reasons.push('imap-route-evidence-required');
  if(!secure&&!loopback(h))reasons.push('plaintext-imap-only-allowed-on-loopback');
  if(reasons.length)return {ok:false,status:'UBERIMAP_READER_REFUSED',reasonCodes:reasons,providerCalls:0};
  return {
    ok:true,status:'UBERIMAP_READER_READY',
    async fetchRecent({sinceMs=Date.now()-86400000,afterUid=0,limit=100,expectedUidValidity=0}={}){
      const socket=await connectFactory({host:h,port:p,secure:secure!==false,timeoutMs});
      let n=0;
      const command=async line=>{
        const tag=`UB${String(++n).padStart(4,'0')}`;
        const waiter=waitForData(socket,b=>imapTaggedStatus(b,tag)!==null,{timeoutMs,maxBytes:12*1024*1024});
        socket.write(`${tag} ${line}\r\n`);
        const buf=await waiter;
        if(imapTaggedStatus(buf,tag)!=='OK')throw new Error(`imap-command-rejected:${clean(buf.toString('utf8').slice(-1000),1000)}`);
        return buf;
      };
      try{
        await command(`LOGIN ${quote(username)} ${quote(password)}`);
        const selected=await command('SELECT INBOX');
        const uidValidity=uidValidityFrom(selected);
        const expected=Math.max(0,Math.floor(Number(expectedUidValidity)||0));
        if(expected>0){
          // A mailbox whose UIDVALIDITY no longer matches has reassigned its UIDs, so a
          // stored cursor means nothing. Fetching nothing is the only safe answer.
          if(uidValidity===0){
            try{await command('LOGOUT');}catch{}
            return {ok:false,status:'UBERIMAP_UIDVALIDITY_UNAVAILABLE',reasonCodes:['imap-uidvalidity-not-reported'],uidValidity:0,messages:[],lastUid:0,providerCalls:1};
          }
          if(uidValidity!==expected){
            try{await command('LOGOUT');}catch{}
            return {ok:true,status:'UBERIMAP_UIDVALIDITY_CHANGED',uidValidity,messages:[],lastUid:0,providerCalls:1};
          }
        }
        const after=Math.max(0,Math.floor(Number(afterUid)||0));
        const q=after>0?`UID SEARCH UID ${after+1}:*`:`UID SEARCH SINCE ${imapDate(sinceMs)}`;
        const search=await command(q);
        const line=search.toString('utf8').split(/\r?\n/).find(x=>/^\* SEARCH(?:\s|$)/i.test(x))||'';
        const uids=[...new Set(line.replace(/^\* SEARCH\s*/i,'').trim().split(/\s+/).map(Number).filter(Number.isSafeInteger).filter(uid=>uid>0))];
        // Ascending cursor: only UIDs strictly newer than the cursor, oldest first, so an
        // older unseen UID is never skipped. UID n:* can echo the newest existing UID even
        // when that UID is not newer than n, so the strict filter is what keeps quiet polls quiet.
        const candidates=uids.filter(uid=>uid>after).sort((a,b)=>a-b);
        const chosen=candidates.slice(0,Math.max(1,Math.min(500,Number(limit)||100)));
        const hasMore=candidates.length>chosen.length;
        const messages=[];
        let lastGood=after,failedUid=0;
        for(const uid of chosen){
          let literal=null;
          try{literal=literalFromFetch(await command(`UID FETCH ${uid} (BODY.PEEK[])`));}catch{literal=null;}
          // A UID whose body cannot be read ends the batch here. The cursor stays below it, so nothing after it is
          // skipped; the pipeline decides whether it is retried or quarantined after repeated failures.
          if(!literal){failedUid=uid;break;}
          messages.push({uid,...parseRawEmail(literal)});
          lastGood=uid;
        }
        try{await command('LOGOUT');}catch{}
        if(failedUid){
          return {ok:true,status:'UBERIMAP_FETCH_PARTIAL',providerCalls:1,messages,lastUid:lastGood,failedUid,hasMore,uidValidity,evidenceRef:clean(evidenceRef,1500)};
        }
        return {ok:true,status:'UBERIMAP_FETCH_CONFIRMED',providerCalls:1,uidValidity,messages,lastUid:chosen.length?chosen[chosen.length-1]:after,hasMore,evidenceRef:clean(evidenceRef,1500)};
      }finally{socket.end();}
    }
  };
}
export async function pollImapForwardingAccount({account={},encryptionKey='',readerFactory=createUberImapReader,limit=100}={}){
  let credential;
  try{credential=openImapCredential(account,encryptionKey);}catch(error){return {ok:false,status:'UBERIMAP_CREDENTIAL_UNAVAILABLE',reasonCodes:['imap-account-credential-unavailable'],error:clean(error.message,300)};}
  const route=account.imapRoute||{};
  const reader=readerFactory({host:route.host,port:route.port,secure:route.secure!==false,username:credential.username,password:credential.password,authorized:route.authorized===true,termsCompatible:route.termsCompatible===true,evidenceRef:route.evidenceRef});
  if(!reader?.ok)return reader;
  const result=await reader.fetchRecent({
    sinceMs:account.lastReplyPoll||Date.now()-86400000,afterUid:account.lastImapUid||0,limit,
    expectedUidValidity:Number(account.lastImapUidValidity)||0
  });
  return {...result,uidValidity:Number(result?.uidValidity)||0};
}
