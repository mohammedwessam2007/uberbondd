import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runRevenueDryRun,
  buildSimulatedRevenueFixtures,
  REVENUE_DRY_RUN_STAGES,
  REVENUE_DRY_RUN_VERDICTS,
  SIMULATED_FIXTURE_PROVENANCE
} from '../src/revenue-dry-run.mjs';
import { reconcilePaymentRenewalTruth, TEST_MODE_WITNESS_REFUSED } from '../src/payment-renewal-truth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
const NOW = '2026-10-13T00:00:00.000Z';

function fixtures(overrides = {}) {
  const base = buildSimulatedRevenueFixtures({ now: NOW });
  return { ...base, ...overrides };
}

// Walks a value and returns the paths of any key matching the pattern whose value is exactly true.
function trueFlagsNamed(value, pattern, path = 'root') {
  if (Array.isArray(value)) return value.flatMap((item, index) => trueFlagsNamed(item, pattern, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => (
      pattern.test(key) && item === true
        ? [`${path}.${key}`]
        : trueFlagsNamed(item, pattern, `${path}.${key}`)
    ));
  }
  return [];
}

function importSpecifiers(source) {
  const specs = [];
  for (const match of source.matchAll(/\bimport\s[^'"]*?from\s*['"]([^'"]+)['"]/g)) specs.push(match[1]);
  for (const match of source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) specs.push(match[1]);
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(match[1]);
  return specs;
}

// Every module reachable from the dry run through relative imports.
function importClosure(entryFile) {
  const files = new Set();
  const builtins = new Set();
  const bare = new Set();
  const queue = [entryFile];
  while (queue.length) {
    const file = queue.shift();
    if (files.has(file)) continue;
    files.add(file);
    for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('node:')) builtins.add(spec);
      else if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else bare.add(spec);
    }
  }
  return { files: [...files], builtins: [...builtins], bare: [...bare] };
}

test('the full simulated dry run passes end to end with verdict DRY_RUN_PASSED', () => {
  const result = runRevenueDryRun({ fixtures: fixtures(), now: NOW });

  assert.equal(result.verdict, REVENUE_DRY_RUN_VERDICTS.PASSED);
  assert.deepEqual(result.failingInvariants, []);
  assert.deepEqual(result.stages.map(stage => stage.stage), REVENUE_DRY_RUN_STAGES);
  for (const stage of result.stages) {
    assert.equal(stage.status, 'SIMULATED_PASSED', `${stage.stage} should pass its own checks`);
  }
  assert.equal(result.clearedCashCents, 0);
  assert.equal(result.externalEffectCount, 0);
  assert.equal(result.storeWriteCount, 0);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('every stage is labelled SIMULATED and carries the SIMULATED_FIXTURE provenance', () => {
  const result = runRevenueDryRun({ fixtures: fixtures(), now: NOW });

  assert.equal(result.provenance, SIMULATED_FIXTURE_PROVENANCE);
  for (const stage of result.stages) {
    assert.equal(stage.label, 'SIMULATED', `${stage.stage} must be labelled SIMULATED`);
    assert.equal(stage.provenance, SIMULATED_FIXTURE_PROVENANCE, `${stage.stage} must carry provenance`);
  }
});

test('no stage result carries a cleared or proven status', () => {
  const result = runRevenueDryRun({ fixtures: fixtures(), now: NOW });

  for (const stage of result.stages) {
    assert.ok(!['CLEARED', 'PROVEN'].includes(stage.status), `${stage.stage} status must not be cleared or proven`);
    assert.notEqual(stage.proofStatus, 'PROVEN', `${stage.stage} must not prove anything`);
    assert.equal(stage.clearedCents, 0, `${stage.stage} must record no cleared cents`);
  }
  const claims = trueFlagsNamed(result.stages.map(stage => ({ facts: stage.facts })), /^(cleared|proven)/i);
  assert.deepEqual(claims, [], 'no fact may assert a cleared or proven state');
});

test('a payment fixture claiming the live environment with no provider event id is refused, not proven', () => {
  const base = fixtures();
  const live = {
    ...base,
    payment: {
      ...base.payment,
      event: { ...base.payment.event, testMode: false, environment: 'production', eventId: '' }
    }
  };
  const result = runRevenueDryRun({ fixtures: live, now: NOW });
  const payment = result.stages.find(stage => stage.stage === 'simulated-payment');

  assert.equal(result.verdict, REVENUE_DRY_RUN_VERDICTS.FAILED);
  assert.ok(result.failingInvariants.includes('payment-fixture-is-simulated'));
  assert.equal(payment.status, 'SIMULATED_FAILED');
  assert.equal(payment.proofStatus, 'NOT_PROVEN');
  assert.equal(payment.clearedCents, 0);
  assert.equal(payment.facts.refusedBeforeReconciliation, true);
  assert.equal(result.clearedCashCents, 0);
});

test('a live-environment payment with a real-looking event id is still refused before any witness is built', () => {
  const base = fixtures();
  const live = {
    ...base,
    payment: {
      ...base.payment,
      event: { ...base.payment.event, testMode: false, environment: 'production', eventId: 'evt_live_0001' }
    }
  };
  const result = runRevenueDryRun({ fixtures: live, now: NOW });
  const payment = result.stages.find(stage => stage.stage === 'simulated-payment');

  assert.equal(payment.proofStatus, 'NOT_PROVEN');
  assert.equal(payment.clearedCents, 0);
  assert.equal(result.clearedCashCents, 0);
  assert.equal(result.verdict, REVENUE_DRY_RUN_VERDICTS.FAILED);
});

test('a campaign fixture with sent true fails the approval stage', () => {
  const base = fixtures();
  const sent = { ...base, campaign: { ...base.campaign, sent: true } };
  const result = runRevenueDryRun({ fixtures: sent, now: NOW });
  const campaign = result.stages.find(stage => stage.stage === 'approved-unsent-campaign');

  assert.equal(campaign.status, 'SIMULATED_FAILED');
  assert.ok(campaign.failedChecks.includes('approved-campaign-marked-sent'));
  assert.ok(result.failingInvariants.includes('approved-campaign-marked-sent'));
  assert.equal(result.verdict, REVENUE_DRY_RUN_VERDICTS.FAILED);
  // The failure is isolated to the approval stage; the other stages still pass their own checks.
  const others = result.stages.filter(stage => stage.stage !== 'approved-unsent-campaign' && stage.stage !== 'reconciliation');
  for (const stage of others) assert.equal(stage.status, 'SIMULATED_PASSED', `${stage.stage} should be unaffected`);
});

test('an approved campaign with sent false passes the approval stage', () => {
  const result = runRevenueDryRun({ fixtures: fixtures(), now: NOW });
  const campaign = result.stages.find(stage => stage.stage === 'approved-unsent-campaign');

  assert.equal(campaign.status, 'SIMULATED_PASSED');
  assert.equal(campaign.facts.sent, false);
  assert.equal(campaign.facts.approved, true);
});

test('a test-mode order row is not counted as cleared cash', () => {
  const lead = { id: 'lead_1', prospectId: 'pros_1', paymentStatus: 'open' };
  const at = '2026-10-13T00:00:00.000Z';
  const result = reconcilePaymentRenewalTruth({
    lead,
    orders: [{
      id: 'order_test_1', provider: 'lemonsqueezy', providerEventId: 'evt_test_1', eventName: 'order_created',
      leadId: lead.id, prospectId: lead.prospectId, product: 'full', amountCents: 45000, currency: 'USD',
      status: 'paid', testMode: true, createdAt: at
    }],
    auditLog: [{
      type: 'payment_classification', classification: 'CLEARED_ONE_TIME_PAYMENT', eventName: 'order_created',
      eventId: 'evt_test_1', leadId: lead.id, prospectId: lead.prospectId, amountCents: 45000, currency: 'USD',
      policyVersion: 'payment-truth-1.2.0', testMode: true, timestamp: at
    }],
    revenueEvents: [{
      id: 'rev_test_1', providerEventId: 'order_created:evt_test_1', leadId: lead.id, prospectId: lead.prospectId,
      product: 'full', kind: 'sale', amountCents: 45000, currency: 'USD', createdAt: at
    }]
  });

  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.equal(result.economics.netProviderClearedRevenueCents, 0);
  assert.deepEqual(result.verifiedProviderEventRefs, []);
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.stages.CLEARED_PAYMENT.reason, TEST_MODE_WITNESS_REFUSED);
});

test('the dry run payment stage never counts its test witness as cleared cash', () => {
  const result = runRevenueDryRun({ fixtures: fixtures(), now: NOW });
  const payment = result.stages.find(stage => stage.stage === 'simulated-payment');

  assert.equal(payment.facts.defaultClassification, 'INVALID_OR_UNSUPPORTED', 'test unlocks off rejects the test-mode event');
  assert.equal(payment.facts.unlockedClassification, 'INVALID_OR_UNSUPPORTED', 'a sandbox environment is refused at source even when test unlocks are on');
  // The source classifier refuses first, so no witness reaches the reconciler and no reconciler reason is recorded.
  assert.equal(payment.facts.refusalReason, null);
  assert.equal(payment.facts.refusedTestModeEventCount, 0);
  assert.equal(payment.proofStatus, 'NOT_PROVEN');
  assert.equal(payment.clearedCents, 0);
});

test('a fixture section without SIMULATED_FIXTURE provenance fails the provenance invariant', () => {
  const base = fixtures();
  const missing = { ...base, reply: { ...base.reply, provenance: undefined } };
  const result = runRevenueDryRun({ fixtures: missing, now: NOW });

  assert.equal(result.verdict, REVENUE_DRY_RUN_VERDICTS.FAILED);
  assert.ok(result.failingInvariants.includes('simulated-record-missing-provenance'));
  const reply = result.stages.find(stage => stage.stage === 'simulated-reply');
  assert.equal(reply.provenance, null);
  assert.equal(reply.status, 'SIMULATED_FAILED');
});

test('a simulated reply stops prospect automation and never grants send authority', () => {
  const result = runRevenueDryRun({ fixtures: fixtures(), now: NOW });
  const reply = result.stages.find(stage => stage.stage === 'simulated-reply');

  assert.equal(reply.facts.label, 'positive');
  assert.equal(reply.facts.automation, 'STOP_ALL_PROSPECT_AUTOMATION');
  assert.equal(reply.facts.consequenceAuthority, 'NONE');
  assert.equal(reply.checks['reply-authority-manual-only'], true);
  assert.equal(reply.checks['reply-no-outbound-authority'], true);
});

test('a simulated acceptance is not commercial truth, even when won with revenue reported', () => {
  const base = fixtures();
  const won = { ...base, acceptance: { ...base.acceptance, revenueCleared: 450 } };
  const result = runRevenueDryRun({ fixtures: won, now: NOW });
  const acceptance = result.stages.find(stage => stage.stage === 'simulated-acceptance');

  assert.equal(acceptance.facts.simulated, true);
  assert.equal(acceptance.facts.commercialTruthEligible, false);
  assert.ok(acceptance.facts.eligibilityBlockers.includes('external-payment-evidence-required'));
  assert.equal(acceptance.status, 'SIMULATED_PASSED');
});

test('an external-looking payment reference inside a simulation is flagged, not treated as eligible', () => {
  const base = fixtures();
  const contaminated = {
    ...base,
    acceptance: {
      ...base.acceptance,
      revenueCleared: 450,
      paymentEvidence: { origin: 'EXTERNAL', evidenceClass: 'EXTERNAL_PAYMENT', evidenceRef: 'payment:live-evt-0001' }
    }
  };
  const result = runRevenueDryRun({ fixtures: contaminated, now: NOW });

  assert.equal(result.verdict, REVENUE_DRY_RUN_VERDICTS.FAILED);
  assert.ok(result.failingInvariants.includes('acceptance-not-commercial-truth'));
});

test('an evidence URL that is not a reserved .invalid host is refused and not echoed', () => {
  const base = fixtures();
  const realish = { ...base, evidence: { ...base.evidence, url: 'https://real-looking-company.test/page' } };
  const result = runRevenueDryRun({ fixtures: realish, now: NOW });
  const evidence = result.stages.find(stage => stage.stage === 'evidence');

  assert.equal(evidence.status, 'SIMULATED_FAILED');
  assert.ok(evidence.failedChecks.includes('evidence-url-reserved-invalid-host'));
  assert.equal(evidence.facts.host, 'NOT_RESERVED');
  assert.equal(result.verdict, REVENUE_DRY_RUN_VERDICTS.FAILED);
});

test('the dry run is deterministic for identical fixtures and time', () => {
  const first = runRevenueDryRun({ fixtures: fixtures(), now: NOW });
  const second = runRevenueDryRun({ fixtures: fixtures(), now: NOW });

  assert.deepEqual(second, first);
});

test('runRevenueDryRun has no store dependency and performs no file, network or provider I/O', () => {
  const entry = join(srcDir, 'revenue-dry-run.mjs');
  const source = readFileSync(entry, 'utf8');

  // Direct source checks on the dry-run module itself.
  assert.doesNotMatch(source, /from\s*['"][^'"]*store\.mjs['"]/, 'must not import store.mjs');
  assert.doesNotMatch(source, /\bstore\s*\.\s*[A-Za-z]+\s*\(/, 'must not call store methods');
  assert.doesNotMatch(source, /\bfetch\s*\(/, 'must not call fetch');
  assert.doesNotMatch(source, /\bimport\s*\(/, 'must not load modules dynamically');
  assert.doesNotMatch(source, /\b(writeFile|appendFile|readFile|mkdir|unlink|rename)\w*\s*\(/, 'must not touch the filesystem');

  // Transitive: no module the dry run can reach may import store.mjs, a network or filesystem
  // builtin, or a bare package. The only builtin allowed in the whole graph is node:crypto,
  // which is used for digests.
  const closure = importClosure(entry);
  assert.ok(closure.files.length > 1, 'the closure should include the reused pure modules');
  assert.equal(closure.files.some(file => file.endsWith('/store.mjs')), false, 'store.mjs must be unreachable');
  assert.deepEqual(closure.builtins.filter(spec => spec !== 'node:crypto'), [], 'only node:crypto may be imported');
  assert.deepEqual(closure.bare, [], 'no bare package may be imported');
});
