import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OWNED_TARGET_SECURITY_VERIFIER_VERSION='uberbond.owned-target-security-verifier.v1';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'SECURITY_TEST_ONLY',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});
const SAFE_CLASSES=new Set(['OWNED_LOCAL','OWNED_TEST','OWNED_PREVIEW']);
const SAFE_METHODS=new Set(['HEAD','GET','OPTIONS']);

function normalizeTarget({url,targetClass}){
  let parsed;try{parsed=new URL(String(url||''));}catch{return {ok:false,reason:'valid-url-required'};}
  const cls=String(targetClass||'').toUpperCase();if(!SAFE_CLASSES.has(cls))return {ok:false,reason:'owned-nonproduction-target-required'};
  if(!['http:','https:'].includes(parsed.protocol))return {ok:false,reason:'http-or-https-required'};
  if(cls==='OWNED_LOCAL'&&!['localhost','127.0.0.1','::1'].includes(parsed.hostname))return {ok:false,reason:'owned-local-must-be-loopback'};
  if(cls!=='OWNED_LOCAL'&&parsed.protocol!=='https:')return {ok:false,reason:'remote-owned-target-must-use-https'};
  parsed.username='';parsed.password='';parsed.hash='';
  return {ok:true,url:parsed.toString(),targetClass:cls};
}

function headerMap(headers){const out={};for(const [k,v] of headers.entries())out[k.toLowerCase()]=v;return out;}
function assessHeaders(headers){
  const findings=[];
  const required=[['content-security-policy','CSP_MISSING',2],['x-content-type-options','XCTO_MISSING',2],['referrer-policy','REFERRER_POLICY_MISSING',1]];
  for(const [name,code,severity] of required)if(!headers[name])findings.push({code,severity,evidence:`header:${name}:absent`});
  if(headers['strict-transport-security']==null)findings.push({code:'HSTS_MISSING',severity:2,evidence:'header:strict-transport-security:absent'});
  const acao=headers['access-control-allow-origin'];const acac=String(headers['access-control-allow-credentials']||'').toLowerCase();
  if(acao==='*'&&acac==='true')findings.push({code:'CORS_WILDCARD_WITH_CREDENTIALS',severity:4,evidence:'acao:*;credentials:true'});
  const setCookie=headers['set-cookie'];if(setCookie){if(!/;\s*secure\b/i.test(setCookie))findings.push({code:'COOKIE_SECURE_MISSING',severity:3,evidence:'set-cookie-without-secure'});if(!/;\s*httponly\b/i.test(setCookie))findings.push({code:'COOKIE_HTTPONLY_MISSING',severity:2,evidence:'set-cookie-without-httponly'});if(!/;\s*samesite=/i.test(setCookie))findings.push({code:'COOKIE_SAMESITE_MISSING',severity:2,evidence:'set-cookie-without-samesite'});}
  return findings;
}

export async function verifyOwnedTarget({url,targetClass,fetchImpl=globalThis.fetch,timeoutMs=8000}={}){
  const target=normalizeTarget({url,targetClass});if(!target.ok)return envelope({ok:false,status:'OWNED_SECURITY_VERIFICATION_REFUSED',reasonCodes:[target.reason]});
  if(typeof fetchImpl!=='function')return envelope({ok:false,status:'OWNED_SECURITY_VERIFICATION_REFUSED',reasonCodes:['fetch-implementation-required']});
  const timeout=Number(timeoutMs);if(!Number.isSafeInteger(timeout)||timeout<100||timeout>30000)return envelope({ok:false,status:'OWNED_SECURITY_VERIFICATION_REFUSED',reasonCodes:['bounded-timeout-required']});
  const checks=[];const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    for(const method of ['HEAD','OPTIONS','GET']){
      if(!SAFE_METHODS.has(method))throw new Error('unsafe-method');
      const response=await fetchImpl(target.url,{method,redirect:'manual',signal:controller.signal,headers:{'user-agent':'UberBond-Owned-Security-Verifier/1.0'}});
      const headers=headerMap(response.headers);checks.push({method,status:response.status,headers,findings:assessHeaders(headers)});
      if(method==='GET'&&response.body?.cancel)await response.body.cancel().catch(()=>{});
    }
  }catch(error){return envelope({ok:false,status:'OWNED_SECURITY_VERIFICATION_FAILED',reasonCodes:['read-only-security-probe-failed'],errorClass:String(error?.name||'ERROR')});}
  finally{clearTimeout(timer);}
  const findings=checks.flatMap(c=>c.findings.map(f=>({...f,method:c.method,status:c.status}))).sort((a,b)=>b.severity-a.severity||a.code.localeCompare(b.code));
  const receipt={schemaVersion:'uberbond.owned-security-verification.v1',target:{url:target.url,targetClass:target.targetClass},methods:['HEAD','OPTIONS','GET'],readOnly:true,exploitPayloads:false,credentialAccess:false,persistence:false,checks,findings};
  return envelope({ok:true,status:'OWNED_SECURITY_VERIFICATION_COMPLETE',receipt,receiptDigest:hash(receipt),findingCount:findings.length,claimBoundary:'READ_ONLY_AUTONOMOUS_SECURITY_VERIFICATION_FOR_OWNED_LOCAL_TEST_PREVIEW_TARGETS_ONLY__NOT_EXPLOITATION_NOT_PRODUCTION_AUTHORITY'});
}
