import crypto from 'node:crypto';
import { compileUberOceanSubstrate } from './uberocean-compute-fabric.mjs';

export const ORACLE_FREE_HOST_ADMISSION_VERSION='uberbond.oracle-free-host-admission.v1';
const hash=value=>'sha256:'+crypto.createHash('sha256').update(String(value)).digest('hex');

function tailscaleIpValid(value){
  const octets=String(value||'').trim().split('.').map(Number);
  return octets.length===4&&octets.every(Number.isInteger)&&octets.every(n=>n>=0&&n<=255)&&octets[0]===100&&octets[1]>=64&&octets[1]<=127;
}

export function compileOracleFreeHostAdmission({
  ownerEvidence,
  instance,
  shapeConfig,
  tailscaleIp,
  diskGb,
  uberlitHttpsHealthy,
  architecture='arm64',
  now=new Date()
}={}){
  const reasons=[];
  const ownerObserved=Date.parse(String(ownerEvidence?.observedAt||''));
  if(ownerEvidence?.alwaysFreeEligible!==true||Number(ownerEvidence?.incrementalCostCents)!==0)reasons.push('oracle-always-free-zero-cost-owner-evidence-required');
  if(!Number.isFinite(ownerObserved)||now.getTime()-ownerObserved<0||now.getTime()-ownerObserved>30*60*1000)reasons.push('fresh-oracle-owner-evidence-required');
  if(!String(ownerEvidence?.sourceRef||'').startsWith('oracle-console:'))reasons.push('oracle-console-source-ref-required');
  if(String(instance?.shape)!=='VM.Standard.A1.Flex')reasons.push('oracle-a1-flex-shape-required');
  const ocpus=Number(shapeConfig?.ocpus);
  const memoryGb=Number(shapeConfig?.memoryInGBs);
  if(!Number.isInteger(ocpus)||ocpus!==2)reasons.push('oracle-free-host-must-have-2-ocpus');
  if(!Number.isFinite(memoryGb)||memoryGb<11.9||memoryGb>12.1)reasons.push('oracle-free-host-must-have-12gb-memory');
  if(String(architecture).toLowerCase()!=='arm64')reasons.push('oracle-free-host-must-be-arm64');
  if(!Number.isInteger(Number(diskGb))||Number(diskGb)<1)reasons.push('observed-persistent-disk-required');
  if(uberlitHttpsHealthy!==true)reasons.push('uberlit-local-https-health-required');
  if(!tailscaleIpValid(tailscaleIp))reasons.push('tailscale-private-reachability-required');
  if(reasons.length)return{ok:false,status:'ORACLE_FREE_HOST_ADMISSION_BLOCKED',reasonCodes:[...new Set(reasons)],deploymentAuthority:'NONE',spendAuthority:'NONE'};

  const instanceDigest=hash(instance?.id||instance?.displayName||JSON.stringify(instance));
  const fdDigest=hash(`${instance?.availabilityDomain||'unknown'}:${instance?.faultDomain||'unknown'}`);
  const host={
    hostId:`oracle-a1-${instanceDigest.slice(7,19)}`,
    provider:'oracle-free',
    hostClass:'ORACLE_ALWAYS_FREE',
    sourceRef:`oracle-imds-v2:${instanceDigest}`,
    observedAt:now.toISOString(),
    failureDomain:`oracle-${fdDigest.slice(7,19)}`,
    failureDomainEvidenceRef:`oracle-imds-v2-failure-domain:${fdDigest}`,
    architecture:'arm64',
    os:'ubuntu-linux',
    vcpus:ocpus,
    memoryMb:Math.round(memoryGb*1024),
    diskGb:Number(diskGb),
    monthlyCostCents:0,
    networkReachable:true,
    sshOrConsoleReachable:true
  };
  const meshReceipt={providerIndependent:true,transport:'TAILSCALE',evidenceRef:`tailscale-private-ip:${hash(tailscaleIp)}`};
  const substrate=compileUberOceanSubstrate({serviceId:'uberbond-oracle-free-uberlit',hosts:[host],meshReceipt,requireZeroNewSpend:true,requireIndependentFallback:false,now});
  if(!substrate.ok)return{ok:false,status:'ORACLE_FREE_HOST_ADMISSION_BLOCKED',reasonCodes:['uberocean-substrate-refused',...(substrate.reasonCodes||[])],deploymentAuthority:'NONE',spendAuthority:'NONE'};

  return{
    ok:true,
    schema:ORACLE_FREE_HOST_ADMISSION_VERSION,
    observedAt:now.toISOString(),
    status:'ORACLE_FREE_UBEROCEAN_HOST_ADMITTED',
    host:substrate.plan.resourceCells[0],
    adapter:substrate.plan.adapters[0],
    planDigest:substrate.planDigest,
    oracleEvidence:{sourceRef:ownerEvidence.sourceRef,alwaysFreeEligible:true,incrementalCostCents:0,observedAt:new Date(ownerObserved).toISOString()},
    localHealth:{uberlitHttps:true,tailscalePrivateReachable:true},
    independentFallbackPresent:false,
    ubercelSovereignDeploymentReady:false,
    resilienceBlocker:'INDEPENDENT_FAILURE_DOMAIN_FALLBACK_NOT_YET_OBSERVED',
    truthBoundary:'THE ZERO-COST ORACLE HOST IS ADMITTED TO UBEROCEAN FOR UBERLIT/JEV USE. THIS DOES NOT CLAIM FULL UBERCEL SOVEREIGN PRODUCTION REDUNDANCY.',
    deploymentAuthority:'NONE',
    spendAuthority:'NONE',
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE'
  };
}
