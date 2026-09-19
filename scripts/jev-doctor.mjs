#!/usr/bin/env node

import { inspectSystemOneReadiness } from '../src/system-one-decision-adapter.mjs';
import { compileSemanticProgram } from '../src/noetic-autocompiler.mjs';

function pricingFromEnv(env = process.env) {
  return {
    inputUsdPerMillion: Number(env.TYPESAFE_INPUT_USD_PER_MILLION),
    outputUsdPerMillion: Number(env.TYPESAFE_OUTPUT_USD_PER_MILLION),
    sourceRef: String(env.TYPESAFE_PRICING_SOURCE || ''),
    verifiedAt: String(env.TYPESAFE_PRICING_VERIFIED_AT || '')
  };
}

const readiness = inspectSystemOneReadiness({
  apiKey: process.env.TYPESAFE_API_KEY || '',
  enabled: process.env.TYPESAFE_JEV_ENABLED === 'true',
  pricing: pricingFromEnv(),
  baseUrl: process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai',
  model: process.env.TYPESAFE_DEFAULT_MODEL || 'jev-latest'
});

const canary = compileSemanticProgram({
  programId: 'uberbond.system-one.canary.v1',
  purpose: 'Default-off semantic canary proving Jev question compilation without a provider call.',
  instructions: [
    { id: 'needsFrontier', op: 'NOUL', question: 'Does this state require deeper generative reasoning?', escalateBelow: 0.8 },
    { id: 'route', op: 'CHOICE', question: 'Which mechanism is the minimum sufficient next step?', criteria: { code: 'Deterministic software is sufficient.', systemOne: 'A typed semantic judgement is sufficient.', frontier: 'Deep generative reasoning is required.' }, escalateBelow: 0.75 }
  ]
});

const ownerActions = [];
if (!readiness.credentialPresent) ownerActions.push({ id: 'ADD_TYPESAFE_KEY', action: 'Create a TypeSafe API key and set TYPESAFE_API_KEY in the protected runtime. Never paste the key into chat or Git.', costUsd: 0 });
if (!readiness.pricingEvidencePresent) ownerActions.push({ id: 'RECORD_TYPESAFE_PRICING', action: 'Set TYPESAFE_INPUT_USD_PER_MILLION, TYPESAFE_OUTPUT_USD_PER_MILLION, TYPESAFE_PRICING_SOURCE and TYPESAFE_PRICING_VERIFIED_AT from a current official TypeSafe source.', costUsd: 0 });
if (!readiness.enabled) ownerActions.push({ id: 'ENABLE_JEV_SHADOW', action: 'After the key and pricing evidence exist, set TYPESAFE_JEV_ENABLED=true to permit explicitly authorized shadow calls.', costUsd: 0 });

console.log(JSON.stringify({
  schema: 'uberbond.jev-doctor.v1',
  observedAt: new Date().toISOString(),
  status: readiness.ok ? 'JEV_SHADOW_LANE_READY' : 'JEV_SHADOW_LANE_NOT_READY',
  readiness,
  canaryProgramCompiled: canary.ok,
  canaryProgramDigest: canary.program?.programDigest || null,
  liveCallExecuted: false,
  ownerActionQueue: ownerActions.slice(0, 3),
  law: 'JEV_IS_A_REPLACEABLE_SEMANTIC_SUPPLIER__CAPABILITY_NEVER_CREATES_AUTHORITY__SHADOW_BEFORE_PROMOTION'
}, null, 2));
