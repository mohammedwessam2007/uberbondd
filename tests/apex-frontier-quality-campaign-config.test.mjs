import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFreshApexCampaign } from '../src/apex-fresh-campaign.mjs';
import { validateFrontierModelCandidateRegistry } from '../src/frontier-model-team.mjs';
import { ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST } from '../src/absolute-frontier-quality-invariant.mjs';

const campaign = JSON.parse(fs.readFileSync('./config/apex-frontier-quality-compression-campaign.json', 'utf8'));
const registry = JSON.parse(fs.readFileSync('./config/frontier-model-candidates.json', 'utf8'));

test('frontier-quality campaign config is internally valid and capped at ten dollars', () => {
  const out = prepareFreshApexCampaign(campaign);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.budgetPolicy.maxTotalCampaignSpendUsd, 10);
  assert.equal(out.budgetPolicy.sumTrialSpendCeilingsUsd, 10);
  assert.equal(out.qualityFloorPolicy.maxQualityDelta, 0);
  assert.equal(out.qualityFloorPolicy.absoluteQualityPolicyDigest, ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST);
  assert.equal(out.providerCallAuthority, 'NONE');
  assert.equal(out.spendAuthority, 'NONE');
  assert.equal(out.executionAuthority, 'NONE');
});

test('every campaign model is in a valid frontier candidate registry', () => {
  const checked = validateFrontierModelCandidateRegistry(registry);
  assert.equal(checked.ok, true, JSON.stringify(checked));
  const ids = new Set(registry.candidates.map(row => row.id));
  const required = [...new Set(campaign.architectures.flatMap(row => row.modelRequirements.map(model => model.candidateId)))];
  for (const id of required) assert.equal(ids.has(id), true, id);
});

test('new efficiency-frontier discoveries remain non-callable without transport evidence', () => {
  const ids = new Map(registry.candidates.map(row => [row.id, row]));
  for (const id of [
    'xiaomi-mimo-v2-6-pro',
    'xiaomi-mimo-v2-6-flash',
    'alibaba-qwen3-8-flash',
    'minimax-m2-5',
    'zai-glm-5-3-flash',
    'volcengine-doubao-seed-2-1-lite'
  ]) {
    const row = ids.get(id);
    assert.ok(row, id);
    assert.equal(row.configured, false, id);
    assert.equal(Boolean(row.gatewayTransport || row.directTransportCandidate), false, id);
  }
});

test('campaign template contains no raw holdout material', () => {
  const serialized = JSON.stringify(campaign);
  for (const key of ['rawPrompt','rawAnswer','expectedAnswer','referenceAnswer','plaintextAnswer','taskBody']) {
    assert.equal(serialized.includes(`"${key}"`), false, key);
  }
});
