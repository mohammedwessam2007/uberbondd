import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileCognitionEconomicPerimeter } from '../src/cognition-economic-perimeter.mjs';
import { cognitionRouteInventory } from '../src/cognition-route-inventory.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const reasons=[];
const perimeter=compileCognitionEconomicPerimeter({runtimeKeyLimitUsd:20,typingMindKeyLimitUsd:0,memberGuardrailUsd:28,guardrailScope:'MEMBER_ALL_KEYS',purchaseFeeRate:.055,otherPaidKeyLimitsUsd:[],limitReset:'monthly',includeByokInLimits:true,legacySpendRoutesBlocked:true});
if(!perimeter.ok)reasons.push(...perimeter.reasons.map(x=>`perimeter:${x}`));
const runtimeSource=read('src/infinite-opus-native-runtime.mjs');
if(!runtimeSource.includes('20_000_000'))reasons.push('native-runtime-default-must-be-20-dollar-envelope');
if(perimeter.plan?.typingMindKeyLimitUsd!==0)reasons.push('canonical-typingmind-cockpit-must-not-have-direct-provider-spend-key');
const routes=cognitionRouteInventory();
if(!routes.globalBudgetClaimAllowed)reasons.push('route-inventory-not-closed');
const canary=json('config/infinite-opus-canary-authorization.template.json');
if(canary.ownerApproved!==false||canary.maximumSpendUsd>0.05||canary.externalEffects?.length)reasons.push('canary-template-must-be-unapproved-bounded-and-zero-effect');
const market=json('config/infinite-opus-live-market-candidates.json');
if(Object.keys(market.promotedRoles??{}).length)reasons.push('prelive-market-must-have-no-promoted-crowns');
const understanding=json('config/infinite-opus-model-understanding.json');
if(understanding.schemaVersion!=='uberbond.infinite-opus.model-understanding.v1'||!Array.isArray(understanding.profiles)||understanding.profiles.length<5||understanding.profiles.some(p=>p.authorityFromUnderstandingAlone!=='NONE'))reasons.push('model-understanding-registry-missing-or-authority-inflated');
if(!understanding.profiles.some(p=>p.model==='openai/gpt-6.1-sol-pro'&&p.avoidAsDefaultFor?.includes('routine-coding')))reasons.push('sol-pro-escalation-only-prior-missing');
const server=read('server.mjs');
if(!server.includes('/api/typingmind/infinite-opus/v1/')||!server.includes('UBERMIND_TYPINGMIND_GATEWAY_TOKEN'))reasons.push('typingmind-ubermind-gateway-route-missing');
const typingMindBoundary=server.indexOf('function typingMindCors(req)');
if(typingMindBoundary<0||server.slice(0,typingMindBoundary).includes('sendTypingMindJson(')||server.slice(0,typingMindBoundary).includes('sendTypingMindStream('))reasons.push('typingmind-response-helper-leaked-outside-cockpit-boundary');
if(!server.includes('CROWN_PROVIDER_OR_ROUTE_DRIFT_REFUSED')&&!read('src/infinite-opus-typingmind-live.mjs').includes('CROWN_PROVIDER_OR_ROUTE_DRIFT_REFUSED'))reasons.push('typingmind-crown-provider-drift-gate-missing');
const envExample=read('.env.example');
for(const name of ['UBERMIND_TYPINGMIND_GATEWAY_TOKEN','INFINITE_OPUS_PAID_AUTHORIZATION_JSON','INFINITE_OPUS_CROWN_ADMISSION_JSON'])
 if(!envExample.includes(name+'='))reasons.push('typingmind-gateway-env-contract-missing:'+name);
const firstWorkload=json('config/infinite-opus-first-real-workload.json');
if(firstWorkload.taskClass!=='PROVIDER_SCREENING'||firstWorkload.sideEffectClass!=='NONE'||firstWorkload.qualityContract?.regressionTolerance!==0)reasons.push('first-real-workload-contract-missing-or-weakened');
if(!read('src/infinite-opus-task-compilers.mjs').includes("case 'PROVIDER_SCREENING'"))reasons.push('provider-screening-typed-compiler-missing');
const liveGateway=read('src/infinite-opus-typingmind-live.mjs');
if(!liveGateway.includes("cheapestPossibleWriterLowerBound")||!liveGateway.includes("chooseAdaptiveCandidateWriter")||!liveGateway.includes("DIRECT_OPUS"))reasons.push('adaptive-live-cost-geometry-router-missing');
if(!liveGateway.includes("TYPINGMIND_MIMO_MODEL")||!liveGateway.includes("TYPINGMIND_DEEPSEEK_MODEL")||!liveGateway.includes("writerModelById"))reasons.push('adaptive-cheap-writer-fabric-missing');
if(!liveGateway.includes("jevWorkerEffort")||!liveGateway.includes("usedToSuppressCrown:false")||!liveGateway.includes("usedToSelectWriter"))reasons.push('jev-adaptive-control-or-crown-boundary-missing');
const gatewayKernel=read('src/infinite-opus-typingmind-gateway.mjs');
if(!gatewayKernel.includes("CROWN_REVIEW_RESPONSE_FORMAT")||!gatewayKernel.includes("CROWN_VERIFIED_EXACT_PATCH"))reasons.push('crown-delta-patch-protocol-missing');
const hostile=json('config/infinite-opus-hostile-test-matrix.json');
if(hostile.requiredCount!==27||hostile.cases?.length!==27)reasons.push('hostile-test-matrix-must-bind-all-27-cases');
for(const p of ['docker-compose.yml','docker-compose.sovereign.yml','render.yaml']){
 if(!read(p).includes('INFINITE_OPUS_CASH_ROUTE_MODE')||!read(p).includes('OPENROUTER_ONLY'))reasons.push(`missing-openrouter-only-host-default:${p}`);
}
for(const p of ['config/infinite-opus-canary-authorization.template.json','config/infinite-opus-live-market-candidates.json','docs/INFINITE_OPUS_TERMINAL_ACTIVATION_HANDOFF_2026-09-30.md']){
 const s=read(p);if(/sk-or-v1-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}/.test(s))reasons.push(`secret-like-material:${p}`);
}
// The live launcher must not accept a static path/string inventory as a test gate.
// These deterministic suites make no provider calls and receive no host credentials.
const testPaths = ['tests/provable-reference-economics.test.mjs', 'tests/provable-execution-ledger.test.mjs',
 'tests/infinite-opus-live-closure.test.mjs', 'tests/infinite-opus-compilers.test.mjs', 'tests/infinite-opus-model-understanding.test.mjs',
 'tests/infinite-opus-typingmind-gateway.test.mjs', 'tests/infinite-opus-typingmind-live.test.mjs',
 'tests/openrouter-jev-governed-adapter.test.mjs', 'tests/openrouter-processor-auction-v5.test.mjs',
 'tests/openrouter-full-stack-no-amputation.test.mjs', 'tests/server-typingmind-boundary.test.mjs', 'tests/infinite-opus-astra-activation-chain.test.mjs',
 'tests/crown-owner-resume-authority.test.mjs', 'tests/crown-durable-admission.test.mjs', 'tests/infinite-opus-owner-resume-server-boundary.test.mjs', 'tests/unified-cognition-ledger-bridge.test.mjs', 'tests/infinite-opus-semantic-closure-host.test.mjs', 'tests/native-runtime-decision-franchise.test.mjs', 'tests/open-router-canon-doctor.test.mjs'];
const testRun = spawnSync(process.execPath, ['--test', ...testPaths], {
 cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 2_000_000,
 env: { PATH: process.env.PATH, TZ: 'UTC' }
});
if (testRun.status !== 0 || testRun.error) reasons.push('deterministic-activation-suites-failed');
// Print only a bounded test summary, not captured worker output or environment data.
const deterministicGate = { ok: testRun.status === 0 && !testRun.error, exitCode: testRun.status,
 testPaths, summary: (testRun.stdout ?? '').split('\n').filter(line => /^ℹ (tests|pass|fail|skipped) /.test(line)) };
const receipt={schemaVersion:'uberbond.infinite-opus.preowner-doctor.v1',observedAt:new Date().toISOString(),ok:reasons.length===0,status:reasons.length?'INFINITE_OPUS_PREOWNER_REFUSED':'INFINITE_OPUS_PREOWNER_SOURCE_READY',reasons,providerCalls:0,spendUsd:0,perimeter:perimeter.plan,routeCount:routes.routes.length,firstRealWorkload:firstWorkload.taskClass,hostileCases:hostile.cases.length,truthBoundary:'This doctor proves only static/source pre-owner readiness. It cannot establish private credentials, provider callability, actual bills, live task-class crowns, production deployment, endurance or savings.'};
receipt.deterministicGate = deterministicGate;
receipt.truthBoundary = 'This doctor checks bounded source readiness and executes the listed deterministic suites. It cannot establish private credentials, provider callability, actual bills, live task-class crowns, production deployment, endurance or savings.';
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');if(!receipt.ok)process.exitCode=2;
