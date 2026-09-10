import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';
import { compileNativeWorkerModelPrompt, compileNativeWorkerProposal } from '../src/sovereign-native-local-worker.mjs';

const BASE='a'.repeat(40);
const BEFORE='export const value = 1;\n';
function task(overrides={}){return{taskId:'uberbond_native_worker_test',objective:'Repair one bounded source defect.',consequenceClass:'LOCAL_PREPARATION',acceptanceTests:['npm run check:syntax','npm run test:deterministic'],constraints:[`exact-base-revision:${BASE}`],...overrides};}
function proposal(overrides={}){return{decision:'CHANGE',summary:'Repair the bounded module without widening authority.',changes:[{operation:'UPDATE',path:'src/example.mjs',content:'export const value = 2;\n',rationale:'Fix the bounded local behavior.'}],...overrides};}

test('model prompt is bounded candidate-only authority',()=>{const out=compileNativeWorkerModelPrompt({task:task(),baseRevision:BASE,context:[{path:'src/example.mjs',content:BEFORE}]});assert.equal(out.ok,true);assert.match(out.system,/never merge, sign, deploy/i);assert.equal(out.businessEffectAuthority,'NONE');assert.equal(out.externalEffectAuthority,'NONE');});

test('trusted worker derives before hash and task-owned verification outside model',()=>{const out=compileNativeWorkerProposal({task:task(),baseRevision:BASE,proposal:{...proposal(),verification:['echo fake-pass']},sourceSnapshot:{'src/example.mjs':{exists:true,content:BEFORE}}});assert.equal(out.ok,true);assert.equal(out.codeChangeSet.changes[0].beforeSha256,contentSha256(BEFORE));assert.deepEqual(out.codeChangeSet.verification,['npm run check:syntax','npm run test:deterministic']);assert.equal(JSON.stringify(out).includes('echo fake-pass'),false);});

test('canonical code-change constitution still refuses protected paths',()=>{const out=compileNativeWorkerProposal({task:task(),baseRevision:BASE,proposal:proposal({changes:[{operation:'UPDATE',path:'package.json',content:'{}\n',rationale:'Try to rewrite the build graph.'}]}),sourceSnapshot:{'package.json':{exists:true,content:'{}\n'}}});assert.equal(out.ok,false);assert.ok(out.reasonCodes.some(code=>code.includes('protected-path')));});

test('model STOP is evidence rather than a fabricated patch',()=>{const out=compileNativeWorkerProposal({task:task(),baseRevision:BASE,proposal:{decision:'STOP',summary:'No safe patch.',reasonCodes:['owner-gated-control-surface']},sourceSnapshot:{}});assert.equal(out.ok,false);assert.equal(out.status,'SOVEREIGN_NATIVE_LOCAL_WORKER_STOP');assert.ok(out.reasonCodes.includes('owner-gated-control-surface'));});

test('worker has no IP network and reaches model only through Unix socket',()=>{const service=readFileSync(new URL('../ops/sovereign/uberbond-local-worker.service',import.meta.url),'utf8');assert.match(service,/^PrivateNetwork=true$/m);assert.match(service,/^RestrictAddressFamilies=AF_UNIX$/m);assert.match(service,/\/run\/uberbond-model/);assert.match(service,/^SupplementaryGroups=uberbond-model$/m);});

test('model proxy can reach host loopback but not public IP network and verifies model identity',()=>{const service=readFileSync(new URL('../ops/sovereign/uberbond-local-model-proxy.service',import.meta.url),'utf8');const source=readFileSync(new URL('../scripts/sovereign-local-model-proxy.mjs',import.meta.url),'utf8');assert.match(service,/^IPAddressDeny=any$/m);assert.match(service,/^IPAddressAllow=localhost$/m);assert.match(service,/^RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX$/m);assert.match(source,/model-proxy-endpoint-must-be-host-loopback-http/);assert.match(source,/MODEL_PROXY_IDENTITY_MISMATCH/);assert.doesNotMatch(source,/https:\/\/(api\.|www\.|github|vercel|openai|anthropic)/i);});

test('installer owns the native worker but keeps it disabled until a real local model is configured',()=>{const installer=readFileSync(new URL('../ops/sovereign/install-authoring-node.sh',import.meta.url),'utf8');assert.match(installer,/UBERBOND_LOCAL_WORKER_EXECUTABLE=\/opt\/uberbond\/control\/uberbond-native-local-worker/);assert.match(installer,/UBERBOND_ISOLATED_WORKER_ENABLED=false/);assert.match(installer,/configure-local-model\.sh/);assert.match(installer,/uberbond-model-proxy/);assert.match(installer,/release signing authority must not live/i);});

test('local model configuration only accepts owner-host loopback and explicitly enables the worker',()=>{const cfg=readFileSync(new URL('../ops/sovereign/configure-local-model.sh',import.meta.url),'utf8');assert.equal(cfg.includes('127\\.0\\.0\\.1|localhost|\\[::1\\]'),true);assert.match(cfg,/UBERBOND_ISOLATED_WORKER_ENABLED=true/);assert.match(cfg,/UBERBOND_FOUNDER_DIALOGUE_ENABLED=true/);assert.match(cfg,/OPEN_MODEL_AGENT_ENABLED=true/);assert.match(cfg,/usermod -a -G uberbond-model uberbond-author/);});

test('generic isolated runner preserves bounded worker failure reasons for strategy mutation',()=>{const runner=readFileSync(new URL('../scripts/sovereign-local-worker-runner.mjs',import.meta.url),'utf8');assert.match(runner,/boundedWorkerFailureObserved/);assert.match(runner,/boundedFailure\?\.reasonCodes/);assert.match(runner,/workerExitCode/);});
