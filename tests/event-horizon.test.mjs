import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EVENT_HORIZON_POLICY_VERSION,
  scoreEventHorizonCandidate,
  summarizeEventHorizon,
  validateEventHorizon
} from '../src/event-horizon.mjs';

const source = JSON.parse(fs.readFileSync(new URL('../artifacts/event-horizon/economic-genome-2026-08-31.json', import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

test('Event Horizon is a single-source evidence-weighted tournament with zero commercial fiction', () => {
  const result = validateEventHorizon(source);
  assert.equal(result.ok, true);
  assert.equal(result.health, 'EVENT_HORIZON_HEALTHY');
  assert.equal(result.policyVersion, EVENT_HORIZON_POLICY_VERSION);
  assert.equal(result.candidateCount, 5);
  assert.equal(result.sourceCount, 17);
  assert.equal(result.championId, 'lead-path-evidence-sprint');
  assert.equal(result.activeExperimentCount, 1);
  assert.match(result.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(source.commercialTruth, { realCustomers: 0, clearedRevenueUsd: 0, acceptedDeliveries: 0, retainedCustomers: 0 });
});

test('doctor summary separates the prepared champion, strategic invention, challenger, and actual outcomes', () => {
  const summary = summarizeEventHorizon(source);
  assert.equal(summary.ok, true);
  assert.equal(summary.champion.id, 'lead-path-evidence-sprint');
  assert.equal(summary.champion.state, 'PREPARED_NOT_EXTERNALLY_ACTIVATED');
  assert.equal(summary.strongestChallenger.id, 'gcc-einvoice-exception-evidence');
  assert.equal(summary.bestOriginalInvention, 'Partner Evidence Rail');
  assert.equal(summary.commercialTruth.clearedRevenueUsd, 0);
  assert.equal(summary.businessEffectAuthority, 'NONE');
});

test('score is recomputed from bounded ratings and cannot be inflated by prose', () => {
  for (const candidate of source.tournament) {
    assert.equal(scoreEventHorizonCandidate(candidate, source.scoring.weights), candidate.decisionScore);
  }
  const tampered = clone(source);
  tampered.tournament[1].decisionScore = 99;
  assert.ok(validateEventHorizon(tampered).failures.includes('decision-score-mismatch'));
});

test('forged customers, revenue, delivery, retention, or external effects fail closed', () => {
  for (const field of ['realCustomers', 'clearedRevenueUsd', 'acceptedDeliveries', 'retainedCustomers']) {
    const tampered = clone(source);
    tampered.commercialTruth[field] = 1;
    assert.ok(validateEventHorizon(tampered).failures.includes('unsupported-commercial-outcome'));
  }
  const effect = clone(source);
  effect.externalEffectLedger.messages = 1;
  assert.ok(validateEventHorizon(effect).failures.includes('nonzero-external-effect'));

  const stringZero = clone(source);
  stringZero.externalEffectLedger.messages = '0';
  assert.ok(validateEventHorizon(stringZero).failures.includes('nonzero-external-effect'));

  const unknownEffect = clone(source);
  unknownEffect.externalEffectLedger.customerSystemMutations = 0;
  assert.ok(validateEventHorizon(unknownEffect).failures.includes('nonzero-external-effect'));
});

test('missing provenance, duplicate identities, multiple active experiments, and multiple champions fail closed', () => {
  const missingSource = clone(source);
  missingSource.sourceLedger[0].url = '';
  assert.ok(validateEventHorizon(missingSource).failures.includes('invalid-source-evidence'));

  const duplicate = clone(source);
  duplicate.tournament[1].id = duplicate.tournament[0].id;
  assert.ok(validateEventHorizon(duplicate).failures.includes('invalid-or-duplicate-candidate-id'));

  const unknownCanonical = clone(source);
  unknownCanonical.tournament[0].canonicalOpportunityId = 'invented-opportunity';
  assert.ok(validateEventHorizon(unknownCanonical).failures.includes('unknown-canonical-opportunity-id'));

  const poisonedSource = clone(source);
  poisonedSource.sourceLedger[0].supports = ['invented-mechanism'];
  assert.ok(validateEventHorizon(poisonedSource).failures.includes('source-support-target-unknown'));

  const multipleActive = clone(source);
  multipleActive.tournament[1].activeExperiment = true;
  assert.ok(validateEventHorizon(multipleActive).failures.includes('exactly-one-active-experiment-required'));

  const multipleChampions = clone(source);
  multipleChampions.tournament[1].status = 'CURRENT_CHAMPION';
  assert.ok(validateEventHorizon(multipleChampions).failures.includes('exactly-one-champion-required'));
});

test('unsafe capability handoff or invented execution authority fails closed', () => {
  const unsafe = clone(source);
  unsafe.claudeHandoff.boundaries = unsafe.claudeHandoff.boundaries.filter(item => item !== 'No production mutation.');
  assert.ok(validateEventHorizon(unsafe).failures.includes('claude-handoff-boundary-missing'));

  const authority = clone(source);
  authority.highestValueExperiment.currentAuthority = 'AUTONOMOUS';
  assert.ok(validateEventHorizon(authority).failures.includes('experiment-authority-must-remain-none'));
});
