import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { createContaboPreflightClient, discoverContaboMailCellInputs } from './ubercloud-contabo-cell-preflight.mjs';

export const UBERCLOUD_CONTABO_PREFLIGHT_OPERATOR_VERSION='uberbond.ubercloud-contabo-preflight-operator.v1';
export const CONTABO_PREFLIGHT_ENV_NAMES=Object.freeze([
  'CONTABO_CLIENT_ID',
  'CONTABO_CLIENT_SECRET',
  'CONTABO_API_USER',
  'CONTABO_API_PASSWORD'
]);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);

export function inspectContaboCredentialPresence(env={}){
  const present=[];const missing=[];
  for(const name of CONTABO_PREFLIGHT_ENV_NAMES){
    const value=String(env?.[name]??'').trim();
    (value?present:missing).push(name);
  }
  return{
    ok:missing.length===0,
    status:missing.length?'CONTABO_PREFLIGHT_CREDENTIALS_MISSING':'CONTABO_PREFLIGHT_CREDENTIALS_PRESENT',
    present,
    missing,
    credentialValuesExposed:false,
    businessEffectAuthority:'NONE',spendAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero()
  };
}

export async function runContaboPreflightOperator({env=process.env,fetchFn=globalThis.fetch,preferredRegion='EU',requestId}={}){
  const presence=inspectContaboCredentialPresence(env);
  if(!presence.ok){
    return{
      ok:false,
      version:UBERCLOUD_CONTABO_PREFLIGHT_OPERATOR_VERSION,
      status:'CONTABO_PREFLIGHT_BLOCKED_MISSING_RUNTIME_CREDENTIALS',
      credentialPresence:presence,
      businessEffectAuthority:'NONE',spendAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero(),
      truthBoundary:'This receipt reports credential variable presence only. It never reveals credential values and performs no provider call when any required runtime credential is missing.'
    };
  }
  let client;
  try{
    client=createContaboPreflightClient({
      clientId:env.CONTABO_CLIENT_ID,
      clientSecret:env.CONTABO_CLIENT_SECRET,
      apiUser:env.CONTABO_API_USER,
      apiPassword:env.CONTABO_API_PASSWORD,
      fetchFn,
      ...(typeof requestId==='function'?{requestId}:{})
    });
  }catch(error){
    return{
      ok:false,version:UBERCLOUD_CONTABO_PREFLIGHT_OPERATOR_VERSION,status:'CONTABO_PREFLIGHT_CLIENT_REFUSED',reasonCodes:['runtime-credential-client-construction-failed'],errorClass:error?.name||'Error',credentialPresence:presence,businessEffectAuthority:'NONE',spendAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero()
    };
  }
  const discovered=await discoverContaboMailCellInputs({client,preferredRegion});
  if(!discovered.ok){
    return{
      ...discovered,
      version:UBERCLOUD_CONTABO_PREFLIGHT_OPERATOR_VERSION,
      credentialPresence:presence,
      truthBoundary:'Read-only Contabo account preflight failed or found no admissible existing image/SSH-key inputs. No credential value is returned and no provider mutation, deployment, or spend is authorized.'
    };
  }
  return{
    ok:true,
    version:UBERCLOUD_CONTABO_PREFLIGHT_OPERATOR_VERSION,
    status:'CONTABO_PREFLIGHT_OPERATOR_READY',
    selection:{...discovered.selection},
    credentialPresence:presence,
    providerReadCount:Number(discovered.externalEffectLedger?.providerCalls||0),
    businessEffectAuthority:'NONE',spendAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:{...zero(),providerCalls:Number(discovered.externalEffectLedger?.providerCalls||0)},
    truthBoundary:'This receipt proves only secret-safe runtime credential presence and read-only Contabo account metadata selection. It does not expose credential values, quote a price, authorize spend, create an instance, mutate PTR, or prove physical mail readiness.'
  };
}
