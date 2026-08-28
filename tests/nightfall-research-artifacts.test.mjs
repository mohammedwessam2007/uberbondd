import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const REQUIRED_ARTIFACTS = [
  'artifacts/research-source-registry.json',
  'artifacts/world-signal-taxonomy.json',
  'artifacts/emerging-ai-mechanism-library.json',
  'artifacts/distribution-channel-portfolio.json',
  'artifacts/outreach-capacity-economics.json',
  'artifacts/ai-employee-organization.json',
  'artifacts/opportunity-tournament-latest.json',
  'artifacts/offer-factory-research-packet.json',
  'artifacts/claude-implementation-queue.json'
];

async function loadJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
}

function collectSourceIds(value, ids = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceIds(item, ids);
    return ids;
  }
  if (!value || typeof value !== 'object') return ids;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'sourceIds' && Array.isArray(child)) ids.push(...child);
    else collectSourceIds(child, ids);
  }
  return ids;
}

function collectEffectLedgers(value, ledgers = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectEffectLedgers(item, ledgers);
    return ledgers;
  }
  if (!value || typeof value !== 'object') return ledgers;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'externalEffectLedger' && child && typeof child === 'object') ledgers.push(child);
    collectEffectLedgers(child, ledgers);
  }
  return ledgers;
}

test('Nightfall research artifacts are parseable, source-bound, and cross-referenced', async () => {
  const entries = await Promise.all(REQUIRED_ARTIFACTS.map(async path => [path, await loadJson(path)]));
  const artifacts = Object.fromEntries(entries);
  const registry = artifacts['artifacts/research-source-registry.json'];
  assert.match(registry.sourceMainSha, /^[a-f0-9]{40}$/);
  const sourceIds = registry.sources.map(source => source.id);
  assert.equal(new Set(sourceIds).size, sourceIds.length, 'source IDs must be unique');
  assert.ok(registry.sources.length >= 40, 'source register must remain materially multi-source');
  for (const source of registry.sources) {
    assert.ok(source.title);
    assert.ok(source.url);
    assert.ok(source.sourceType);
    assert.ok(Array.isArray(source.supports) && source.supports.length > 0);
  }

  const known = new Set(sourceIds);
  for (const [path, artifact] of entries) {
    assert.equal(artifact.sourceMainSha, registry.sourceMainSha, `${path} must bind the same source main SHA`);
    for (const sourceId of collectSourceIds(artifact)) {
      assert.ok(known.has(sourceId), `${path} references unknown source ${sourceId}`);
    }
  }
});

test('Nightfall portfolio has exactly one canary, one fallback, and no live external experiment', async () => {
  const tournament = await loadJson('artifacts/opportunity-tournament-latest.json');
  assert.equal(tournament.candidates.filter(item => item.status === 'RECOMMENDED_CANARY_PREPARATION').length, 1);
  assert.equal(tournament.candidates.filter(item => item.status === 'FALLBACK_PREPARATION').length, 1);
  assert.equal(tournament.portfolioLaw.liveExternalExperimentCount, 0);
  assert.equal(tournament.portfolioLaw.externalEffectAuthority, 'NONE');

  const offers = await loadJson('artifacts/offer-factory-research-packet.json');
  assert.equal(offers.activeCommercialExperiment, null);
  assert.equal(offers.offers.filter(item => item.portfolioRole === 'RECOMMENDED_CANARY_PREPARATION').length, 1);
  assert.equal(offers.offers.filter(item => item.portfolioRole === 'FALLBACK_PREPARATION').length, 1);
  assert.equal(offers.offers[0].pricingHypothesis.evidenceClass, 'HYPOTHESIS');
  assert.equal(offers.offers[0].pricingHypothesis.state, 'NOT_OFFERED_NOT_VALIDATED');
  assert.ok(offers.offers[0].scope.excluded.includes('claiming lost or recovered revenue without buyer-origin transaction evidence'));
});

test('Nightfall channel and outreach economics preserve unknowns and zero authority', async () => {
  const portfolio = await loadJson('artifacts/distribution-channel-portfolio.json');
  for (const channel of portfolio.channels) {
    assert.equal(channel.measuredClearedContributionCentsPerFounderMinute, null);
    assert.ok(channel.killThreshold);
    assert.ok(Array.isArray(channel.sourceIds) && channel.sourceIds.length > 0);
  }
  assert.equal(portfolio.externalEffectAuthority, 'NONE');

  const economics = await loadJson('artifacts/outreach-capacity-economics.json');
  assert.equal(economics.currentTruth.authorizedLiveCampaigns, 0);
  assert.equal(economics.currentTruth.verifiedOutboundSales, 0);
  assert.equal(economics.capacityScenarios.find(item => item.id === 'CAP-01').totalKnownMonthlyCostUsd, null);
  assert.equal(economics.capacityScenarios.find(item => item.id === 'CAP-03').status, 'REJECT_SCALE_BEFORE_VERIFIED_ECONOMICS');
  assert.equal(economics.canarySensitivity.expectedRevenue, null);
  assert.equal(economics.canarySensitivity.conversionRate, null);
});

test('Nightfall employee contracts and Claude packets are bounded', async () => {
  const organization = await loadJson('artifacts/ai-employee-organization.json');
  assert.equal(organization.currentStaffingPolicy.liveExternalWorkers, 0);
  assert.equal(organization.currentStaffingPolicy.ownerQueueMaximum, 3);
  const roles = organization.departments.flatMap(department => department.roles);
  assert.ok(roles.length >= 15);
  for (const role of roles) {
    for (const field of ['id', 'status', 'mission', 'authorityCeiling', 'economicMetric', 'escalation', 'receipt']) {
      assert.ok(role[field], `${role.id || 'unknown role'} missing ${field}`);
    }
    assert.ok(Array.isArray(role.allowedTools) && role.allowedTools.length > 0);
    assert.ok(Array.isArray(role.evidencePrerequisites) && role.evidencePrerequisites.length > 0);
    assert.ok(Array.isArray(role.stopConditions) && role.stopConditions.length > 0);
  }

  const queue = await loadJson('artifacts/claude-implementation-queue.json');
  assert.equal(queue.dependencySatisfiedPackets, 1);
  assert.ok(queue.packets.length >= 4);
  for (const packet of queue.packets) {
    assert.notEqual(packet.status, 'READY');
    assert.ok(packet.missingCapabilityOnly);
    assert.ok(Array.isArray(packet.reuse) && packet.reuse.length > 0);
    assert.ok(Array.isArray(packet.hostileInvariants) && packet.hostileInvariants.length > 0);
    assert.ok(Array.isArray(packet.testsNeeded) && packet.testsNeeded.length > 0);
    assert.ok(Array.isArray(packet.dependencies) && packet.dependencies.length > 0);
  }
});

test('Nightfall artifacts claim zero observed external effects wherever a ledger is present', async () => {
  const entries = await Promise.all(REQUIRED_ARTIFACTS.map(loadJson));
  const ledgers = entries.flatMap(item => collectEffectLedgers(item));
  assert.ok(ledgers.length >= 2);
  for (const ledger of ledgers) {
    for (const [key, value] of Object.entries(ledger)) {
      assert.equal(value, 0, `${key} must remain zero in a research-only mission receipt`);
    }
  }
});
