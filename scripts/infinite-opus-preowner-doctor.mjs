import fs from 'node:fs';
import path from 'node:path';
import { compileCognitionEconomicPerimeter } from '../src/cognition-economic-perimeter.mjs';
import { cognitionRouteInventory } from '../src/cognition-route-inventory.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const reasons=[];
const perimeter=compileCognitionEconomicPerimeter({runtimeKeyLimitUsd:20,typingMindKeyLimitUsd:8,memberGuardrailUsd:28,guardrailScope:'MEMBER_ALL_KEYS',purchaseFeeRate:.055,otherPaidKeyLimitsUsd:[],limitReset:'monthly',includeByokInLimits:true,legacySpendRoutesBlocked:true});
if(!perimeter.ok)reasons.push(...perimeter.reasons.map(x=>`perimeter:${x}`));
const runtimeSource=read('src/infinite-opus-native-runtime.mjs');
if(!runtimeSource.includes('20_000_000'))reasons.push('native-runtime-default-must-be-20-dollar-envelope');
const routes=cognitionRouteInventory();
if(!routes.globalBudgetClaimAllowed)reasons.push('route-inventory-not-closed');
const canary=json('config/infinite-opus-canary-authorization.template.json');
if(canary.ownerApproved!==false||canary.maximumSpendUsd>0.05||canary.externalEffects?.length)reasons.push('canary-template-must-be-unapproved-bounded-and-zero-effect');
const market=json('config/infinite-opus-live-market-candidates.json');
if(Object.keys(market.promotedRoles??{}).length)reasons.push('prelive-market-must-have-no-promoted-crowns');
const firstWorkload=json('config/infinite-opus-first-real-workload.json');
if(firstWorkload.taskClass!=='PROVIDER_SCREENING'||firstWorkload.sideEffectClass!=='NONE'||firstWorkload.qualityContract?.regressionTolerance!==0)reasons.push('first-real-workload-contract-missing-or-weakened');
if(!read('src/infinite-opus-task-compilers.mjs').includes("case 'PROVIDER_SCREENING'"))reasons.push('provider-screening-typed-compiler-missing');
const hostile=json('config/infinite-opus-hostile-test-matrix.json');
if(hostile.requiredCount!==27||hostile.cases?.length!==27)reasons.push('hostile-test-matrix-must-bind-all-27-cases');
for(const p of ['docker-compose.yml','docker-compose.sovereign.yml','render.yaml']){
 if(!read(p).includes('INFINITE_OPUS_CASH_ROUTE_MODE')||!read(p).includes('OPENROUTER_ONLY'))reasons.push(`missing-openrouter-only-host-default:${p}`);
}
for(const p of ['config/infinite-opus-canary-authorization.template.json','config/infinite-opus-live-market-candidates.json','docs/INFINITE_OPUS_TERMINAL_ACTIVATION_HANDOFF_2026-09-30.md']){
 const s=read(p);if(/sk-or-v1-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}/.test(s))reasons.push(`secret-like-material:${p}`);
}
const receipt={schemaVersion:'uberbond.infinite-opus.preowner-doctor.v1',observedAt:new Date().toISOString(),ok:reasons.length===0,status:reasons.length?'INFINITE_OPUS_PREOWNER_REFUSED':'INFINITE_OPUS_PREOWNER_SOURCE_READY',reasons,providerCalls:0,spendUsd:0,perimeter:perimeter.plan,routeCount:routes.routes.length,firstRealWorkload:firstWorkload.taskClass,hostileCases:hostile.cases.length,truthBoundary:'This doctor proves only static/source pre-owner readiness. It cannot establish private credentials, provider callability, actual bills, live task-class crowns, production deployment, endurance or savings.'};
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');if(!receipt.ok)process.exitCode=2;
