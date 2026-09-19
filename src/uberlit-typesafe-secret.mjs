import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const UBERLIT_TYPESAFE_SECRET_VERSION='uberbond.uberlit-typesafe-secret.v1';

function secretPath(runtimeRoot=process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond'){
  return path.join(runtimeRoot,'secrets','typesafe-api-key');
}

function validKey(value){
  const key=String(value||'').trim();
  return key.length>=20 && key.length<=512 && !/[\r\n\0\s]/.test(key);
}

export function readUberLitTypeSafeKey({runtimeRoot}={}){
  const env=String(process.env.TYPESAFE_API_KEY||'').trim();
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

export function inspectUberLitTypeSafeKey({runtimeRoot}={}){
  const env=String(process.env.TYPESAFE_API_KEY||'').trim();
  const key=readUberLitTypeSafeKey({runtimeRoot});
  return Object.freeze({
    ok:Boolean(key),
    status:key?'UBERLIT_TYPESAFE_KEY_PRESENT':'UBERLIT_TYPESAFE_KEY_ABSENT',
    source:key?(validKey(env)?'ENV':'UBERLIT_PROTECTED_RUNTIME_SECRET'):null,
    fingerprint:key?`sha256:${crypto.createHash('sha256').update(key).digest('hex').slice(0,16)}`:null,
    keyReturned:false,
    externalEffectsAuthorized:false
  });
}

export function storeUberLitTypeSafeKey({apiKey,runtimeRoot}={}){
  const key=String(apiKey||'').trim();
  if(!validKey(key)) throw new Error('typesafe-api-key-invalid');
  const file=secretPath(runtimeRoot);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  fs.chmodSync(path.dirname(file),0o700);
  const tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp,`${key}\n`,{encoding:'utf8',mode:0o600,flag:'wx'});
  fs.chmodSync(tmp,0o600);
  fs.renameSync(tmp,file);
  fs.chmodSync(file,0o600);
  const digest=crypto.createHash('sha256').update(key).digest('hex');
  return Object.freeze({
    ok:true,
    status:'UBERLIT_TYPESAFE_KEY_STORED',
    keyFingerprint:`sha256:${digest.slice(0,16)}`,
    pathClass:'UBERLIT_PROTECTED_RUNTIME_SECRET',
    keyReturned:false,
    externalEffectsAuthorized:false
  });
}

export function clearUberLitTypeSafeKey({runtimeRoot}={}){
  try{fs.unlinkSync(secretPath(runtimeRoot));}catch(error){if(error?.code!=='ENOENT')throw error;}
  return {ok:true,status:'UBERLIT_TYPESAFE_KEY_CLEARED',externalEffectsAuthorized:false};
}
