#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const flag=name=>process.argv.includes(`--${name}`);
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const output=path.resolve(arg('output')||path.join(runtimeRoot,'artifacts','oracle-always-free-owner-evidence.json'));
const sourceRef=arg('source-ref');
const cost=Number(arg('incremental-cost-cents'));
if(!flag('always-free'))throw new Error('explicit-always-free-observation-required');
if(!sourceRef.startsWith('oracle-console:')||sourceRef.length>500)throw new Error('bounded-oracle-console-source-ref-required');
if(!Number.isFinite(cost)||cost!==0)throw new Error('zero-incremental-cost-observation-required');

const receipt={
  schema:'uberbond.oracle-always-free-owner-evidence.v1',
  observedAt:new Date().toISOString(),
  alwaysFreeEligible:true,
  incrementalCostCents:0,
  sourceRef,
  observerClass:'FOUNDER_OR_AUTHORIZED_COWORK_BROWSER_SESSION',
  legalAcceptanceDelegated:false,
  paymentCommitmentDelegated:false,
  secretIncluded:false,
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE'
};
fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
