#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { compileUberOceanSubstrate } from '../src/uberocean-compute-fabric.mjs';

const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const ownerEvidencePath=path.resolve(arg('owner-evidence')||path.join(runtimeRoot,'artifacts','oracle-always-free-owner-evidence.json'));
const outputPath=path.resolve(arg('output')||path.join(runtimeRoot,'artifacts','uberocean-oracle-host-admission.json'));
const now=new Date();

const hash=value=>'sha256:'+crypto.createHash('sha256').update(String(value)).digest('hex');
const safeJson=file=>{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>100_000)throw new Error('bounded-regular-owner-evidence-required');
  return JSON.parse(fs.readFileSync(file,'utf8'));
};
const owner=safeJson(ownerEvidencePath);
const ownerObserved=Date.parse(String(owner.observedAt||''));
if(owner.alwaysFreeEligible!==true||Number(owner.incrementalCostCents)!==0)throw new Error('oracle-always-free-zero-cost-owner-evidence-required');
if(!Number.isFinite(ownerObserved)||now.getTime()-ownerObserved<0||now.getTime()-ownerObserved>30*60*1000)throw new Error('fresh-oracle-owner-evidence-required');
if(!String(owner.sourceRef||'').startsWith('oracle-console:'))throw new Error('oracle-console-source-ref-required');

const imds=async suffix=>{
  const response=await fetch(`http://169.254.169.254/opc/v2/instance/${suffix}`,{headers:{Authorization:'Bearer Oracle'},signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error(`oracle-imds-http-${response.status}`);
  return response.json();
};
const instance=await imds('');
const shape=instance?.shapeConfig&&typeof instance.shapeConfig==='object'?instance.shapeConfig:await imds('shapeConfig');
if(String(instance?.shape)!=='VM.Standard.A1.Flex')throw new Error('oracle-a1-flex-shape-required');
const ocpus=Number(shape?.ocpus);
const memoryGb=Number(shape?.memoryInGBs);
if(!Number.isInteger(ocpus)||ocpus!==2)throw new Error('oracle-free-host-must-have-2-ocpus');
if(!Number.isFinite(memoryGb)||memoryGb<11.9||memoryGb>12.1)throw new Error('oracle-free-host-must-have-12gb-memory');

const health=await new Promise((resolve,reject)=>{
  const req=https.request('https://127.0.0.1:32443/api/health',{method:'GET',rejectUnauthorized:false,timeout:3000},res=>{res.resume();res.on('end',()=>resolve(res.statusCode===200));});
  req.once('timeout',()=>req.destroy(new Error('uberlit-health-timeout')));
  req.once('error',reject);
  req.end();
});
if(!health)throw new Error('uberlit-local-https-health-required');

const tailIp=execFileSync('tailscale',['ip','-4'],{encoding:'utf8',timeout:5000}).trim().split(/\r?\n/).filter(Boolean)[0]||'';
const octets=tailIp.split('.').map(Number);
if(!(octets.length===4&&octets.every(Number.isInteger)&&octets[0]===100&&octets[1]>=64&&octets[1]<=127))throw new Error('tailscale-private-reachability-required');

const st=fs.statfsSync('/');
const diskGb=Math.max(1,Math.floor((Number(st.blocks)*Number(st.bsize))/(1024**3)));
const instanceDigest=hash(instance?.id||instance?.displayName||JSON.stringify(instance));
const fdRaw=`${instance?.availabilityDomain||'unknown'}:${instance?.faultDomain||'unknown'}`;
const fdDigest=hash(fdRaw);
const host={
  hostId:`oracle-a1-${instanceDigest.slice(7,19)}`,
  provider:'oracle-free',
  hostClass:'ORACLE_ALWAYS_FREE',
  sourceRef:`oracle-imds-v2:${instanceDigest}`,
  observedAt:now.toISOString(),
  failureDomain:`oracle-${fdDigest.slice(7,19)}`,
  failureDomainEvidenceRef:`oracle-imds-v2-failure-domain:${fdDigest}`,
  architecture:process.arch,
  os:'ubuntu-linux',
  vcpus:ocpus,
  memoryMb:Math.round(memoryGb*1024),
  diskGb,
  monthlyCostCents:0,
  networkReachable:true,
  sshOrConsoleReachable:true
};
const meshReceipt={providerIndependent:true,transport:'TAILSCALE',evidenceRef:`tailscale-private-ip:${hash(tailIp)}`};
const result=compileUberOceanSubstrate({
  serviceId:'uberbond-oracle-free-uberlit',
  hosts:[host],
  meshReceipt,
  requireZeroNewSpend:true,
  requireIndependentFallback:false,
  now
});
if(!result.ok)throw new Error(`uberocean-admission-refused:${(result.reasonCodes||[]).join(',')}`);

const receipt={
  schema:'uberbond.uberocean-oracle-host-admission.v1',
  observedAt:now.toISOString(),
  status:'ORACLE_FREE_UBEROCEAN_HOST_ADMITTED',
  host:result.plan.resourceCells[0],
  adapter:result.plan.adapters[0],
  planDigest:result.planDigest,
  oracleEvidence:{sourceRef:owner.sourceRef,alwaysFreeEligible:true,incrementalCostCents:0,observedAt:new Date(ownerObserved).toISOString()},
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
fs.mkdirSync(path.dirname(outputPath),{recursive:true,mode:0o700});
fs.writeFileSync(outputPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
