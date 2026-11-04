import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PHOENIX_NATIVE_CLI_HEALTH_VERSION = 'phoenix.native-cli-health.v1';
const CLIENTS=Object.freeze([
  {id:'claude',binary:'claude',args:['auth','status','--json']},
  {id:'codex',binary:'codex',args:['login','status']}
]);

const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const denied=(reason)=>({
  ok:false,status:'NATIVE_CLI_HEALTH_REFUSED',reason,
  externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS)
});
function classify(spec,result) {
  if(result?.error?.code==='ENOENT')return 'CLI_NOT_FOUND';
  if(result?.error?.code==='ETIMEDOUT' || result?.signal==='SIGTERM')return 'STATUS_TIMED_OUT';
  // Outputs are NEVER copied into the returned receipt or logs. Even
  // diagnostic stdout/stderr may contain private identifiers.
  const raw=String(result?.stdout??'');
  const err=String(result?.stderr??'');
  if(spec.id==='claude') {
    try {
      const parsed=JSON.parse(raw);
      if(parsed && typeof parsed==='object' && typeof parsed.loggedIn==='boolean')
        return parsed.loggedIn===true && result.status===0 ? 'AUTHENTICATED_CLI_REPORTED' : 'NOT_AUTHENTICATED_CLI_REPORTED';
    } catch {}
  }
  if(spec.id==='codex') {
    const response=(raw+' '+err).toLowerCase();
    if(/\bnot logged in\b|\bnot signed in\b|\blogin required\b|\bno login\b/.test(response))
      return 'NOT_AUTHENTICATED_CLI_REPORTED';
    if(result.status===0 && /\blogged in\b|\bsigned in\b/.test(response))
      return 'AUTHENTICATED_CLI_REPORTED';
  }
  return 'UNKNOWN_FROM_LOCAL_STATUS';
}

export function inspectNativeCliAuth({run=spawnSync,now=new Date()}={}) {
  const instant=new Date(now);
  if(!Number.isFinite(instant.getTime())||typeof run!=='function')return denied('VALID_CLOCK_AND_RUNNER_REQUIRED');
  const clients=[];
  for(const spec of CLIENTS) {
    let result;
    try {
      result=run(spec.binary,spec.args,{
        encoding:'utf8',timeout:7000,maxBuffer:8192,
        shell:false,windowsHide:true
      });
    } catch {
      result={error:{code:'EXECUTION_FAILED'}};
    }
    clients.push({
      id:spec.id,
      status:classify(spec,result),
      commandClass:'OFFICIAL_READ_ONLY_LOCAL_LOGIN_STATUS',
      reportedProviderIdentity:false,
      actualModelTurnObserved:false,
      sideEffectProof:'NOT_INDEPENDENTLY_INSTRUMENTED'
    });
  }
  const receipt={schemaVersion:PHOENIX_NATIVE_CLI_HEALTH_VERSION,
    observedAt:instant.toISOString(),clients,
    claimedCapabilityIds:['phoenix-capability-0001','phoenix-wave4-0001'],
    acceptanceCoverage:'PARTIAL_READ_ONLY_STATUS_PROBE__MOCK_POS_NEG_TESTED_REAL_AUTH_AND_SIGNED_RECEIPT_UNVERIFIED',
    signatureStatus:'UNSIGNED_SHA256_RECEIPT_NOT_TRUSTED_PROVIDER_ATTESTATION',
    externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',
    externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary:'CLI_SELF_REPORTED_LOCAL_LOGIN_STATE_ONLY__NOT_ACCOUNT_SESSION_AUTHORITY_OR_REAL_MODEL_EXECUTION'};
  receipt.receiptDigest='sha256:'+digest(receipt);
  return {ok:true,status:'NATIVE_CLI_HEALTH_OBSERVED',...receipt};
}
