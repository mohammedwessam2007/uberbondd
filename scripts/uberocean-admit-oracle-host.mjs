#!/usr/bin/env node
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { compileOracleFreeHostAdmission } from '../src/oracle-free-host-admission.mjs';

const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const ownerEvidencePath=path.resolve(arg('owner-evidence')||path.join(runtimeRoot,'artifacts','oracle-always-free-owner-evidence.json'));
const outputPath=path.resolve(arg('output')||path.join(runtimeRoot,'artifacts','uberocean-oracle-host-admission.json'));

const safeJson=file=>{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>100_000)throw new Error('bounded-regular-owner-evidence-required');
  return JSON.parse(fs.readFileSync(file,'utf8'));
};
const ownerEvidence=safeJson(ownerEvidencePath);
const imds=async suffix=>{
  const response=await fetch(`http://169.254.169.254/opc/v2/instance/${suffix}`,{headers:{Authorization:'Bearer Oracle'},signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error(`oracle-imds-http-${response.status}`);
  return response.json();
};
const instance=await imds('');
const shapeConfig=instance?.shapeConfig&&typeof instance.shapeConfig==='object'?instance.shapeConfig:await imds('shapeConfig');

const uberlitHttpsHealthy=await new Promise((resolve,reject)=>{
  const req=https.request('https://127.0.0.1:32443/api/health',{method:'GET',rejectUnauthorized:false,timeout:3000},res=>{res.resume();res.on('end',()=>resolve(res.statusCode===200));});
  req.once('timeout',()=>req.destroy(new Error('uberlit-health-timeout')));
  req.once('error',reject);
  req.end();
});
const tailscaleIp=execFileSync('tailscale',['ip','-4'],{encoding:'utf8',timeout:5000}).trim().split(/\r?\n/).filter(Boolean)[0]||'';
const st=fs.statfsSync('/');
const diskGb=Math.max(1,Math.floor((Number(st.blocks)*Number(st.bsize))/(1024**3)));

const receipt=compileOracleFreeHostAdmission({
  ownerEvidence,
  instance,
  shapeConfig,
  tailscaleIp,
  diskGb,
  uberlitHttpsHealthy,
  architecture:process.arch,
  now:new Date()
});
if(!receipt.ok)throw new Error(`oracle-free-host-admission-refused:${(receipt.reasonCodes||[]).join(',')}`);
fs.mkdirSync(path.dirname(outputPath),{recursive:true,mode:0o700});
fs.writeFileSync(outputPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
