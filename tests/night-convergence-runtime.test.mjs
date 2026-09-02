import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createModelExecutorFactory,
  describeProviderReadiness,
  pricingFrom
} from '../src/agent-model-executor-factory.mjs';
import { inspectModelProviderReadiness } from '../src/model-provider-doctor.mjs';
import { selectFreeRoute, liveUsableCapacity } from '../src/free-first-outreach-router.mjs';
import { compileDomainPurposePlan, evaluateDomainObservation } from '../src/domain-purpose-plan.mjs';
import { classifyFounderAbsenceBlockers } from '../src/founder-absence-blocker-doctor.mjs';
import {
  buildFirstCashCanaryPacket,
  canaryDecision,
  CURRENT_CHAMPION_OFFER
} from '../src/first-cash-canary-packet.mjs';
import { LEAD_PATH_SPRINT_SKU } from '../src/lead-path-sprint-fulfillment.mjs';
import providerRegistry from '../artifacts/outreach/free-first-provider-registry-2026-09-01.json' with { type: 'json' };

const AT = '2026-09-02T00:00:00.000Z';
const registry = providerRegistry.providers;

function gatewayEnv(overrides = {}) {
  return {
    AI_GATEWAY_API_KEY: 'gateway-secret-value-123456',
    AI_GATEWAY_AGENT_ENABLED: 'true',
    AI_GATEWAY_INPUT_USD_PER_MILLION: '1',
    AI_GATEWAY_OUTPUT_USD_PER_MILLION: '2',
    AI_GATEWAY_PRICING_SOURCE: 'official-gateway-pricing:test',
    AI_GATEWAY_PRICING_VERIFIED_AT: '2026-09-01T00:00:00.000Z',
    ...overrides
  };
}

test('ai-gateway readiness uses AI_GATEWAY env mapping and never leaks credential value', () => {
  const env = gatewayEnv();
  const rows = describeProviderReadiness({ env });
  const gateway = rows.find(row => row.provider === 'ai-gateway');
  assert.equal(gateway.ready, true);
  assert.equal(gateway.credentialPresent, true);
  assert.equal(gateway.pricingEvidencePresent, true);
  assert.equal(JSON.stringify(rows).includes(env.AI_GATEWAY_API_KEY), false);

  const doctor = inspectModelProviderReadiness({ env });
  assert.equal(doctor.status, 'SINGLE_ROUTE_READY');
  assert.equal(doctor.gatewayReady, true);
  assert.equal(JSON.stringify(doctor).includes(env.AI_GATEWAY_API_KEY), false);
});

test('pricing evidence rejects negative rates and malformed verification dates', () => {
  assert.equal(pricingFrom(gatewayEnv({ AI_GATEWAY_INPUT_USD_PER_MILLION: '-1' }), 'AI_GATEWAY'), null);
  assert.equal(pricingFrom(gatewayEnv({ AI_GATEWAY_PRICING_VERIFIED_AT: 'not-a-date' }), 'AI_GATEWAY'), null);
  const valid = pricingFrom(gatewayEnv(), 'AI_GATEWAY');
  assert.equal(valid.inputUsdPerMillion, 1);
  assert.equal(valid.outputUsdPerMillion, 2);
  assert.equal(valid.verifiedAt, '2026-09-01T00:00:00.000Z');
});

test('model factory constructs ai-gateway executor from exact protected env mapping', () => {
  const env = gatewayEnv({ AI_GATEWAY_MODEL: 'openai/gpt-5.4' });
  const factory = createModelExecutorFactory({ env });
  const executor = factory({ provider: 'ai-gateway', model: 'openai/gpt-5.4' });
  assert.equal(typeof executor, 'function');
  assert.throws(
    () => createModelExecutorFactory({ env: gatewayEnv({ AI_GATEWAY_API_KEY: '' }) })({ provider: 'ai-gateway' }),
    /credential is absent/
  );
});

test('LIVE free-first route refuses forged raw provider state and requires activation receipts', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const forged = {
    'resend-free': {
      configured: true,
      active: true,
      domainAuthenticated: true,
      providerHealthy: true
    }
  };
  const result = selectFreeRoute({
    purpose: 'TRANSACTIONAL',
    providers: [provider],
    mode: 'LIVE',
    providerStates: forged,
    at: AT
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['live-provider-states-must-be-derived-from-activation-receipts']);

  const capacity = liveUsableCapacity({
    providers: [provider],
    providerStates: forged,
    at: AT
  });
  assert.equal(capacity.ok, false);
  assert.deepEqual(capacity.reasonCodes, ['live-provider-states-must-be-derived-from-activation-receipts']);
});

test('PLAN routing keeps legacy planning compatibility without granting execution authority', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const planned = selectFreeRoute({
    purpose: 'TRANSACTIONAL',
    providers: [provider],
    providerStates: {
      'resend-free': { configured: true, active: true, domainAuthenticated: true, providerHealthy: true }
    },
    mode: 'PLAN',
    at: AT
  });
  assert.equal(planned.ok, true);
  assert.equal(planned.route.mode, 'PLAN');
  assert.equal(planned.route.executionAuthority, 'NONE');
});

test('domain planner refuses unowned roots and generated DNS expectations never become observed proof', () => {
  assert.equal(compileDomainPurposePlan({ rootDomain: 'not-uberbond.example' }).ok, false);
  const plan = compileDomainPurposePlan({
    rootDomain: 'uberbond.agency',
    assignments: {
      APP_PRODUCT: 'uberbond.agency',
      OUTBOUND: 'out.uberbond.agency',
      INBOUND_REPLIES: 'reply.uberbond.agency',
      TRACKING: 'track.uberbond.agency',
      TRANSACTIONAL: 'tx.uberbond.agency',
      TESTING: 'test.uberbond.agency'
    },
    providerRequirements: {
      OUTBOUND: { requiresTls: true },
      TRACKING: { requiresTls: true },
      TRANSACTIONAL: { requiresTls: true }
    }
  });
  assert.equal(plan.ok, true);
  const outbound = plan.rows.find(row => row.purpose === 'OUTBOUND');
  const observation = evaluateDomainObservation({
    planRow: outbound,
    observation: {
      observedAt: '2026-09-01T23:00:00.000Z',
      status: 'GREEN',
      tlsVerified: true,
      generatedExpectedRecords: true
    },
    now: AT
  });
  assert.equal(observation.state, 'CONFIGURED');
  assert.ok(observation.reasonCodes.includes('generated-expectations-are-not-observed-proof'));
});

test('founder absence doctor distinguishes software readiness from external and elapsed proof', () => {
  assert.equal(classifyFounderAbsenceBlockers({ credentials: ['ai-key-missing'] }).overall, 'CREDENTIAL_BLOCKED');
  assert.equal(classifyFounderAbsenceBlockers({}).overall, 'ELAPSED_EVIDENCE_PENDING');
  const proven = classifyFounderAbsenceBlockers({
    observationProof: {
      ok: true,
      reasonCodes: [],
      observationProof: { sourceCommit: 'abc123' }
    }
  });
  assert.equal(proven.overall, 'CODE_READY');
});

test('first-cash packet is bound to canonical Lead-Path name and SKU and stays authority-free', () => {
  const packet = buildFirstCashCanaryPacket({
    gates: {
      jurisdictionApproved: true,
      providerPurposeAllowed: false,
      contactProvenanceApproved: true,
      senderReady: true,
      authorityGranted: true,
      canaryOpen: true
    },
    qualifiedConversationCount: 5,
    paidPilotCount: 0
  });
  assert.equal(CURRENT_CHAMPION_OFFER, 'White-label Lead-Path Revenue Leak Evidence Sprint');
  assert.equal(packet.offer, CURRENT_CHAMPION_OFFER);
  assert.equal(packet.sku, LEAD_PATH_SPRINT_SKU);
  assert.equal(packet.canContact, false);
  assert.equal(packet.canaryDecision, 'KILL_OR_RETHINK');
  assert.equal(packet.businessEffectAuthority, 'NONE');
  assert.deepEqual(packet.commercialTruth, {
    realCustomers: 0,
    clearedRevenueUsd: 0,
    acceptedPaidDeliveries: 0,
    retainedCustomers: 0
  });
});

test('first-cash canary rejects impossible payment/conversation counts', () => {
  assert.equal(canaryDecision({ qualifiedConversationCount: 0, paidPilotCount: 1 }), 'INVALID');
  assert.equal(canaryDecision({ qualifiedConversationCount: -1, paidPilotCount: 0 }), 'INVALID');
});
