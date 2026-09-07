import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GAMECHANGER_MECHANISM_PRIMITIVES, executeGamechangerMechanism } from '../src/gamechanger-mechanism-runtime.mjs';

const seedManifest=JSON.parse(fs.readFileSync(new URL('../data/gamechanger-mesh/manual-integration-seeds.json',import.meta.url),'utf8'));
const seedIds=seedManifest.seeds.map(seed=>seed.id).sort();
const primitiveIds=Object.keys(GAMECHANGER_MECHANISM_PRIMITIVES).sort();

const samples={
  'capability-distillation-factory':{documents:[{sourceRef:'repo:a',procedures:[{id:'p1',description:'Verify a bounded task',inputs:['task'],outputs:['receipt']}]}]},
  'authority-event-ledger':{observedAt:'2026-09-06T12:00:00Z',events:[{eventId:'g1',type:'GRANT',subject:'worker:a',capability:'repo:read',effectiveAt:'2026-09-06T10:00:00Z'}]},
  'skill-policy-integrity':{controlChoices:['a','b','a','b'],treatmentChoices:['a','b','a','b'],tolerance:0.1},
  'untrusted-workspace-normalization':{metadata:{hooks:{pre:'x'},fsmonitor:'cmd',filters:{clean:'cmd'},startupConfig:{run:'x'},lifecycleScripts:{postinstall:'x'},ordinary:'keep'}},
  'external-state-channel-firewall':{operation:{method:'GET',semanticEffects:['READ']},allowedEffects:['READ']},
  'non-decaying-loop-safety-state':{state:{latchedFindings:[]},evidence:[{code:'fragmented-injection',severity:8,evidenceRef:'test:1'}]},
  'lossless-trajectory-archive':{archive:[],turn:{id:'t1',summary:'Tried provider A then recovered',failedApproaches:['provider A'],rawRef:'artifact:turn-1'},query:'provider A'},
  'capability-discovery-runtime':{catalog:[{id:'tool-search',name:'Tool Search',description:'search capability catalog',tags:['discovery']}],query:'search tools',topK:3},
  'capability-gateway':{catalog:[{id:'read',requiredScopes:['repo:read']},{id:'write',requiredScopes:['repo:write']}],identity:{id:'worker',scopes:['repo:read']}},
  'just-in-time-credential-broker':{identity:{id:'worker'},resource:'repo:a',scopes:['repo:read'],issuedAt:'2026-09-06T12:00:00Z',ttlSeconds:60,authorityReceipt:{ok:true,scopes:['repo:read']}},
  'staged-oidc-release-gate':{artifact:{digest:'abc'},buildIdentity:{verified:true,actorId:'builder'},scan:{passed:true,artifactDigest:'abc'},promotionApproval:{approved:true,actorId:'reviewer'}},
  'browser-capability-router':{task:{requiredCapabilities:['js'],minFidelity:2},environments:[{id:'fetch',capabilities:[],fidelity:0,costUnits:1},{id:'light',capabilities:['js'],fidelity:2,costUnits:2},{id:'chromium',capabilities:['js'],fidelity:5,costUnits:8}]},
  'active-media-perception':{segments:[{id:'s1',relevance:0.9,uncertainty:0.8},{id:'s2',relevance:0.2,uncertainty:0.1}],maxSegments:1},
  'speculative-agent-execution':{prediction:{action:'read:file:a'},actualDecision:{action:'read:file:a'},snapshotIsDisposable:true,semanticEffects:['READ']},
  'purpose-declared-web-access':{purpose:'SEARCH',sources:[{id:'s1',allowedPurposes:['SEARCH'],quality:90},{id:'s2',allowedPurposes:['TRAINING'],quality:100}]},
  'verified-continual-development-loop':{state:{phase:'PLAN',knownGood:[]},observation:{}},
  'external-commitment-state':{observedAt:'2026-09-06T12:00:00Z',agreements:[{id:'a1',commitments:[{type:'OBLIGATION',code:'deliver',description:'Deliver evidence',effectiveAt:'2026-09-01T00:00:00Z',deadline:'2026-09-10T00:00:00Z'}]}]},
  'regulatory-incident-clock':{eventAt:'2026-09-06T12:00:00Z',rules:[{jurisdiction:'X',obligation:'initial notice',hours:24},{jurisdiction:'X',obligation:'full notice',hours:72}]},
  'portable-purchase-intent-state':{intent:{allowedMerchants:['m1'],allowedCategories:['software'],perActionLimitCents:500,cumulativeLimitCents:1000,expiresAt:'2026-09-07T12:00:00Z'},transaction:{merchant:'m1',category:'software',amountCents:200},priorSpendCents:100,observedAt:'2026-09-06T12:00:00Z'},
  'verifiable-outcome-billing':{outcomes:[{id:'o1',status:'ACCEPTED',acceptanceEvidenceVerified:true},{id:'o2',status:'ATTEMPTED',acceptanceEvidenceVerified:false}],unitPriceCents:1000},
  'exhaustive-reconciliation-engine':{expected:['a','b','c'],observed:['a','b','c']},
  'domain-agent-contract':{coreContract:{requiredMethods:['quote','accept'],requiredFields:['customerId']},adapter:{methods:['quote','accept','extra'],fields:['customerId','verticalField']}},
  'customer-owned-safety-state':{ledger:[],event:{id:'e1',at:'2026-09-06T12:00:00Z',risk:'LOW',secretDetail:'private'},providerProjectionFields:['id','risk']},
  'model-capability-risk-class':{riskClass:'CRITICAL',baseEnvelope:{network:true,externalWrite:true,maxToolCount:100,independentReview:false}},
  'escalation-economics-policy':{cheapAttemptCostCents:10,cheapSuccessProbability:0.2,expectedCheapRetries:3,repairMinutes:20,founderMinuteValueCents:5,frontierCostCents:80,frontierSuccessProbability:0.9}
};

test('the runtime registry covers every seeded mechanism exactly once',()=>{
  assert.equal(seedIds.length,25);
  assert.deepEqual(primitiveIds,seedIds);
});

test('every seeded mechanism has a callable zero-external-effect deterministic primitive',()=>{
  for(const id of seedIds){
    assert.ok(samples[id],`missing sample for ${id}`);
    const result=executeGamechangerMechanism(id,samples[id]);
    assert.equal(result.ok,true,`${id} should execute`);
    assert.equal(result.mechanismId,id);
    assert.equal(result.implementationClass,'DETERMINISTIC_INTERNAL_PRIMITIVE');
    assert.equal(result.businessEffectAuthority,'NONE');
    assert.equal(result.promotionAuthority,'NONE');
    assert.equal(result.executableExternalAuthority,'NONE');
    assert.ok(Object.values(result.externalEffectLedger).every(value=>value===0),`${id} must have zero external effects`);
  }
});

test('representative primitives enforce the intended mechanism rather than returning placeholders',()=>{
  assert.equal(executeGamechangerMechanism('authority-event-ledger',samples['authority-event-ledger']).result.grants[0].authorized,true);
  assert.equal(executeGamechangerMechanism('capability-gateway',samples['capability-gateway']).result.visibleCapabilities.length,1);
  assert.equal(executeGamechangerMechanism('browser-capability-router',samples['browser-capability-router']).result.selected.id,'light');
  assert.equal(executeGamechangerMechanism('portable-purchase-intent-state',samples['portable-purchase-intent-state']).result.authorized,true);
  assert.equal(executeGamechangerMechanism('verifiable-outcome-billing',samples['verifiable-outcome-billing']).result.billableOutcomeCount,1);
  assert.equal(executeGamechangerMechanism('exhaustive-reconciliation-engine',samples['exhaustive-reconciliation-engine']).result.exhaustiveProof,true);
  assert.equal(executeGamechangerMechanism('model-capability-risk-class',samples['model-capability-risk-class']).result.envelope.network,false);
});
