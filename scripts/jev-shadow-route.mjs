#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readUberLitTypeSafeKey } from '../src/uberlit-typesafe-secret.mjs';
import { createSystemOneDecisionAdapter } from '../src/system-one-decision-adapter.mjs';
import { shadowRouteMechanism } from '../src/system-one-routing-shadow.mjs';

const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const flag=name=>process.argv.includes(`--${name}`);
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const inputPath=arg('input');
let input={task:{summary:'synthetic mechanism-routing shadow probe'},taskClass:'ROUTING',canonicalRoute:null};
if(inputPath){
  const stat=fs.lstatSync(inputPath);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1_000_000)throw new Error('bounded-regular-input-required');
  input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
}
const execute=flag('execute');
const dataClass=arg('data-class')||'UNCLASSIFIED';
const maxCost=Number(process.env.TYPESAFE_MAX_COST_USD_PER_CALL||0.001);
const adapter=createSystemOneDecisionAdapter({
  apiKey:readUberLitTypeSafeKey({runtimeRoot})||'',
  enabled:execute && process.env.TYPESAFE_JEV_ENABLED!=='false',
  baseUrl:process.env.TYPESAFE_BASE_URL||'https://api.typesafe.ai',
  model:process.env.TYPESAFE_DEFAULT_MODEL||'jev-latest',
  pricing:{
    inputUsdPerMillion:Number(process.env.TYPESAFE_INPUT_USD_PER_MILLION||0.042),
    outputUsdPerMillion:Number(process.env.TYPESAFE_OUTPUT_USD_PER_MILLION||0),
    sourceRef:process.env.TYPESAFE_PRICING_SOURCE||'https://typesafe.ai/',
    verifiedAt:process.env.TYPESAFE_PRICING_VERIFIED_AT||'2026-09-19T00:00:00.000Z'
  },
  maxCostUsdPerCall:maxCost
});
const result=await shadowRouteMechanism({
  task:input.task,
  taskClass:input.taskClass||'GENERAL',
  canonicalRoute:input.canonicalRoute||null,
  decisionAdapter:adapter,
  runtimeRoot,
  execute,
  providerCallAuthorized:execute,
  spendCeilingUsd:maxCost,
  dataClass
});
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
if(execute&&!result.ok)process.exitCode=2;
