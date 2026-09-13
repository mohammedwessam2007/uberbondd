#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;};
const root=path.resolve(arg('--root',process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond'));
const observeMs=Math.max(5000,Number(arg('--observe-ms','12000'))||12000);
const services=['uberlit.service','uberlit-tls-edge.service','uberlit-worker.service'];
const run=(...args)=>execFileSync(args[0],args.slice(1),{encoding:'utf8'}).trim();
const mtime=p=>fs.statSync(p).mtimeMs;
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));

for(const svc of services){
  if(run('systemctl','is-enabled',svc)!=='enabled') throw new Error(`24x7-service-not-enabled:${svc}`);
  if(run('systemctl','is-active',svc)!=='active') throw new Error(`24x7-service-not-active:${svc}`);
}

const livePath=path.join(root,'runtime','worker-liveness.json');
const wealthPath=path.join(root,'artifacts','universal-wealth-latest.json');
if(!fs.existsSync(livePath)) throw new Error('24x7-worker-liveness-missing');
if(!fs.existsSync(wealthPath)) throw new Error('24x7-wealth-receipt-missing');
const beforeLive=readJson(livePath);
const beforeWealth=mtime(wealthPath);
const beforeLiveMtime=mtime(livePath);
await new Promise(resolve=>setTimeout(resolve,observeMs));
const afterLive=readJson(livePath);
const afterWealth=mtime(wealthPath);
const afterLiveMtime=mtime(livePath);
if(afterLiveMtime<=beforeLiveMtime) throw new Error('24x7-worker-liveness-not-advancing');
if(afterWealth<=beforeWealth) throw new Error('24x7-wealth-receipt-not-advancing');
if(afterLive?.autopilotEnabled!==true) throw new Error('24x7-autopilot-not-proven');
if(afterLive?.restartRequested===true) throw new Error(`24x7-worker-requested-restart:${afterLive?.reason||'unknown'}`);

console.log(JSON.stringify({
  ok:true,
  status:'UBERLIT_24X7_ACCEPTANCE_PASS',
  observeMs,
  services:Object.fromEntries(services.map(s=>[s,'enabled+active'])),
  livenessAdvanced:true,
  wealthReceiptAdvanced:true,
  autopilotEnabled:true,
  sourceCommit:afterLive?.sourceCommit||beforeLive?.sourceCommit||null,
  externalEffectAuthority:'NONE',
  truthBoundary:'THIS_PROVES_RESIDENT_RUNTIME_LIVENESS_AND_WEALTH_LOOP_ADVANCEMENT_ONLY; IT_DOES_NOT_PROVE_REVENUE_OR_EXTERNAL_COMMERCIAL_EFFECTS'
}));
