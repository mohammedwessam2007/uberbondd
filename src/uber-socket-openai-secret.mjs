import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const UBER_SOCKET_OPENAI_SECRET_VERSION='uberbond.uber-socket-openai-secret.v1';

function secretPath(runtimeRoot=process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond'){
  return path.join(runtimeRoot,'secrets','openai-api-key');
}

function validKey(value){
  const key=String(value||'').trim();
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(key) || /^sk-proj-[A-Za-z0-9_-]{20,}$/.test(key);
}

export function readUberSocketOpenAIKey({runtimeRoot}={}){
  const env=String(process.env.OPENAI_API_KEY||'').trim();
  if(validKey(env)) return env;
  const file=secretPath(runtimeRoot);
  try{
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()) return null;
    if((stat.mode & 0o077)!==0) return null;
    const key=fs.readFileSync(file,'utf8').trim();
    return validKey(key)?key:null;
  }catch{return null;}
}

export function storeUberSocketOpenAIKey({apiKey,runtimeRoot}={}){
  const key=String(apiKey||'').trim();
  if(!validKey(key)) throw new Error('openai-api-key-invalid');
  const file=secretPath(runtimeRoot);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp,`${key}\n`,{encoding:'utf8',mode:0o600,flag:'wx'});
  fs.chmodSync(tmp,0o600);
  fs.renameSync(tmp,file);
  fs.chmodSync(file,0o600);
  const digest=crypto.createHash('sha256').update(key).digest('hex');
  return Object.freeze({
    ok:true,
    status:'UBER_SOCKET_OPENAI_KEY_STORED',
    keyFingerprint:`sha256:${digest.slice(0,16)}`,
    pathClass:'UBERLIT_PROTECTED_RUNTIME_SECRET',
    externalEffectsAuthorized:false,
  });
}

export function clearUberSocketOpenAIKey({runtimeRoot}={}){
  try{fs.unlinkSync(secretPath(runtimeRoot));}catch(error){if(error?.code!=='ENOENT') throw error;}
  return {ok:true,status:'UBER_SOCKET_OPENAI_KEY_CLEARED',externalEffectsAuthorized:false};
}
