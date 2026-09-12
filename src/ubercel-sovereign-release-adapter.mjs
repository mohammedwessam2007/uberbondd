import { spawnSync } from 'node:child_process';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERCEL_SOVEREIGN_RELEASE_ADAPTER_VERSION='uberbond.ubercel-sovereign-release-adapter.v1';
const SHA40=/^[0-9a-f]{40}$/;
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const defaultRun=(file,args,options={})=>spawnSync(file,args,{encoding:'utf8',maxBuffer:16*1024*1024,...options});
function parseStatus(raw=''){
  const out={};
  for(const line of String(raw).split(/\r?\n/)){const i=line.indexOf('=');if(i>0)out[line.slice(0,i).trim()]=line.slice(i+1).trim();}
  return out;
}

/**
 * Production-grade Ubercel adapter for an owner-controlled sovereign runtime.
 * The offline signer and zero-network courier stay separate. This adapter only
 * tells the runtime to apply the already-couriered signed release and then
 * verifies exact active source + health. It never reads signing material.
 */
export function createUbercelSovereignReleaseExecutor({
  adapterId='sovereign-runtime',provider='owned-sovereign-runtime',
  controlPath='/opt/uberbond/control/uberbondctl',runCommand=defaultRun
}={}){
  const id=text(adapterId,120)?.toLowerCase(),providerId=text(provider,120)?.toLowerCase(),ctl=text(controlPath,2000);
  if(!id||!providerId||!ctl)throw new Error('sovereign-release-adapter-identity-required');
  return{
    adapterId:id,provider:providerId,
    async executeDeployment(input={}){
      const sourceCommit=String(input?.release?.sourceCommit||'').trim().toLowerCase();
      if(!SHA40.test(sourceCommit))return{ok:false,status:'ADAPTER_DEPLOYMENT_REFUSED',reasonCodes:['exact-release-source-required'],externalEffectLedger:zero()};
      if(String(input?.binding?.adapterId||'').toLowerCase()!==id||String(input?.binding?.provider||'').toLowerCase()!==providerId)return{ok:false,status:'ADAPTER_DEPLOYMENT_REFUSED',reasonCodes:['ubercel-binding-identity-mismatch'],externalEffectLedger:zero()};

      const before=runCommand(ctl,['status']);
      if(before?.status!==0)return{ok:false,status:'ADAPTER_DEPLOYMENT_REFUSED',reasonCodes:['sovereign-runtime-status-required-before-apply'],externalEffectLedger:zero()};
      const beforeState=parseStatus(before.stdout);

      const applied=runCommand(ctl,['apply-inbox']);
      if(applied?.status!==0)throw Object.assign(new Error('sovereign-runtime-apply-inbox-failed'),{exitCode:applied?.status??null});

      const after=runCommand(ctl,['status']);
      if(after?.status!==0)throw new Error('sovereign-runtime-status-unavailable-after-apply');
      const state=parseStatus(after.stdout);
      if(String(state.source_commit||'').toLowerCase()!==sourceCommit)throw Object.assign(new Error('sovereign-runtime-source-not-promoted'),{observedSource:state.source_commit||null});
      const web=String(state.web||'').toLowerCase(),postgres=String(state.postgres||'').toLowerCase(),worker=String(state.worker||'').toLowerCase();
      if(!web.startsWith('running/healthy')||!postgres.startsWith('running/healthy')||worker!=='running')throw Object.assign(new Error('sovereign-runtime-health-not-green-after-apply'),{web,postgres,worker});
      const releaseId=text(state.current_release_id,300),releaseName=text(state.current_release,300);
      if(!releaseId||!releaseName)throw new Error('sovereign-runtime-release-identity-required');

      return{
        ok:true,status:'ADAPTER_DEPLOYMENT_OBSERVED',sourceCommit,
        deploymentRef:`sovereign-runtime:${releaseId}`,
        healthEvidenceRef:`sovereign-runtime-status:${releaseId}:web=${web}:postgres=${postgres}:worker=${worker}`,
        rollbackEvidenceRef:`sovereign-runtime:${ctl}:rollback:previous=${beforeState.current_release_id||'NONE'}`,
        externalEffectLedger:{providerCalls:0,messages:0,purchases:0,deployments:1,credentialChanges:0,dnsChanges:0,productionMutations:1,spendCents:0},
        truthBoundary:'Ubercel observed one exact already-signed release admitted by the owner-controlled sovereign runtime. The adapter neither signs nor couriers releases and receives no signing, policy, business, or credential authority.'
      };
    }
  };
}
