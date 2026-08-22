import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SERVICE_SKU_ZERO_EFFECTS,
  compileServicePortfolio,
  compileServiceSku
} from '../src/service-sku-compiler.mjs';

const opportunity = {
  opportunityId: 'creator-estimate-follow-up',
  mechanismName: { value: 'Estimate Follow-Up' },
  buyer: { value: ['Home services'] },
  painOrTrigger: { value: 'Open estimates age without a decision' }
};

function basePolicy(overrides = {}) {
  return {
    name: 'Estimate Recovery',
    deliverables: ['Open-estimate monitor', 'Authorized reminder preparation', 'Won/lost reconciliation'],
    exclusions: ['No discount commitments', 'No outbound without authorization'],
    integrations: ['CRM', 'Estimate system'],
    evidenceRequiredBeforeSale: ['Authorized source access', 'Confirmed estimate-status field mapping'],
    acceptanceTests: ['All in-scope open estimates are reconciled to the exact authorized source snapshot'],
    price: { amountUsd: 700, interval: 'MONTHLY', claimType: 'CREATOR_CLAIM' },
    setupPrice: { amountUsd: 0, interval: 'ONE_TIME', claimType: 'HYPOTHESIS' },
    estimatedMonthlyDeliveryCostUsd: 100,
    executionAuthority: 'LOCAL_PREPARATION_ONLY',
    killConditions: ['No measurable estimate-recovery event after the bounded test window'],
    expansionRoutes: ['Missed-call text-back', 'Lead follow-up'],
    ...overrides
  };
}

const capabilities = [
  { id: 'crm-state', status: 'AVAILABLE' },
  { id: 'consent-and-suppression', status: 'AVAILABLE' },
  { id: 'message-preparation', status: 'AVAILABLE' },
  { id: 'revenue-attribution', status: 'PARTIAL' }
];

test('compiles a bounded ServiceSKU without granting external consequence', () => {
  const result = compileServiceSku({ opportunity, vertical: 'home-services', capabilities, offerPolicy: basePolicy() });
  assert.equal(result.ok, true);
  assert.equal(result.sku.skuId, 'sku:creator-estimate-follow-up:home-services');
  assert.equal(result.sku.price.amountUsd, 700);
  assert.equal(result.sku.pricingTruth, 'CREATOR_CLAIM_PRICE__NOT_TRANSACTION_PROOF');
  assert.equal(result.sku.externalConsequenceGranted, false);
  assert.equal(result.sku.truth.payment, 'EXTERNAL_PROOF_REQUIRED');
  assert.equal(result.sku.recurringContributionMarginUsd, 600);
  assert.deepEqual(result.externalEffectLedger, SERVICE_SKU_ZERO_EFFECTS);
});

test('unknown execution authority fails closed to local preparation', () => {
  const result = compileServiceSku({
    opportunity,
    vertical: 'home-services',
    capabilities,
    offerPolicy: basePolicy({ executionAuthority: 'SEND_EVERYTHING' })
  });
  assert.equal(result.ok, true);
  assert.equal(result.sku.executionAuthority, 'LOCAL_PREPARATION_ONLY');
  assert.equal(result.sku.externalConsequenceGranted, false);
});

test('creator price can never become transaction-verified price by amount alone', () => {
  const result = compileServiceSku({
    opportunity,
    vertical: 'home-services',
    capabilities,
    offerPolicy: basePolicy({
      price: { amountUsd: 700, interval: 'MONTHLY', claimType: 'CREATOR_CLAIM', verifiedTransactionEvidence: true }
    })
  });
  assert.equal(result.ok, true);
  assert.notEqual(result.sku.pricingTruth, 'TRANSACTION_VERIFIED_PRICE');
});

test('transaction verified pricing requires both VERIFIED_FACT classification and transaction flag', () => {
  const result = compileServiceSku({
    opportunity,
    vertical: 'home-services',
    capabilities,
    offerPolicy: basePolicy({
      price: {
        amountUsd: 700,
        interval: 'MONTHLY',
        claimType: 'VERIFIED_FACT',
        verifiedTransactionEvidence: true,
        sourceRefs: ['provider-transaction-receipt:test-only']
      }
    })
  });
  assert.equal(result.sku.pricingTruth, 'TRANSACTION_VERIFIED_PRICE');
});

test('missing capability blocks delivery preparation without changing the SKU truth', () => {
  const result = compileServiceSku({
    opportunity,
    vertical: 'home-services',
    capabilities: [...capabilities, { id: 'estimate-state', status: 'MISSING' }],
    offerPolicy: basePolicy()
  });
  assert.equal(result.ok, true);
  assert.equal(result.deliveryPlan.status, 'BLOCKED_MISSING_CAPABILITY');
  assert.deepEqual(result.deliveryPlan.missingCapabilities, ['estimate-state']);
  assert.equal(result.sku.truth.sale, 'NOT_PROVEN');
});

test('duplicate capability declarations resolve toward the weaker status', () => {
  const result = compileServiceSku({
    opportunity,
    vertical: 'home-services',
    capabilities: [
      { id: 'crm-state', status: 'AVAILABLE' },
      { id: 'crm-state', status: 'MISSING' },
      { id: 'message-preparation', status: 'AVAILABLE' }
    ],
    offerPolicy: basePolicy()
  });
  assert.equal(result.ok, true);
  const crm = result.sku.capabilities.find(item => item.id === 'crm-state');
  assert.equal(crm.status, 'MISSING');
  assert.equal(result.deliveryPlan.status, 'BLOCKED_MISSING_CAPABILITY');
});

test('acceptance contract forbids self-acceptance and synthetic acceptance', () => {
  const result = compileServiceSku({ opportunity, vertical: 'home-services', capabilities, offerPolicy: basePolicy() });
  assert.equal(result.acceptanceContract.customerEvidenceRequired, true);
  assert.equal(result.acceptanceContract.selfAcceptanceForbidden, true);
  assert.equal(result.acceptanceContract.syntheticEvidenceMayAccept, false);
});

test('compiler rejects underspecified offers instead of inventing plausible defaults', () => {
  assert.equal(compileServiceSku({}).reason, 'malformed-opportunity');
  assert.equal(compileServiceSku({ opportunity, vertical: '', capabilities, offerPolicy: basePolicy() }).reason, 'missing-vertical');
  assert.equal(compileServiceSku({ opportunity, vertical: 'home-services', capabilities: [], offerPolicy: basePolicy() }).reason, 'missing-capability-slice');
  assert.equal(compileServiceSku({
    opportunity,
    vertical: 'home-services',
    capabilities,
    offerPolicy: basePolicy({ deliverables: [] })
  }).reason, 'missing-deliverables');
});

test('portfolio compiler exposes partial failure instead of dropping invalid offers', () => {
  const result = compileServicePortfolio({
    opportunity,
    vertical: 'home-services',
    capabilitySets: [{ id: 'core', capabilities }],
    offerPolicies: [
      { ...basePolicy(), capabilitySetId: 'core' },
      { ...basePolicy({ name: 'Broken', deliverables: [] }), capabilitySetId: 'core' }
    ]
  });
  assert.equal(result.ok, false);
  assert.equal(result.compiled.length, 1);
  assert.deepEqual(result.failures, [{ offerName: 'Broken', reason: 'missing-deliverables' }]);
  assert.deepEqual(result.externalEffectLedger, SERVICE_SKU_ZERO_EFFECTS);
});
