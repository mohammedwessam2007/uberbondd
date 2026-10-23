import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { compileContraCollectionReadiness } from '../src/contra-collection-readiness.mjs';
import { containsSecretValue } from '../src/secret-patterns.mjs';

const sources = JSON.parse(readFileSync(new URL('../artifacts/commercialization/swarm/A09/PAYMENT_PROVIDER_SOURCES.json', import.meta.url), 'utf8'));
const cashPath = JSON.parse(readFileSync(new URL('../artifacts/commercialization/swarm/A09/cleared_cash_path.json', import.meta.url), 'utf8'));
const decision = readFileSync(new URL('../docs/commercialization/swarm/A09/EGYPT_RAIL_DECISION.md', import.meta.url), 'utf8');
const checklist = readFileSync(new URL('../docs/commercialization/swarm/A09/OWNER_PAYMENT_CHECKLIST.md', import.meta.url), 'utf8');

test('provider and law claims carry dated provenance, limits, and a falsifier', () => {
  assert.ok(sources.sources.length >= 6);
  for (const source of sources.sources) {
    assert.match(source.sourceId, /^[a-z0-9-]+$/);
    assert.match(
      source.sourceUrl,
      typeof source.responseStatus === 'number' ? /^https:\/\// : /^(docs|artifacts)\//
    );
    assert.ok(Number.isFinite(Date.parse(source.observedAt)), source.sourceId);
    assert.match(source.contentSha256, /^[a-f0-9]{64}$/);
    assert.ok(source.claims.length > 0, source.sourceId);
    assert.ok(source.limitations.length > 0, source.sourceId);
    assert.ok(source.falsifier, source.sourceId);
  }
});

test('internal source hashes match the exact repository bytes', () => {
  const sourceFiles = [
    ['contra-egypt-route-support-record', '../docs/handoffs/WORK_CONTRA_CURRENT_2026-10-06.md'],
    ['paypal-founder-account-state', '../docs/handoffs/WORK_LAUNCH_TODAY_CURRENT_2026-10-06.md'],
    ['fallback-account-status', '../docs/handoffs/WORK_LAUNCH_TODAY_CURRENT_2026-10-06.md'],
    ['apify-store-readiness', '../docs/commercialization/APIFY_STORE_READINESS.md'],
    ['apify-unit-economics-scenario', '../artifacts/commercialization/unit-economics-2026-10.json']
  ];
  for (const [sourceId, relativePath] of sourceFiles) {
    const source = sources.sources.find(item => item.sourceId === sourceId);
    const bytes = readFileSync(new URL(relativePath, import.meta.url));
    const actual = createHash('sha256').update(bytes).digest('hex');
    assert.equal(source.contentSha256, actual, sourceId);
  }
});

test('PayPal is excluded for the deactivated account despite the stale rail classifier', () => {
  const paypal = cashPath.rails.find(rail => rail.id === 'PAYPAL_EGYPT');
  const conflict = sources.sourceConflicts.find(item => item.id === 'paypal-classifier-conflict');
  assert.equal(paypal.state, 'EXCLUDED_ACCOUNT_DEACTIVATED');
  assert.equal(paypal.canCollect, false);
  assert.equal(conflict.currentA09HeadObserved.verdict, 'RAIL_PLAUSIBLE');
  assert.equal(conflict.ownerAccountEvidence, 'PERMANENTLY_DEACTIVATED');
  assert.equal(conflict.resolution, 'A20_RECONCILE_WITH_OPEN_PR_1538');
  const moduleBytes = readFileSync(new URL('../src/money-entry-rails.mjs', import.meta.url));
  assert.equal(
    createHash('sha256').update(moduleBytes).digest('hex'),
    conflict.currentA09HeadObserved.moduleSha256
  );
});

test('Contra country support does not imply authenticated-account collection readiness', () => {
  const contra = cashPath.rails.find(rail => rail.id === 'CONTRA');
  assert.equal(contra.state, 'COUNTRY_ROUTE_PROVIDER_CONFIRMED__ACCOUNT_UNOBSERVED');
  assert.equal(contra.canCollect, false);
  assert.equal(contra.accountKyc, 'UNKNOWN');
  assert.equal(contra.payoutFeesFxTiming, 'UNKNOWN');
  const report = compileContraCollectionReadiness(null, { at: new Date(sources.observedAt) });
  assert.equal(report.state, 'ACCOUNT_OBSERVATION_REQUIRED');
  assert.equal(report.paymentRequestAuthority, 'NONE');
});

test('Apify modeled contribution remains below every applicable payout threshold', () => {
  const apify = cashPath.rails.find(rail => rail.id === 'APIFY_STORE');
  assert.equal(apify.modeledContributionUsd, 5.3888);
  assert.equal(apify.modeledContributionClass, 'UNVALIDATED_HYPOTHESIS_NOT_DEMAND_OR_CASH');
  assert.equal(apify.payoutThresholdUsd.paypal, 20);
  assert.equal(apify.payoutThresholdUsd.wise, 20);
  assert.equal(apify.payoutThresholdUsd.wire, 100);
  assert.ok(apify.modeledContributionUsd < apify.payoutThresholdUsd.paypal);
  assert.ok(apify.modeledContributionUsd < apify.payoutThresholdUsd.wise);
  assert.ok(apify.modeledContributionUsd < apify.payoutThresholdUsd.wire);
  assert.equal(apify.accountEligibility, 'UNKNOWN');
  assert.equal(apify.clearedCashUsd, 0);
});

test('delivery-only and sandbox evidence cannot become a payment or cash receipt', () => {
  assert.equal(cashPath.apifyLocalSmoke.chargingMode, 'DELIVERY_ONLY');
  assert.equal(cashPath.apifyLocalSmoke.chargedUsd, 0);
  assert.equal(cashPath.apifyLocalSmoke.providerPayout, 'NONE');
  assert.equal(cashPath.actualClearedRevenueUsd, 0);
  assert.equal(cashPath.actualClearedContributionProfitUsd, 0);
});

test('Egypt tax and legal status stays unknown without promoting portal access into clearance', () => {
  assert.equal(sources.taxAndLegal.status, 'UNKNOWN_NO_LEGAL_CLEARANCE');
  assert.equal(sources.taxAndLegal.etaSubstantiveRuleRetrieved, false);
  assert.equal(cashPath.taxStatus, 'UNKNOWN');
  assert.equal(cashPath.legalClearance, false);
  assert.match(decision, /No tax, VAT, export, invoice, or legal conclusion/i);
});

test('no autonomous identity or payout verification occurred; unknown remains HOLD', () => {
  assert.equal(cashPath.externalEffects.providerCalls, 0);
  assert.equal(cashPath.externalEffects.accountChanges, 0);
  assert.equal(cashPath.rails.find(rail => rail.id === 'CONTRA').accountKyc, 'UNKNOWN');
  assert.equal(cashPath.rails.find(rail => rail.id === 'APIFY_STORE').accountEligibility, 'UNKNOWN');
  assert.equal(cashPath.decision, 'HOLD_NO_COLLECTION_READY_RAIL');
});

test('owner checklist is bounded, does not request secrets, and preserves a no-action default', () => {
  assert.match(checklist, /safe default: do nothing/i);
  assert.ok(checklist.includes('Passwords, OTPs, card details, bank credentials, and full account numbers stay out of chat'));
  assert.ok(cashPath.ownerActions.length <= 3);
  assert.ok(cashPath.ownerActions.every(action => action.safeNoActionDefault));
  assert.equal(containsSecretValue(`${decision}\n${checklist}\n${JSON.stringify(sources)}\n${JSON.stringify(cashPath)}`), false);
});

test('the cash path requires customer acceptance and final bank-cleared net evidence', () => {
  const states = cashPath.requiredClearedCashEvidence.map(item => item.state);
  assert.ok(states.includes('CUSTOMER_ACCEPTED_SCOPE'));
  assert.ok(states.includes('PROVIDER_PAYOUT_RELEASED'));
  assert.ok(states.includes('BANK_CREDIT_OBSERVED'));
  assert.ok(states.includes('NET_AFTER_FEES_AND_FX_RECONCILED'));
  assert.ok(states.indexOf('BANK_CREDIT_OBSERVED') > states.indexOf('PROVIDER_PAYOUT_RELEASED'));
  assert.equal(cashPath.truthRule, 'PENDING_PAYOUT_OR_WALLET_BALANCE_IS_NOT_BANK_CLEARED_CASH');
});

test('all external-effect counters are zero and the rail decision remains HOLD', () => {
  assert.equal(cashPath.decision, 'HOLD_NO_COLLECTION_READY_RAIL');
  assert.equal(cashPath.externalEffects.customerMessages, 0);
  assert.equal(cashPath.externalEffects.providerCalls, 0);
  assert.equal(cashPath.externalEffects.spendUsd, 0);
  assert.equal(cashPath.externalEffects.paymentMutations, 0);
  assert.equal(cashPath.externalEffects.deployments, 0);
  assert.equal(cashPath.externalEffects.mainMerges, 0);
});

test('relevant founder 890 mechanisms remain source-linked and independently truth-bounded', () => {
  assert.deepEqual(
    cashPath.founder890Crossover.map(idea => idea.id),
    ['founder-moonshot-0054', 'founder-moonshot-0305']
  );
  assert.ok(cashPath.founder890Crossover.every(idea => idea.sourceLines && idea.application));
  assert.match(decision, /23bb3c1813e3b5997d8ec76c801db2d5c59baf780573fb496da867d90d7017f0/);
});
