import https from 'node:https';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERCEL_UBERLIT_LINUX_ADAPTER_VERSION='uberbond.ubercel-uberlit-linux-adapter.v1';
const SHA40=/^[0-9a-f]{40}$/;
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);

const defaultRun=(file,args,options={})=>spawnSync(file,args,{encoding:'utf8',maxBuffer:16*1024*1024,...options});
const defaultHealthProbe=({url,expectedStatus=200,timeoutMs=5000})=>new Promise((resolve,reject)=>{
  const request=https.request(url,{method:'GET',rejectUnauthorized:false,timeout:timeoutMs},response=>{
    let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({ok:response.statusCode===expectedStatus,status:response.statusCode||0,body}));
  });
  request.once('error',reject);request.once('timeout',()=>request.destroy(new Error('uberlit-health-timeout')));request.end();
});

function parseLastJson(textValue){
  const lines=String(textValue||'').trim().split(/\r?\n/).filter(Boolean).reverse();
  for(const line of lines){try{return JSON.parse(line);}catch{}}
  return null;
}

/**
 * First-party Ubercel adapter for any authorized Linux cell capable of running
 * UberLit. The host is a replaceable resource cell; Ubercel retains policy and
 * one-shot deployment authority. Persistent installation remains delegated to
 * the existing UberLit installer and rollback scripts.
 */
export function createUberLitLinuxAdapterExecutor({
  adapterId='uberlit-linux',provider='owned-linux',sourceCheckout,
  installerPath='ops/sovereign/install-uberlit.sh',rollbackPath='ops/sovereign/rollback-uberlit.sh',
  healthUrl='https://127.0.0.1:32443/api/health',runCommand=defaultRun,probeHealth=defaultHealthProbe
}={}){
  const id=text(adapterId,120)?.toLowerCase(),providerId=text(provider,120)?.toLowerCase(),source=text(sourceCheckout,2000);
  if(!id||!providerId||!source)throw new Error('uberlit-linux-adapter-identity-and-source-required');
  const resolvedInstaller=path.resolve(source,installerPath),resolvedRollback=path.resolve(source,rollbackPath);

  return {
    adapterId:id,
    provider:providerId,
    async executeDeployment(input={}){
      const releaseSha=String(input?.release?.sourceCommit||'').trim().toLowerCase();
      if(!SHA40.test(releaseSha))return{ok:false,status:'ADAPTER_DEPLOYMENT_REFUSED',reasonCodes:['exact-release-source-required'],externalEffectLedger:zero()};
      if(String(input?.binding?.adapterId||'').toLowerCase()!==id||String(input?.binding?.provider||'').toLowerCase()!==providerId)return{ok:false,status:'ADAPTER_DEPLOYMENT_REFUSED',reasonCodes:['ubercel-binding-identity-mismatch'],externalEffectLedger:zero()};

      const sourceCheck=runCommand('git',['-C',source,'rev-parse','HEAD']);
      const observedSource=sourceCheck?.status===0?String(sourceCheck.stdout||'').trim().toLowerCase():null;
      if(observedSource!==releaseSha)return{ok:false,status:'ADAPTER_DEPLOYMENT_REFUSED',reasonCodes:['linux-cell-source-mismatch'],sourceCommit:observedSource,externalEffectLedger:zero()};
      const dirty=runCommand('git',['-C',source,'status','--porcelain','--untracked-files=no']);
      if(dirty?.status!==0||String(dirty.stdout||'').trim())return{ok:false,status:'ADAPTER_DEPLOYMENT_REFUSED',reasonCodes:['linux-cell-clean-source-required'],sourceCommit:observedSource,externalEffectLedger:zero()};

      const install=runCommand('bash',[resolvedInstaller,source,'--start']);
      if(install?.status!==0)throw Object.assign(new Error('uberlit-install-or-start-failed'),{installerStatus:install?.status??null});
      const installReceipt=parseLastJson(install.stdout);
      if(!installReceipt?.ok||installReceipt.status!=='UBERLIT_NODE_INSTALLED'||String(installReceipt.sourceCommit||'').toLowerCase()!==releaseSha||installReceipt.serviceStarted!==true)throw new Error('canonical-uberlit-install-receipt-required');

      let health;
      try{health=await probeHealth({url:healthUrl,expectedStatus:Number(input?.healthContract?.expectedStatus||200)});}catch(error){
        const rollback=runCommand('bash',[resolvedRollback]);
        throw Object.assign(new Error('uberlit-health-failed-after-install'),{cause:error?.message||String(error),rollbackStatus:rollback?.status??null});
      }
      if(!health?.ok){
        const rollback=runCommand('bash',[resolvedRollback]);
        throw Object.assign(new Error('uberlit-health-refused-after-install'),{observedStatus:health?.status??null,rollbackStatus:rollback?.status??null});
      }

      return{
        ok:true,status:'ADAPTER_DEPLOYMENT_OBSERVED',sourceCommit:releaseSha,
        deploymentRef:`uberlit-linux:${providerId}:${releaseSha}`,
        healthEvidenceRef:`local-https-health:${healthUrl}:status-${health.status}`,
        rollbackEvidenceRef:`local-script:${resolvedRollback}`,
        externalEffectLedger:{providerCalls:0,messages:0,purchases:0,deployments:1,credentialChanges:0,dnsChanges:0,productionMutations:1,spendCents:0}
      };
    }
  };
}
