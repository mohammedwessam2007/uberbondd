// Private Railway receiver credentials. Read access is never consent to send a probe.
import { encryptJson, decryptJson } from './crypto.mjs';
import { connectImapSocket, parseRawEmail } from './uberimap.mjs';
import { UBERWARM2_SEED_TEMPLATE } from './uberwarm2-seed-template.mjs';
import {createHash} from 'node:crypto';

const emailPattern=/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const quote=s=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
function validCredential(c,email){return c&&emailPattern.test(email)&&c.username===email&&
  typeof c.password==='string'&&c.password.length>0&&c.password.length<=5000&&
  !/[\r\n]/.test(c.username+c.password)&&c.port===993&&
  typeof c.host==='string'&&/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(c.host);}
function exactPlainBody(raw){
  const split=raw.indexOf('\r\n\r\n');if(split<0)return null;
  const headers=raw.slice(0,split),types=[...headers.matchAll(/(?:^|\r\n)Content-Type:([^\r\n]+)/gi)];
  if(types.length!==1||!/^\s*text\/plain(?:;|\s*$)/i.test(types[0][1]))return null;
  const encodings=[...headers.matchAll(/(?:^|\r\n)Content-Transfer-Encoding:([^\r\n]+)/gi)];
  if(encodings.length>1)return null;
  const encoding=(encodings[0]?.[1]||'7bit').trim().toLowerCase();let body=raw.slice(split+4);
  if(encoding==='base64'){
    if(!/^[A-Za-z0-9+/=\r\n]*$/.test(body))return null;
    body=Buffer.from(body.replace(/[\r\n]/g,''),'base64').toString('utf8');
  }else if(encoding==='quoted-printable'){
    if(/=(?![a-f0-9]{2}|\r\n)/i.test(body))return null;
    body=body.replace(/=\r\n/g,'').replace(/=([a-f0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
  }else if(encoding!=='7bit'&&encoding!=='8bit')return null;
  return body.replace(/(?:\r?\n)+$/,'');
}

export async function inspectOwnedImapReceiver({credential,receiverEmail,query,connectFactory=connectImapSocket}={}){
  let messagesRead=0;
  const denied=stage=>({configured:true,authenticated:false,inboxReadOnlyAccessible:false,
    stage,probeConsentEstablished:false,messagesRead,sends:0});
  if(!validCredential(credential,receiverEmail))return denied('CREDENTIAL_BINDING');
  const started=Date.now();
  if(query&&(!/^[A-Za-z0-9._:-]{1,200}$/.test(query.probeId)||query.bodyToken!==query.probeId||
    !emailPattern.test(query.senderEmail)||query.senderEmail===receiverEmail||query.seedEmail!==receiverEmail||
    query.seedProvider!=='winnr'||!/^<[^<>\s@]+@[^<>\s@]+>$/.test(query.providerMessageId)||
    !Number.isFinite(query.at)||query.at>started||started-query.at>300000))return denied('PLACEMENT_QUERY');
  let socket,phase='VERIFIED_TLS';
  try{
    socket=await connectFactory({host:credential.host,port:993,secure:true,timeoutMs:10000});
    let n=0;
    const command=line=>new Promise((resolve,reject)=>{
      const tag='RB'+(++n);let text='';
      const finish=error=>{clearTimeout(timer);socket.off('data',onData);socket.off('error',onError);socket.off('close',onClose);error?reject(error):resolve(text);};
      const onError=()=>finish(Error('network')),onClose=()=>finish(Error('closed'));
      const onData=chunk=>{text+=chunk.toString('utf8');if(Buffer.byteLength(text)>65536)return finish(Error('size'));
        if(new RegExp('(?:^|\\r\\n)'+tag+' (OK|NO|BAD)\\b').test(text))
          finish(new RegExp('(?:^|\\r\\n)'+tag+' OK\\b').test(text)?null:Error('rejected'));};
      const timer=setTimeout(()=>finish(Error('timeout')),10000);
      socket.on('data',onData);socket.once('error',onError);socket.once('close',onClose);
      socket.write(tag+' '+line+'\r\n');
    });
    phase='LOGIN';await command('LOGIN '+quote(credential.username)+' '+quote(credential.password));
    phase='EXAMINE_INBOX';await command('EXAMINE INBOX');
    phase='LIST_FOLDERS';const listing=await command('LIST "" "*"');
    let observation;
    if(query){
      const folders=[{name:'INBOX',folder:'INBOX'}];
      for(const line of listing.split('\r\n')){
        const match=line.match(/^\* LIST \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) ("(?:[^"\\]|\\.)*"|[^\s]+)$/i);
        if(match&&/(?:^|\s)\\Junk(?:\s|$)/i.test(match[1])){
          const name=match[2].startsWith('"')?match[2].slice(1,-1).replace(/\\(.)/g,'$1'):match[2];
          if(name.length<=200&&!/[\r\n]/.test(name))folders.push({name,folder:'SPAM'});
        }
      }
      const matches=[];
      for(const folder of folders){
        phase='READ_ONLY_PLACEMENT_SEARCH';await command('EXAMINE '+quote(folder.name));
        const searched=await command('UID SEARCH HEADER Message-ID '+quote(query.providerMessageId));
        const searchLines=searched.split('\r\n').filter(l=>/^\* SEARCH(?: |$)/.test(l));
        if(searchLines.length!==1)throw Error('search-shape');
        const tokens=searchLines[0].replace(/^\* SEARCH\s*/,'').trim().split(/\s+/).filter(Boolean);
        if(tokens.some(t=>!/^\d+$/.test(t)||!Number.isSafeInteger(Number(t))||Number(t)<1)||tokens.length>1)throw Error('ambiguous');
        if(tokens.length)matches.push({...folder,uid:tokens[0]});
      }
      if(matches.length!==1)throw Error('not-exactly-one-match');
      const match=matches[0];await command('EXAMINE '+quote(match.name));
      phase='READ_ONLY_PLACEMENT_FETCH';const fetched=await command('UID FETCH '+match.uid+' (BODY.PEEK[])');
      const literal=fetched.match(/BODY\[\]\s+\{(\d+)\}\r\n/i);
      if(!literal)throw Error('literal');
      const length=Number(literal[1]),start=literal.index+literal[0].length;
      // Approved probes are ASCII; reject non-ASCII framing rather than miscount UTF-8 literals.
      if(!Number.isSafeInteger(length)||length<1||start+length>fetched.length||/[^\x00-\x7f]/.test(fetched.slice(start,start+length)))throw Error('literal-size');
      const raw=fetched.slice(start,start+length),message=parseRawEmail(raw);
      messagesRead=1;
      if(message.messageId!==query.providerMessageId||message.fromEmail!==query.senderEmail||
        (message.from.match(/@/g)||[]).length!==1||message.to.replace(/^<|>$/g,'')!==receiverEmail||
        message.subject!==UBERWARM2_SEED_TEMPLATE.subject||
        exactPlainBody(raw)!==UBERWARM2_SEED_TEMPLATE.bodyPrefix+query.probeId||
        Date.now()<started||Date.now()-query.at>300000)throw Error('message-correlation');
      observation={probeId:query.probeId,bodyToken:query.bodyToken,messageId:query.providerMessageId,
        senderEmail:query.senderEmail,seedEmail:receiverEmail,provider:'winnr',authenticated:true,
        providerFolder:match.folder,observedAt:new Date().toISOString(),
        receivingProviderEvidenceRef:'imap-received:sha256:'+createHash('sha256')
          .update([raw,match.folder,query.probeId,query.senderEmail,receiverEmail].join('\u0000')).digest('hex'),
        referenceSignatureVerified:false,protectedReferenceVerificationRequired:true};
    }
    try{await command('LOGOUT');}catch{}
    return {configured:true,authenticated:true,inboxReadOnlyAccessible:true,
      spamSpecialUseAdvertised:/\\Junk\b/i.test(listing),
      folderCount:listing.split('\r\n').filter(l=>/^\* LIST /i.test(l)).length,
      probeConsentEstablished:false,messagesRead:observation?1:0,sends:0,...(observation?{observation}:{})};
  }catch{return denied(phase);}finally{socket?.destroy();}
}

export async function saveReceiverBinding({pool,receiverEmail,userId,credential,encryptionKey,authorizationRef}={}){
  if(!validCredential(credential,receiverEmail)||typeof userId!=='string'||!userId||
    typeof authorizationRef!=='string'||!authorizationRef||authorizationRef.length>500)throw Error('receiver-binding-invalid');
  const encrypted=encryptJson({receiverEmail,userId,credential},encryptionKey);
  const inserted=await pool.query(`INSERT INTO public.uberwarm2_receiver_bindings
    (receiver_email,provider_user_id,credential_json,authorization_ref,enabled)
    VALUES ($1,$2,$3::jsonb,$4,true) ON CONFLICT (receiver_email) DO NOTHING
    RETURNING receiver_email`,[receiverEmail,userId,JSON.stringify(encrypted),authorizationRef]);
  if(inserted.rows.length!==1)throw Error('receiver-binding-already-present-no-overwrite');
  return {stored:true,probeConsentEstablished:false};
}

export async function observeReceiverBinding({pool,receiverEmail,encryptionKey,query,connectFactory}={}){
  try{
    if(!emailPattern.test(receiverEmail))throw Error('identity');
    const result=await pool.query(`SELECT provider_user_id,credential_json,authorization_ref,enabled
      FROM public.uberwarm2_receiver_bindings WHERE receiver_email=$1`,[receiverEmail]);
    if(result.rows.length!==1||result.rows[0].enabled!==true||!result.rows[0].authorization_ref)throw Error('binding');
    const row=result.rows[0],opened=decryptJson(row.credential_json,encryptionKey);
    if(opened.receiverEmail!==receiverEmail||opened.userId!==row.provider_user_id)throw Error('swapped-binding');
    return await inspectOwnedImapReceiver({credential:opened.credential,receiverEmail,query,connectFactory});
  }catch{return {configured:false,authenticated:false,inboxReadOnlyAccessible:false,
    probeConsentEstablished:false,messagesRead:0,sends:0};}
}
