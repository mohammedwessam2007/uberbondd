#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileComposedEffectAuthorityAudit } from '../src/composed-effect-authority-audit.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
function walk(dir){const out=[];const rec=rel=>{let entries=[];try{entries=readdirSync(join(root,rel),{withFileTypes:true});}catch{return;}for(const entry of entries){const path=`${rel}/${entry.name}`;if(entry.isDirectory())rec(path);else if(entry.name.endsWith('.mjs'))out.push(path);}};rec(dir);return out;}
const implementationFiles=[...walk('src'),...walk('scripts'),...walk('api')];
const sourceBodies=Object.fromEntries(implementationFiles.map(path=>[path,read(path)]));

// A provider adapter is a library, not an authority source. In production
// source, only the canonical dispatcher may invoke its mutating dispatch path.
// Tests deliberately call adapters directly to exercise their provider
// semantics and are outside this source-only production caller scan.
const providerImports=[];
for(const [path,body] of Object.entries(sourceBodies)){
  if(path==='src/omnia-v9/integrations/external-effect-dispatcher.mjs')continue;
  if(/from\s+['"][^'"]*(?:gmail|postal)-effect-adapter\.mjs['"]/.test(body)||/import\s*\(\s*['"][^'"]*(?:gmail|postal)-effect-adapter\.mjs['"]\s*\)/.test(body))providerImports.push(path);
}

const declarations=[
  {
    compositionId:'PLANNER_SCHEDULER',mode:'NON_SINK_WITH_DOWNSTREAM_GATE',
    entrypointRefs:['src/frontier-worker-compiler.mjs'],terminalSinkRefs:['src/omnia-v9/integrations/external-effect-dispatcher.mjs','src/relay-vercel-api-executor.mjs'],
    authorityLaw:'Planning, scheduling and worker compilation create no business authority. External effects must terminate in a separately authoritative sink.',
    sourceMarkers:[{path:'src/frontier-worker-compiler.mjs',mustContain:["businessEffectAuthority: 'NONE'","externalEffectAuthority: 'NONE'","MESSAGE_PREPARATION"],mustNotContain:['MESSAGE_SEND','PRODUCTION_DEPLOY','MONEY_MOVEMENT']}]
  },
  {
    compositionId:'BROWSER_RESEARCH',mode:'READ_ONLY_SURFACE',externalMutationAuthority:'NONE',
    entrypointRefs:['src/browser-crawler.mjs'],terminalSinkRefs:[],
    readOnlyInvariant:'The crawler may navigate, read, screenshot and issue bounded HEAD checks. It may not click, type, fill, submit forms or mutate remote state.',
    authorityLaw:'Read-only public-web research is not browser-write authority.',
    sourceMarkers:[{path:'src/browser-crawler.mjs',mustContain:['assertPublicUrl','isAllowed(item.url,robots)','page.goto','page.screenshot'],mustNotContain:['.click(','.fill(','.type(','.press(','request.submit(','form.submit(']}]
  },
  {
    compositionId:'CREDENTIALED_PROVIDER',mode:'EXTERNAL_AUTHORITY_BOUNDARY',externalMutationAuthority:'NONE',
    entrypointRefs:['src/provider-activation-receipt.mjs'],terminalSinkRefs:['src/omnia-v9/integrations/external-effect-dispatcher.mjs'],nextAuthorityGate:'CANONICAL_CONSEQUENCE_ADMISSION_AND_TERMINAL_PROVIDER_DISPATCH',
    authorityLaw:'Credential presence is state evidence only. It does not imply provider-call, messaging, spend or account-mutation authority.',
    sourceMarkers:[{path:'src/provider-activation-receipt.mjs',mustContain:['carries STATES, never VALUES','not send permission',"businessEffectAuthority: 'NONE'","CONFIGURED_SECURELY"]}]
  },
  {
    compositionId:'MESSENGER',mode:'DIRECT_EFFECT_SINK',failClosed:true,uncertaintyDoesNotAuthorizeRetry:true,
    entrypointRefs:['src/omnia-v9/integrations/external-effect-dispatcher.mjs'],terminalSinkRefs:['src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs','src/omnia-v9/integrations/providers/postal-effect-adapter.mjs'],
    authorityBindingFields:['executionId','businessKey','actionIntentDigest','authorizationDigest','providerEffectIdentity','approvalId','policyDigest','constitutionDigest','argumentsDigest'],
    authorityLaw:'A real messaging provider may be called only after authoritative final admission over the exact durable effect identity and prepared arguments. Uncertainty never permits automatic resend.',
    sourceMarkers:[
      {path:'src/omnia-v9/integrations/external-effect-dispatcher.mjs',mustContain:['finalAdmissionCheck','final-admission:not-authoritative-and-enforced',"toStatus: 'DISPATCHING'",'authorizationDigest','policyDigest','constitutionDigest','RESULT_UNCERTAIN','adapter.dispatch(preparedEffect)']},
      {path:'src/omnia-v9/integrations/external-effect-recovery.mjs',mustContain:['calls adapter.dispatch() -- the only network-mutating call this module','WITHOUT ever calling adapter.dispatch() again']}
    ],
    productionProviderImportViolations:providerImports
  },
  {
    compositionId:'PAYMENT_RAIL',mode:'DIRECT_EFFECT_SINK',failClosed:true,uncertaintyDoesNotAuthorizeRetry:true,
    entrypointRefs:['api/payments/paypal-order.mjs','api/payments/paypal-capture.mjs'],terminalSinkRefs:['src/paypal-payment-truth-core.mjs'],
    authorityBindingFields:['ADMIN_TOKEN_OR_PROVIDER_RETURN_IDENTITY','intentId','providerOrderId','bindingDigest','customId','invoiceId','createRequestId','captureRequestId'],
    authorityLaw:'Payment creation is admin-authenticated; capture is bound to the prepared intent and provider order identity; provider uncertainty cannot create cleared-payment truth.',
    sourceMarkers:[
      {path:'api/payments/paypal-order.mjs',mustContain:['safeBearer','ADMIN_TOKEN','unauthorized','lead-id-required']},
      {path:'api/payments/paypal-capture.mjs',mustContain:['intentId','providerOrderId','capturePayPalFirstCashOrder','Do not pay again','No cleared payment was inferred']},
      {path:'src/paypal-payment-truth-core.mjs',mustContain:['bindingDigest','createRequestId','captureRequestId','PROVIDER_EFFECT_UNCERTAIN','paypal-request-id','businessEffectAuthority']}
    ]
  },
  {
    compositionId:'DEPLOYMENT_CONTROLLER',mode:'DIRECT_EFFECT_SINK',failClosed:true,uncertaintyDoesNotAuthorizeRetry:true,
    entrypointRefs:['src/relay-vercel-api-executor.mjs'],terminalSinkRefs:['https://api.vercel.com/v13/deployments'],
    authorityBindingFields:['EXPECTED_RELAY_TEAM_ID','EXPECTED_RELAY_PROJECT_ID','EXPECTED_RELAY_PROJECT_NAME','EXPECTED_RELAY_BUNDLE_DIGEST','authorizedAttempts=1','environment=preview'],
    authorityLaw:'Deployment transport is one-shot, exact-bundle, exact-project preview only; production target and automatic second attempt are forbidden.',
    sourceMarkers:[{path:'src/relay-vercel-api-executor.mjs',mustContain:["authorizedAttempts === 1","secondAttemptAuthorized === false","!Object.hasOwn(body, 'target')","productionPromotion: false",'EXPECTED_RELAY_BUNDLE_DIGEST'],mustNotContain:["target: 'production'",'authorizedAttempts: 2']}]
  },
  {
    compositionId:'PRIVATE_LIFE_GENERIC_AGENT',mode:'EXTERNAL_AUTHORITY_BOUNDARY',externalMutationAuthority:'NONE',
    entrypointRefs:['src/personal-civilization-core.mjs','src/frontier-worker-compiler.mjs'],terminalSinkRefs:[],nextAuthorityGate:'PRESENT_SOVEREIGN_EXPLICIT_CHOICE_AND_SEPARATE_EFFECT_AUTHORITY',
    authorityLaw:'Private-life state and generic worker capability do not create action authority or public-repository publication rights.',
    sourceMarkers:[
      {path:'src/personal-civilization-core.mjs',mustContain:['PRIVATE','businessEffectAuthority']},
      {path:'src/frontier-worker-compiler.mjs',mustContain:["externalEffectAuthority: 'NONE'",'authoritySource: \'NONE\'']}
    ]
  },
  {
    compositionId:'WORLD_RESOURCE_EXECUTOR',mode:'EXTERNAL_AUTHORITY_BOUNDARY',externalMutationAuthority:'NONE',
    entrypointRefs:['src/operational-world-resource-admission.mjs'],terminalSinkRefs:[],nextAuthorityGate:'SEPARATE_INTENT_AND_EFFECT_AUTHORITY_GATE',
    authorityLaw:'Discovery, availability, consent and procurement eligibility may admit a resource but never execute or procure it.',
    sourceMarkers:[{path:'src/operational-world-resource-admission.mjs',mustContain:["executionAuthority: 'NONE'","businessEffectAuthority: 'NONE'",'A_SEPARATE_INTENT_AND_EFFECT_AUTHORITY_GATE_IS_ALWAYS_REQUIRED','procurement-authority-insufficient']}]
  },
  {
    compositionId:'RECOVERY_CREDENTIAL_MANAGER',mode:'EXTERNAL_AUTHORITY_BOUNDARY',externalMutationAuthority:'NONE',
    entrypointRefs:['src/sovereign-root-recovery.mjs'],terminalSinkRefs:[],nextAuthorityGate:'SEPARATE_CREDENTIAL_ROTATION_AND_ACCOUNT_RECOVERY_AUTHORITY',
    authorityLaw:'Identity recovery restores eligibility only. It cannot itself rotate credentials, log into providers, decrypt private state or appoint a successor.',
    sourceMarkers:[{path:'src/sovereign-root-recovery.mjs',mustContain:['SEPARATE_CREDENTIAL_ROTATION_AND_ACCOUNT_RECOVERY_AUTHORITY',"privateStateAccess: 'NONE'","successorAuthority: 'NONE'",'does not rotate credentials']}]
  }
];

let audit=compileComposedEffectAuthorityAudit({declarations,sourceBodies});
if(providerImports.length){
  audit={...audit,ok:false,status:'COMPOSED_EFFECT_AUTHORITY_AUDIT_REFUSED',reasonCodes:[...new Set([...(audit.reasonCodes||[]),'provider-adapter-imported-outside-authoritative-dispatcher'])],providerImportViolations:providerImports};
}
const output={...audit,generatedAt:new Date().toISOString(),generator:'scripts/composed-effect-authority-audit.mjs',providerImportViolations:providerImports,declarations};
mkdirSync(join(root,'artifacts/sovereign'),{recursive:true});writeFileSync(join(root,'artifacts/sovereign/composed-effect-authority-audit.json'),`${JSON.stringify(output,null,2)}\n`,'utf8');
console.log(JSON.stringify({ok:audit.ok,status:audit.status,counts:audit.counts,providerImportViolations:providerImports,output:'artifacts/sovereign/composed-effect-authority-audit.json'},null,2));
if(!audit.ok)process.exitCode=2;
