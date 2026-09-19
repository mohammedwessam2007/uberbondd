#!/usr/bin/env node
import path from 'node:path';
import { readUberLitTypeSafeKey, inspectUberLitTypeSafeKey } from '../src/uberlit-typesafe-secret.mjs';
import { createSystemOneDecisionAdapter } from '../src/system-one-decision-adapter.mjs';
import { compileSemanticProgram, executeSemanticProgram } from '../src/noetic-autocompiler.mjs';

const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const flag=name=>process.argv.includes(`--${name}`);
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const execute=flag('execute');
const apiKey=readUberLitTypeSafeKey({runtimeRoot});
const keyState=inspectUberLitTypeSafeKey({runtimeRoot});

const priceInput=Number(process.env.TYPESAFE_INPUT_USD_PER_MILLION||0.042);
const priceOutput=Number(process.env.TYPESAFE_OUTPUT_USD_PER_MILLION||0);
const maxCost=Number(process.env.TYPESAFE_MAX_COST_USD_PER_CALL||0.001);
const pricing={
  inputUsdPerMillion:priceInput,
  outputUsdPerMillion:priceOutput,
  sourceRef:process.env.TYPESAFE_PRICING_SOURCE||'https://typesafe.ai/blog/introducing-system-one-models-and-jev',
  verifiedAt:process.env.TYPESAFE_PRICING_VERIFIED_AT||'2026-09-19T00:00:00.000Z'
};

const compiled=compileSemanticProgram({
  programId:'uberbond.uberlit.jev.shadow-canary.v1',
  purpose:'Prove sovereign UberLit can perform a bounded System-One judgement with zero consequence authority.',
  instructions:[
    {
      id:'needsFrontier',
      op:'NOUL',
      question:'Does this synthetic state require deeper generative reasoning before any action?',
      escalateBelow:0.80
    },
    {
      id:'minimumMechanism',
      op:'CHOICE',
      question:'What is the minimum sufficient mechanism for this synthetic read-only classification?',
      criteria:{
        deterministic:'Deterministic code alone is sufficient.',
        systemOne:'A typed System-One semantic judgement is sufficient.',
        frontier:'Deep generative frontier reasoning is required.'
      },
      escalateBelow:0.70
    }
  ]
});
if(!compiled.ok) throw new Error(`canary-program-refused:${compiled.reasonCodes?.join(',')}`);

const adapter=createSystemOneDecisionAdapter({
  apiKey:apiKey||'',
  baseUrl:process.env.TYPESAFE_BASE_URL||'https://api.typesafe.ai',
  model:process.env.TYPESAFE_DEFAULT_MODEL||'jev-latest',
  enabled:execute && process.env.TYPESAFE_JEV_ENABLED!=='false',
  pricing,
  maxCostUsdPerCall:maxCost
});

const result=await executeSemanticProgram({
  program:compiled.program,
  state:{
    kind:'synthetic-canary',
    environment:'UBERLIT',
    consequenceAuthority:'NONE',
    task:'classify whether a read-only structured judgement needs frontier reasoning'
  },
  decisionAdapter:adapter,
  mode:execute?'SHADOW':'PLAN_ONLY',
  providerCallAuthorized:execute,
  dataClass:'INTERNAL_NON_SENSITIVE',
  spendCeilingUsd:maxCost
});

process.stdout.write(`${JSON.stringify({
  schema:'uberbond.uberlit-jev-shadow-canary.v1',
  runtimeRoot,
  executeRequested:execute,
  keyState,
  result,
  externalEffectAuthority:'NONE',
  businessEffectAuthority:'NONE'
},null,2)}\n`);
if(execute&&!result.ok) process.exitCode=2;
