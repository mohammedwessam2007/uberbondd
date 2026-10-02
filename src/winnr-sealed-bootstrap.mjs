import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createStore } from './store.mjs';
import { encryptJson, decryptJson } from './crypto.mjs';
import { runWinnrRuntimeBootstrap } from './winnr-runtime-bootstrap.mjs';

const STATE_KEY='winnrSealedBootstrapV1';
const clean=(v,n=2000)=>String(v??'').trim().slice(0,n);
const sha256=v=>crypto.createHash('sha256').update(v).digest('hex');

function safeResult(result={}){
  return {
    ok:result?.ok===true,
    status:clean(result?.status,120)||'UNKNOWN',
    domain:clean(result?.domain,253)||null,
    mailboxCount:Number(result?.mailboxCount||0),
    accountRowsWritten:Number(result?.accountRowsWritten||0),
    credentialStorage:clean(result?.credentialStorage,120)||null,
    plaintextCredentialsLogged:result?.plaintextCredentialsLogged??null,
    smtpConfirmed:Number(result?.smtpConfirmed||0),
    imapConfirmed:Number(result?.imapConfirmed||0),
    messagesSent:Number(result?.messagesSent||0),
    probes:Array.isArray(result?.probes)?result.probes.map(probe=>({
      accountOrdinal:Number(probe?.accountOrdinal||0),
      smtpConfirmed:probe?.smtpConfirmed===true,
      smtpClassification:clean(probe?.smtpClassification,120)||'UNKNOWN',
      smtpReasonCodes:Array.isArray(probe?.smtpReasonCodes)?probe.smtpReasonCodes.map(x=>clean(x,120)).slice(0,5):[],
      smtpError:clean(probe?.smtpError,300)||null,
      imapConfirmed:probe?.imapConfirmed===true,
      imapStatus:clean(probe?.imapStatus,120)||'UNKNOWN'
    })):[] 
  };
}

function keyFingerprint(publicKeyPem){
  return `sha256:${sha256(Buffer.from(publicKeyPem,'utf8'))}`;
}

function generateBootstrapKeypair(encryptionKey){
  const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{
    modulusLength:3072,
    publicKeyEncoding:{type:'spki',format:'pem'},
    privateKeyEncoding:{type:'pkcs8',format:'pem'}
  });
  return {
    version:1,
    algorithm:'RSA-OAEP-3072-SHA256+A256GCM',
    publicKeyPem:publicKey,
    publicKeyFingerprint:keyFingerprint(publicKey),
    privateKeyCiphertext:encryptJson({
      kind:'winnr-sealed-bootstrap-rsa-private',
      privateKeyPem:privateKey
    },encryptionKey),
    createdAt:new Date().toISOString(),
    consumedAt:null,
    payloadDigest:null,
    result:null
  };
}

function openEnvelope(envelope,state,encryptionKey){
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw new Error('sealed-envelope-object-required');
  if(clean(envelope.version,20)!=='1')throw new Error('sealed-envelope-version-refused');
  if(clean(envelope.algorithm,120)!=='RSA-OAEP-3072-SHA256+A256GCM')throw new Error('sealed-envelope-algorithm-refused');
  if(clean(envelope.publicKeyFingerprint,200)!==clean(state.publicKeyFingerprint,200))throw new Error('sealed-envelope-key-fingerprint-mismatch');

  const privateRecord=decryptJson(state.privateKeyCiphertext,encryptionKey);
  if(privateRecord?.kind!=='winnr-sealed-bootstrap-rsa-private'||!clean(privateRecord?.privateKeyPem,10000))throw new Error('sealed-bootstrap-private-key-unavailable');

  const wrappedKey=Buffer.from(clean(envelope.wrappedKeyB64,2000),'base64');
  const iv=Buffer.from(clean(envelope.ivB64,200),'base64');
  const tag=Buffer.from(clean(envelope.tagB64,200),'base64');
  const ciphertext=Buffer.from(clean(envelope.ciphertextB64,4_000_000),'base64');
  if(!wrappedKey.length||iv.length!==12||tag.length!==16||!ciphertext.length)throw new Error('sealed-envelope-components-invalid');

  const dataKey=crypto.privateDecrypt({
    key:privateRecord.privateKeyPem,
    padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash:'sha256'
  },wrappedKey);
  if(dataKey.length!==32)throw new Error('sealed-envelope-data-key-invalid');

  const decipher=crypto.createDecipheriv('aes-256-gcm',dataKey,iv);
  decipher.setAuthTag(tag);
  const plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  if(!plaintext.length||plaintext.length>2_000_000)throw new Error('sealed-envelope-plaintext-refused');
  const digest=`sha256:${sha256(plaintext)}`;
  if(clean(envelope.payloadDigest,200)&&clean(envelope.payloadDigest,200)!==digest)throw new Error('sealed-envelope-payload-digest-mismatch');
  return {csvText:plaintext.toString('utf8'),payloadDigest:digest};
}

export async function runWinnrSealedBootstrapController({config,canaryTarget='uberbond.co@gmail.com'}={}){
  if(!config||!/^[a-f0-9]{64}$/i.test(String(config.encryptionKey||''))){
    return {ok:false,status:'WINNR_SEALED_BOOTSTRAP_REFUSED',reasonCodes:['token-encryption-key-required']};
  }
  const store=createStore(config);
  try{
    await store.init();
    let state=await store.getSettings().then(x=>x?.[STATE_KEY]||null);
    if(state?.consumedAt){
      return {ok:true,status:'WINNR_SEALED_BOOTSTRAP_ALREADY_CONSUMED',consumedAt:state.consumedAt,payloadDigest:state.payloadDigest||null,result:state.result||null};
    }
    if(!state?.privateKeyCiphertext||!state?.publicKeyPem){
      state=generateBootstrapKeypair(config.encryptionKey);
      await store.setSetting(STATE_KEY,state);
      await store.log('winnr_sealed_bootstrap_key_ready',{
        version:state.version,
        algorithm:state.algorithm,
        publicKeyFingerprint:state.publicKeyFingerprint,
        privateKeyStorage:'AES_256_GCM_ENCRYPTED',
        plaintextPrivateKeyLogged:false
      });
    }

    const publicReceipt={
      ok:true,
      status:'WINNR_SEALED_BOOTSTRAP_KEY_READY',
      algorithm:state.algorithm,
      publicKeyFingerprint:state.publicKeyFingerprint,
      publicKeyB64:Buffer.from(state.publicKeyPem,'utf8').toString('base64'),
      privateKeyStorage:'AES_256_GCM_ENCRYPTED',
      plaintextPrivateKeyLogged:false
    };

    const envelopePath=path.join(config.root,'config','winnr-bootstrap-sealed.json');
    let raw;
    try{raw=await fs.readFile(envelopePath,'utf8');}
    catch(error){
      if(error?.code==='ENOENT')return publicReceipt;
      throw error;
    }
    const envelope=JSON.parse(raw);
    const opened=openEnvelope(envelope,state,config.encryptionKey);
    const externallyConfirmed=String(process.env.WINNR_SMTP_CONFIRMED_ORDINALS||'')
      .split(',').map(Number).filter(n=>Number.isInteger(n)&&n>0);
    const priorConfirmed=[...new Set([
      ...(Array.isArray(state.smtpConfirmedOrdinals)?state.smtpConfirmedOrdinals:[]),
      ...externallyConfirmed
    ].map(Number).filter(n=>Number.isInteger(n)&&n>0))].sort((a,b)=>a-b);
    const result=await runWinnrRuntimeBootstrap({
      config,
      csvText:opened.csvText,
      canaryTarget,
      smtpSkipOrdinals:priorConfirmed,
      smtpInterProbeDelayMs:15000
    });
    const safe=safeResult(result);
    const newlyConfirmed=(Array.isArray(result?.probes)?result.probes:[])
      .filter(probe=>probe?.smtpConfirmed===true)
      .map(probe=>Number(probe.accountOrdinal))
      .filter(n=>Number.isInteger(n)&&n>0);
    const confirmedOrdinals=[...new Set([...priorConfirmed,...newlyConfirmed])].sort((a,b)=>a-b);
    if(result?.ok===true){
      const consumed={
        version:state.version,
        algorithm:state.algorithm,
        publicKeyFingerprint:state.publicKeyFingerprint,
        publicKeyPem:null,
        privateKeyCiphertext:null,
        createdAt:state.createdAt,
        consumedAt:new Date().toISOString(),
        payloadDigest:opened.payloadDigest,
        result:safe,
        smtpConfirmedOrdinals:confirmedOrdinals
      };
      await store.setSetting(STATE_KEY,consumed);
      await store.log('winnr_sealed_bootstrap_consumed',{
        publicKeyFingerprint:state.publicKeyFingerprint,
        payloadDigest:opened.payloadDigest,
        privateKeyErasedFromCanonicalState:true,
        plaintextCredentialsLogged:false,
        result:safe
      });
    }else{
      await store.setSetting(STATE_KEY,{
        ...state,
        smtpConfirmedOrdinals:confirmedOrdinals,
        lastPartialAt:new Date().toISOString(),
        lastPartialResult:safe
      });
    }
    return {...safe,smtpConfirmedOrdinals:confirmedOrdinals,payloadDigest:opened.payloadDigest,publicKeyFingerprint:state.publicKeyFingerprint};
  }catch(error){
    return {ok:false,status:'WINNR_SEALED_BOOTSTRAP_FAILED',reasonCodes:[clean(error?.message||error,300)]};
  }finally{
    await store.close().catch(()=>{});
  }
}
