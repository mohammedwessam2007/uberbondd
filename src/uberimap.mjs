import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import { encryptJson, decryptJson } from './crypto.mjs';

export const UBERIMAP_VERSION='uberbond.uberimap.v1';
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
async function connect({host,port=993,secure=true,timeoutMs=10000}){
  if(!secure&&!loopback(host))throw new Error('plaintext-imap-only-allowed-on-loopback');
  const socket=secure
    ? tls.connect({host,port,servername:net.isIP(host)?undefined:host,rejectUnauthorized:true})
    : net.createConnection({host,port});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{socket.destroy();reject(new Error('imap-connect-timeout'));},timeoutMs);
    const ev=secure?'secureConnect':'connect';
    socket.once(ev,()=>{clearTimeout(timer);resolve();});
    socket.once('error',e=>{clearTimeout(timer);reject(e);});
  });
  const greeting=await waitForData(socket,b=>/\r\n$/.test(b.toString('latin1')),{timeoutMs,maxBytes:65536});
  if(!/^\*\s+(OK|PREAUTH)/i.test(greeting.toString('utf8')))throw new Error('imap-server-greeting-not-ok');
  return socket;
}
function literalFromFetch(buffer){
  const latin=buffer.toString('latin1');
  const m=latin.match(/BODY(?:\.PEEK)?\[\]\s+\{(\d+)\}\r\n/i);
  if(!m)return null;
  const start=m.index+m[0].length;
  const len=Number(m[1]);
  if(!Number.isFinite(len)||len<0||start+len>buffer.length)return null;
  return buffer.subarray(start,start+len);
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
function decodeQp(s){
  return String(s||'').replace(/=\r?\n/g,'').replace(/=([A-Fa-f0-9]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
}
function decodePart(body,headers){
  const enc=String(headers['content-transfer-encoding']||'').toLowerCase();
  if(enc.includes('base64')){try{return Buffer.from(String(body).replace(/\s+/g,''),'base64').toString('utf8');}catch{return String(body);}}
  if(enc.includes('quoted-printable'))return decodeQp(body);
  return String(body);
}
function bodyText(raw,headers){
  const split=raw.search(/\r?\n\r?\n/); if(split<0)return '';
  let body=raw.slice(raw.match(/\r?\n\r?\n/)?.index + raw.match(/\r?\n\r?\n/)?.[0].length);
  const ct=String(headers['content-type']||'');
  const boundary=ct.match(/boundary="?([^";]+)"?/i)?.[1];
  if(boundary){
    const parts=body.split(`--${boundary}`);
    const plain=parts.find(p=>/content-type:\s*text\/plain/i.test(p));
    if(plain){
      const pi=plain.search(/\r?\n\r?\n/);
      if(pi>=0){
        const ph=headerMap(plain.slice(0,pi));
        body=decodePart(plain.slice(pi+(plain.match(/\r?\n\r?\n/)?.[0].length||2)),ph);
      }
    }
  }else body=decodePart(body,headers);
  return clean(body
    .replace(/\r/g,'')
    .split('\n')
    .filter(line=>!/^>/.test(line.trim())&&!/^On .+wrote:$/i.test(line.trim()))
    .join('\n'),100000);
}
export function parseRawEmail(value){
  const raw=Buffer.isBuffer(value)?value.toString('utf8'):String(value||'');
  const split=raw.search(/\r?\n\r?\n/);
  const headers=headerMap(split>=0?raw.slice(0,split):raw);
  const from=clean(headers.from,1000);
  const fromEmail=(from.match(/<([^>]+@[^>]+)>/)?.[1]||from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||'').toLowerCase();
  const refs=String(headers.references||'').match(/<[^>]+>/g)||[];
  return {
    id:clean(headers['message-id'],500)||`imapmsg:${hash(raw).slice(0,32)}`,
    messageId:clean(headers['message-id'],500)||null,
    inReplyTo:clean(headers['in-reply-to'],500)||null,
    references:refs.map(x=>clean(x,500)),
    from,fromEmail,to:clean(headers.to,1000),subject:clean(headers.subject,1000),
    date:clean(headers.date,200)||null,
    body:bodyText(raw,headers)
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
export function createUberImapReader({
  host='',port=993,secure=true,username='',password='',authorized=false,termsCompatible=false,evidenceRef='',
  connectFactory=connect,timeoutMs=30000
}={}){
  const reasons=[];const h=clean(host,253),p=Number(port);
  if(!h)reasons.push('imap-host-required');
  if(!Number.isInteger(p)||p<1||p>65535)reasons.push('valid-imap-port-required');
  if(!username||!password)reasons.push('imap-credential-pair-required');
  if(authorized!==true)reasons.push('imap-route-authorization-required');
  if(termsCompatible!==true)reasons.push('imap-route-terms-compatibility-required');
  if(!clean(evidenceRef,1500))reasons.push('imap-route-evidence-required');
  if(!secure&&!loopback(h))reasons.push('plaintext-imap-only-allowed-on-loopback');
  if(reasons.length)return {ok:false,status:'UBERIMAP_READER_REFUSED',reasonCodes:reasons,providerCalls:0};
  return {
    ok:true,status:'UBERIMAP_READER_READY',
    async fetchRecent({sinceMs=Date.now()-86400000,afterUid=0,limit=100}={}){
      const socket=await connectFactory({host:h,port:p,secure:secure!==false,timeoutMs});
      let n=0;
      const command=async line=>{
        const tag=`UB${String(++n).padStart(4,'0')}`;
        const waiter=waitForData(socket,b=>new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)\\b`,'i').test(b.toString('latin1')),{timeoutMs,maxBytes:12*1024*1024});
        socket.write(`${tag} ${line}\r\n`);
        const buf=await waiter;
        const txt=buf.toString('utf8');
        if(!new RegExp(`(?:^|\\r\\n)${tag} OK\\b`,'i').test(txt))throw new Error(`imap-command-rejected:${clean(txt.slice(-1000),1000)}`);
        return buf;
      };
      try{
        await command(`LOGIN ${quote(username)} ${quote(password)}`);
        await command('SELECT INBOX');
        const q=Number(afterUid)>0?`UID SEARCH UID ${Math.floor(Number(afterUid))+1}:*`:`UID SEARCH SINCE ${imapDate(sinceMs)}`;
        const search=await command(q);
        const line=search.toString('utf8').split(/\r?\n/).find(x=>/^\* SEARCH/i.test(x))||'';
        const uids=line.replace(/^\* SEARCH\s*/i,'').trim().split(/\s+/).map(Number).filter(Number.isFinite);
        const chosen=uids.slice(-Math.max(1,Math.min(500,Number(limit)||100)));
        const messages=[];
        for(const uid of chosen){
          const fetched=await command(`UID FETCH ${uid} (BODY.PEEK[])`);
          const literal=literalFromFetch(fetched); if(!literal)continue;
          messages.push({uid,...parseRawEmail(literal)});
        }
        try{await command('LOGOUT');}catch{}
        return {ok:true,status:'UBERIMAP_FETCH_CONFIRMED',providerCalls:1,messages,lastUid:chosen.length?Math.max(...chosen):Number(afterUid)||0,evidenceRef:clean(evidenceRef,1500)};
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
  return reader.fetchRecent({sinceMs:account.lastReplyPoll||Date.now()-86400000,afterUid:account.lastImapUid||0,limit});
}
