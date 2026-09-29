import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const config = JSON.parse(fs.readFileSync('./config/ubermind-cloud-cognition-resources.json', 'utf8'));

test('cloud cognition contract is iPad/cloud-only and requires no local model or GPU', () => {
  assert.equal(config.cloudOnly, true);
  assert.equal(config.localModelRequired, false);
  assert.equal(config.localGpuRequired, false);
  assert.equal(config.qualityPolicy.maxQualityDelta, 0);
});

test('first activation needs only one external cognition credential', () => {
  const secrets = config.requiredResources.filter(row => row.kind === 'SECRET_CREDENTIAL');
  assert.equal(secrets.length, 1);
  assert.equal(secrets[0].env, 'OPENROUTER_API_KEY');
  assert.equal(config.requiredResources.find(row => row.id === 'cognition-budget').default, '20');
  assert.equal(config.requiredResources.find(row => row.id === 'openrouter-enable').requiredValue, 'true');
});

test('OpenRouter privacy and price-first policies are explicit while direct providers remain optional', () => {
  const policies = Object.fromEntries(config.recommendedPolicies.map(row => [row.env, row.default]));
  assert.equal(policies.OPENROUTER_PROVIDER_SORT, 'price');
  assert.equal(policies.OPENROUTER_REQUIRE_ZDR, 'true');
  assert.equal(policies.OPENROUTER_ALLOW_PROVIDER_FALLBACKS, 'true');
  assert.equal(policies.OPENROUTER_PLATFORM_FEE_RATE, '0.055');
  assert.ok(config.optionalDonors.some(row => row.env === 'ANTHROPIC_API_KEY'));
  assert.ok(config.optionalDonors.some(row => row.env === 'OPENAI_API_KEY'));
  assert.ok(config.forbiddenResourceAssumptions.includes('local GPU'));
  assert.ok(config.forbiddenResourceAssumptions.includes('local model runtime'));
});
