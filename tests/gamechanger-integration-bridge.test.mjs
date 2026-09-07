import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGamechangerIntegrationQueue, normalizeManualGamechangerSeed } from '../src/gamechanger-integration-bridge.mjs';

const seed = {
  id:'capability-discovery-runtime',
  title:'Retrieve tools instead of injecting the whole tool catalog',
  mechanism:'Use tool search so only relevant capabilities enter active context.',
  attentionState:'EXPERIMENT_CANDIDATE',
  evidenceState:'CHAT_RESEARCH_REQUIRES_PRIMARY_REBINDING',
  keywords:['tool search','tool discovery','toolbox'],
  smallestExperiment:'Compare top-k tool retrieval against all-tools prompting.'
};
const live = {
  fingerprint:'a'.repeat(64),
  observation:{
    title:'New tool search runtime cuts large tool catalog context',
    summary:'A toolbox discovery layer searches tools before exposing definitions to an agent.',
    claims:['tool search reduces tool context'],
    domains:['AGENT_RUNTIME'],
    evidenceRefs:['https://example.com/toolbox']
  },
  sourceTiers:['PRIMARY_OFFICIAL'],
  corroboratingSourceIds:['official-toolbox'],
  score:88,
  sourceTrust:96,
  attentionState:'EXPERIMENT_CANDIDATE',
  dimensions:{ evidenceQuality:91, novelty:80, enablingPower:92 }
};
const capability = {
  id:'capability:skill:tool-search',
  canonicalIdentity:'cap:skill:tool-search',
  capabilityAtoms:[{id:'capability.discover'}],
  taskClasses:['tool discovery','capability search']
};

test('manual seeds require bounded research attention and experiment', () => {
  const result = normalizeManualGamechangerSeed(seed);
  assert.equal(result.ok, true);
  assert.equal(normalizeManualGamechangerSeed({...seed, attentionState:'ACTIVE'}).ok, false);
  assert.equal(normalizeManualGamechangerSeed({...seed, keywords:[]}).ok, false);
});

test('live primary evidence upgrades a matching seed into an experiment proposal candidate without promotion authority', () => {
  const result = buildGamechangerIntegrationQueue({
    meshReceipt:{ tournament:{ escalations:[live] } },
    manualSeeds:[seed],
    capabilityRecords:[capability]
  });
  assert.equal(result.ok, true);
  assert.equal(result.queue.entries.length, 1);
  const entry = result.queue.entries[0];
  assert.equal(entry.canonicalMechanismId, seed.id);
  assert.equal(entry.engineeringEligible, true);
  assert.equal(entry.queueState, 'BOUNDED_EXPERIMENT_READY_FOR_PROPOSAL');
  assert.equal(entry.promotionAuthority, 'NONE');
  assert.equal(entry.executableAuthority, 'NONE');
  assert.equal(entry.economicProof, 'NONE');
  assert.ok(entry.possibleExistingCapabilityMatches.some(match => match.id === capability.id));
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('unmatched chat research seeds stay blocked on primary evidence rebinding', () => {
  const result = buildGamechangerIntegrationQueue({
    meshReceipt:{ tournament:{ escalations:[] } },
    manualSeeds:[seed],
    capabilityRecords:[]
  });
  assert.equal(result.ok, true);
  const entry = result.queue.entries[0];
  assert.equal(entry.engineeringEligible, false);
  assert.equal(entry.queueState, 'PRIMARY_EVIDENCE_REBINDING_REQUIRED');
  assert.match(entry.requiredNextStep, /REBIND_TO_CURRENT_PRIMARY/);
});

test('unseeded live escalations still enter the durable governed queue', () => {
  const result = buildGamechangerIntegrationQueue({
    meshReceipt:{ tournament:{ escalations:[{...live, fingerprint:'b'.repeat(64), observation:{...live.observation, title:'Another unrelated frontier change', summary:'New runtime behavior unrelated to the seeded capability.', claims:['different mechanism']}}] } },
    manualSeeds:[],
    capabilityRecords:[]
  });
  assert.equal(result.ok, true);
  assert.equal(result.queue.entries.length, 1);
  assert.match(result.queue.entries[0].canonicalMechanismId, /^live-/);
  assert.equal(result.queue.entries[0].promotionAuthority, 'NONE');
});

test('prior queue entries are carried forward instead of evaporating between sweeps', () => {
  const prior = {
    canonicalMechanismId:'old-mechanism',
    title:'Old mechanism',
    mechanism:'Previously researched mechanism',
    attentionState:'RESEARCH',
    queueState:'RESEARCH_REQUIRED',
    engineeringEligible:false,
    promotionAuthority:'NONE'
  };
  const result = buildGamechangerIntegrationQueue({
    meshReceipt:{ tournament:{ escalations:[] } },
    manualSeeds:[],
    capabilityRecords:[],
    priorState:{entries:[prior]}
  });
  assert.equal(result.ok, true);
  assert.equal(result.queue.entries.length, 1);
  assert.equal(result.queue.entries[0].canonicalMechanismId, 'old-mechanism');
  assert.equal(result.queue.entries[0].carriedForward, true);
});
