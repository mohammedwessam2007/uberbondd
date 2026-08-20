import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  compileCommercialFirstPaymentPacket,
  logCommercialFirstPaymentPacket,
  COMMERCIAL_FIRST_PAYMENT_PACKET_POLICY_VERSION
} from '../src/commercial-first-payment-packet.mjs';
import { compileAdapterManifest } from '../src/adapter-contracts.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const date = new Date('2026-08-18T10:00:00.000Z');

test('default packet is a seven-day owner-review artifact with all unresolved gates explicit', () => {
  const packet = compileCommercialFirstPaymentPacket({ date });
  assert.equal(packet.ok, true);
  assert.equal(packet.status, 'OWNER_REVIEW_REQUIRED');
  assert.equal(packet.policyVersion, COMMERCIAL_FIRST_PAYMENT_PACKET_POLICY_VERSION);
  assert.equal(packet.mode, 'NO_CONTACT_NO_CHECKOUT_PREPARATION');
  assert.equal(packet.experiment.durationDays, 7);
  assert.equal(packet.experiment.primaryMetric, 'CLEARED_PAYMENT');
  assert.equal(packet.gates.legal.status, 'OWNER_REVIEW_REQUIRED');
  assert.equal(packet.gates.provider.status, 'PROVIDER_CONTRACT_REQUIRED');
  assert.equal(packet.gates.payment.status, 'EXTERNAL_PROOF_REQUIRED');
  assert.ok(packet.blockers.includes('legal-review-required'));
  assert.ok(packet.blockers.includes('first-payment-proof-required'));
  assert.equal(packet.authorization.contact, 'DISABLED');
  assert.equal(packet.externalEffectLedger.spendCents, 0);
});

test('owner attestation and adapter authorization remain review-only and cannot create payment truth', () => {
  const manifest = compileAdapterManifest({
    adapterId: 'public-signal-test',
    sourceKind: 'PUBLIC',
    termsUrl: 'https://example.test/terms',
    purpose: 'Bounded public signal preflight',
    allowedFields: ['url'],
    authStatus: 'OWNER_AUTHORIZED',
    date
  });
  const packet = compileCommercialFirstPaymentPacket({
    date,
    adapterManifest: manifest,
    adapterAuthorizationReceipt: { receiptId: 'owner-auth-1' },
    legalReview: { ownerAttested: true, evidenceRefs: ['owner-review:legal-1'] }
  });
  assert.equal(packet.gates.legal.status, 'OWNER_ATTESTED_REVIEW_ONLY');
  assert.equal(packet.gates.provider.status, 'OWNER_AUTHORIZED_REVIEW_REQUIRED');
  assert.equal(packet.gates.provider.externalEffectLedger.providerCalls, 0);
  assert.equal(packet.gates.payment.truthClassification, 'EXTERNAL_PROOF_REQUIRED');
  assert.ok(packet.blockers.includes('legal-proof-external-required'));
  assert.ok(packet.blockers.includes('provider-live-proof-required'));
  assert.equal(packet.truthClassification.revenue, 'UNPROVEN');
});

test('unknown opportunities fail closed without creating a packet', () => {
  const result = compileCommercialFirstPaymentPacket({ opportunityId: 'not-a-real-opportunity', date });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.reasonCodes.includes('canonical-opportunity-required'));
  assert.equal(result.externalEffectLedger.messages, 0);
});

test('handler and receipt writer use auditLog only and omit experiment steps/raw inputs', async () => {
  const calls = [];
  const handlers = createJobHandlers({
    cfg: {},
    store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: type }; } }
  });
  const packet = await handlers['prometheus.commercial.first_payment_packet']({ date });
  assert.equal(packet.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'commercial_first_payment_packet');
  assert.equal(calls[0].detail.durationDays, 7);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'sevenDaySteps'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'legalReview'), false);
  assert.equal(calls[0].detail.externalEffectLedger.messages, 0);

  const standaloneCalls = [];
  await logCommercialFirstPaymentPacket({ log: async (type, detail) => { standaloneCalls.push({ type, detail }); return { id: 'audit-1' }; } }, packet);
  assert.equal(standaloneCalls.length, 1);
  assert.equal(standaloneCalls[0].detail.packetId, packet.packetId);
});

test('packet compiler has no provider or filesystem boundary of its own', async () => {
  const source = await fs.readFile(new URL('../src/commercial-first-payment-packet.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
