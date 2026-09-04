import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDoctor } from '../scripts/avengers-arsenal-doctor.mjs';
import { runPlanner } from '../scripts/avengers-arsenal-plan.mjs';
import { runTick } from '../scripts/avengers-arsenal-tick.mjs';
import { AVENGERS_REGISTRY_SCHEMA } from '../src/avengers-arsenal.mjs';

const NOW = new Date('2026-09-04T01:45:00Z');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(payload); }
  };
}

function profile() {
  return {
    id: 'local-builder',
    runtime: 'OLLAMA',
    model: 'local-builder',
    endpoint: 'http://127.0.0.1:11434',
    apiStyle: 'CHAT_COMPLETIONS',
    revision: 'sha256:local-builder-revision',
    taskClasses: ['coding', 'general'],
    roles: ['builder', 'general'],
    pricing: {
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
      infrastructureUsdPerRequest: 0,
      sourceRef: 'test:local-cost',
      verifiedAt: '2026-09-04T00:00:00Z'
    },
    rights: {
      licenseClass: 'PERMISSIVE',
      sourceRef: 'test:local-rights',
      verifiedAt: '2026-09-04T00:00:00Z',
      executionAllowed: true,
      commercialUseAllowed: true
    },
    benchmark: {
      quality: 91,
      reliability: 96,
      latencyMs: 800,
      observedCostCents: 0,
      sampleSize: 50,
      verifiedAt: '2026-09-04T00:00:00Z'
    },
    enabled: true,
    activationApproved: true,
    inferenceProbeApproved: true
  };
}

function inference(result) {
  return {
    id: 'req-local-builder',
    model: 'local-builder',
    choices: [{ message: { content: JSON.stringify(result) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
  };
}

test('doctor -> planner -> tick executes one exact evidence-backed local Avenger', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-avengers-chain-'));
  const registryPath = path.join(dir, 'registry.json');
  const externalPath = path.join(dir, 'external.json');
  const outputPath = path.join(dir, 'readiness.json');
  fs.writeFileSync(registryPath, JSON.stringify({ schemaVersion: AVENGERS_REGISTRY_SCHEMA, profiles: [], tools: [] }));
  fs.writeFileSync(externalPath, JSON.stringify({ entries: [] }));

  const fetchImpl = async (_url, init = {}) => {
    if (init.method === 'GET') return jsonResponse({ models: [{ name: 'local-builder' }] });
    if (init.method === 'POST') {
      const body = JSON.parse(init.body);
      const objective = body?.messages?.[1]?.content || body?.input || '';
      return jsonResponse(inference(String(objective).includes('AVENGER_READY') ? { status: 'AVENGER_READY' } : { artifact: 'completed' }));
    }
    throw new Error('unexpected method');
  };

  const doctor = await runDoctor({
    registryPath,
    externalRegistryPath: externalPath,
    outputPath,
    profileJson: JSON.stringify([profile()]),
    probeInference: true,
    discoverLocal: false,
    fetchImpl,
    date: NOW
  });
  assert.equal(doctor.ok, true, JSON.stringify(doctor.reasonCodes));
  assert.equal(doctor.receipt.callableModelCount, 1);
  assert.equal(doctor.receipt.profiles[0].status, 'CALLABLE_NOW');
  assert.equal(fs.existsSync(outputPath), true);

  const mission = {
    id: 'single-build',
    objective: 'Create one local-preparation artifact.',
    dataClass: 'SOURCE_CODE',
    consequenceClass: 'LOCAL_PREPARATION',
    nodes: [{
      id: 'build', purpose: 'Build it.', taskClass: 'coding', role: 'builder',
      dependencies: [], toolIds: [], acceptanceTests: ['return a JSON object']
    }]
  };
  const planned = runPlanner({ readiness: doctor.receipt, mission, date: NOW });
  assert.equal(planned.ok, true, JSON.stringify(planned.reasonCodes));
  assert.equal(planned.plan.assignments[0].primary.profileId, 'local-builder');
  assert.equal(planned.plan.routing.policy, 'CANONICAL_AGENT_MODEL_ROUTER');

  const executed = await runTick({
    readiness: doctor.receipt,
    plan: planned.plan,
    fetchImpl,
    date: NOW,
    maxTokensPerNode: 256,
    costCeilingCentsPerNode: 10
  });
  assert.equal(executed.ok, true, JSON.stringify(executed.reasonCodes));
  assert.equal(executed.status, 'AVENGERS_MISSION_COMPLETE');
  assert.equal(executed.receipt.completedNodes[0], 'build');
  assert.equal(executed.receipt.results[0].selectedProfileId, 'local-builder');
  assert.equal(executed.receipt.businessEffectAuthority, 'NONE');
});

test('doctor persists optional runtimes as unproven rather than callable when no runtime evidence exists', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-avengers-tools-'));
  const registryPath = path.join(dir, 'registry.json');
  const externalPath = path.join(dir, 'external.json');
  const outputPath = path.join(dir, 'readiness.json');
  fs.writeFileSync(registryPath, JSON.stringify({ schemaVersion: AVENGERS_REGISTRY_SCHEMA, profiles: [], tools: [] }));
  fs.writeFileSync(externalPath, JSON.stringify({ entries: [
    {
      id: 'omniroute', name: 'OmniRoute', sourceRef: 'abc', source: 'https://example.com', class: 'OPTIONAL_RUNTIME', activation: 'APPROVED_ISOLATED_EVALUATION',
      projectIntegration: { runtimeRequired: true, runtimeEvidenceRequired: true, status: 'HOST_BOOTSTRAP_READY' }
    },
    {
      id: 'superpowers', name: 'Superpowers', sourceRef: 'def', source: 'https://example.com', class: 'CANONICAL_METHOD', activation: 'APPROVED_METHOD_DONOR',
      projectIntegration: { runtimeRequired: false, status: 'MECHANISMS_COMPOSED' }
    }
  ] }));
  const doctor = await runDoctor({ registryPath, externalRegistryPath: externalPath, outputPath, date: NOW });
  assert.equal(doctor.ok, true);
  const omni = doctor.receipt.tools.find(item => item.id === 'omniroute');
  const superpowers = doctor.receipt.tools.find(item => item.id === 'superpowers');
  assert.equal(omni.status, 'RUNTIME_PROOF_REQUIRED');
  assert.equal(omni.callableNow, false);
  assert.equal(superpowers.status, 'CALLABLE_VIA_UBERBOND_METHOD');
  assert.equal(superpowers.callableNow, true);
});
