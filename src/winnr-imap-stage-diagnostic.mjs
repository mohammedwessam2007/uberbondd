import { connectImapSocket, openImapCredential } from './uberimap.mjs';

const clean=(value,max=120)=>String(value??'').trim().slice(0,max);
const quote=value=>`"${String(value??'').replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`;
const safeCode=error=>{
  const code=clean(error?.code||error?.name||'UNKNOWN',80).toUpperCase().replace(/[^A-Z0-9_-]/g,'_');
  return code&&code!=='ERROR'?code:'UNKNOWN';
};
const imapDate=value=>{
  const d=value instanceof Date?value:new Date(value||Date.now());
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getUTCDate()).padStart(2,'0')}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
};

function waitTagged(socket,tag,{timeoutMs=10000,maxBytes=2*1024*1024}={}){
  return new Promise((resolve,reject)=>{
    let chunks=[],size=0;
    const timer=setTimeout(()=>done(Object.assign(new Error('imap-diagnostic-timeout'),{code:'ETIMEDOUT'})),timeoutMs);
    const onData=chunk=>{
      const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk); size+=b.length;
      if(size>maxBytes)return done(Object.assign(new Error('imap-diagnostic-response-too-large'),{code:'IMAP_RESPONSE_TOO_LARGE'}));
      chunks.push(b); const buf=Buffer.concat(chunks); const text=buf.toString('latin1');
      if(new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)\\b`,'i').test(text))done(null,buf);
    };
    const onError=error=>done(error);
    const onClose=()=>done(Object.assign(new Error('imap-diagnostic-connection-closed'),{code:'IMAP_CONNECTION_CLOSED'}));
    function done(error,value){
      clearTimeout(timer); socket.off('data',onData); socket.off('error',onError); socket.off('close',onClose);
      error?reject(error):resolve(value);
    }
    socket.on('data',onData); socket.once('error',onError); socket.once('close',onClose);
  });
}

function parseTagged(buf,tag){
  const text=buf.toString('latin1');
  const line=text.split(/\r?\n/).find(x=>new RegExp(`^${tag} (OK|NO|BAD)\\b`,'i').test(x))||'';
  const status=line.match(new RegExp(`^${tag} (OK|NO|BAD)\\b`,'i'))?.[1]?.toUpperCase()||'UNKNOWN';
  const responseCode=line.match(/\[([A-Z0-9_-]{1,80})\]/i)?.[1]?.toUpperCase()||'NONE';
  return {status,responseCode};
}

async function runStage(socket,n,stage,line,{timeoutMs,maxBytes}={}){
  const tag=`DG${String(n).padStart(4,'0')}`;
  const waiter=waitTagged(socket,tag,{timeoutMs,maxBytes});
  socket.write(`${tag} ${line}\r\n`);
  const buffer=await waiter;
  const response=parseTagged(buffer,tag);
  return {safe:{stage,status:response.status,responseCode:response.responseCode,ok:response.status==='OK'},buffer};
}

function searchUids(buffer){
  const line=buffer.toString('latin1').split(/\r?\n/).find(x=>/^\* SEARCH(?:\s|$)/i.test(x))||'';
  return line.replace(/^\* SEARCH\s*/i,'').trim().split(/\s+/).map(Number).filter(Number.isSafeInteger).filter(n=>n>0);
}

const bounded=safe=>({...safe,rawProviderTextLogged:false,credentialsLogged:false});

/**
 * Read-only protocol-stage diagnostic for a Winnr IMAP account.
 * Returns only bounded stage/status/standard response codes. It never returns
 * raw provider text, credentials, addresses, message bodies, subjects or UIDs.
 */
export async function diagnoseWinnrImapStages({account={},encryptionKey='',connectFactory=connectImapSocket,timeoutMs=10000,now=Date.now()}={}){
  let credential;
  try{credential=openImapCredential(account,encryptionKey);}catch(error){return {ok:false,stage:'CREDENTIAL',errorClass:safeCode(error),rawProviderTextLogged:false,credentialsLogged:false};}
  const route=account.imapRoute||{};
  let socket;
  try{
    socket=await connectFactory({host:route.host,port:route.port,secure:route.secure!==false,timeoutMs});
    const login=await runStage(socket,1,'LOGIN',`LOGIN ${quote(credential.username)} ${quote(credential.password)}`,{timeoutMs});
    if(!login.safe.ok)return bounded(login.safe);
    const select=await runStage(socket,2,'SELECT','SELECT INBOX',{timeoutMs});
    if(!select.safe.ok)return bounded(select.safe);
    const since=account.lastReplyPoll||now-86400000;
    const search=await runStage(socket,3,'SEARCH',`UID SEARCH SINCE ${imapDate(since)}`,{timeoutMs});
    if(!search.safe.ok)return bounded(search.safe);
    const uids=searchUids(search.buffer);
    if(!uids.length){
      try{await runStage(socket,4,'LOGOUT','LOGOUT',{timeoutMs});}catch{}
      return {ok:true,stage:'SEARCH_EMPTY',status:'OK',responseCode:'NONE',rawProviderTextLogged:false,credentialsLogged:false};
    }
    const sample=uids.slice(-3);
    for(let i=0;i<sample.length;i++){
      const fetched=await runStage(socket,4+i,'FETCH',`UID FETCH ${sample[i]} (BODY.PEEK[])`,{timeoutMs,maxBytes:12*1024*1024});
      if(!fetched.safe.ok)return {...bounded(fetched.safe),sampleOrdinal:i+1};
    }
    try{await runStage(socket,4+sample.length,'LOGOUT','LOGOUT',{timeoutMs});}catch{}
    return {ok:true,stage:'FETCH',status:'OK',responseCode:'NONE',sampleCount:sample.length,rawProviderTextLogged:false,credentialsLogged:false};
  }catch(error){
    return {ok:false,stage:'TRANSPORT',errorClass:safeCode(error),rawProviderTextLogged:false,credentialsLogged:false};
  }finally{try{socket?.end();}catch{}}
}
