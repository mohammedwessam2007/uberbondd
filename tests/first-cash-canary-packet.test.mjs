import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FIRST_CASH_CONTACT_GATES,
  FIRST_CASH_OFFER,
  FIRST_CASH_QUESTIONS,
  canaryVerdictForConversation,
  compileFirstCashCanaryPacket,
  deriveCanContact
} from '../src/first-cash-canary-packet.mjs';
import { containsSecretValue } from '../src/secret-patterns.mjs';

const AT = new Date('2026-09-02T00:00:00.000Z');
const providers = JSON.parse(readFileSync('artifacts/outreach/free-first-provider-registry-2026-09-01.json', 'utf8')).providers;
const packet = (overrides = {}) => compileFirstCashCanaryPacket({ providers, date: AT, ...overrides });

test('the packet answers every question it declares', () => {
  const report = packet();
  assert.equal(report.ok, true);
  assert.equal(report.questions.length, FIRST_CASH_QUESTIONS.length);
  for (const answered of report.questions) {
    assert.ok(answered.question, 'a question with no text');
    assert.ok(answered.answer, `${answered.id}: no answer`);
    assert.ok(answered.status, `${answered.id}: no status`);
  }
});

test('contact is not permitted today, and the reasons are the real gates', () => {
  const report = packet();
  assert.equal(report.canContact, false);
  assert.equal(report.status, 'NO_CONTACT_PERMITTED');

  // The cold-B2B refusal is the one that comes from measurement rather than
  // from an unset flag: no reviewed free provider permits cold outreach.
  assert.notEqual(report.gates.coldB2bTransportRoute.status, 'READY');
});

test('opening any single gate still does not permit contact', () => {
  // canContact is a conjunction over every gate. If one gate could carry it,
  // then a provider account alone would authorize contacting strangers.
  for (const gate of FIRST_CASH_CONTACT_GATES) {
    const gates = Object.fromEntries(FIRST_CASH_CONTACT_GATES.map(name => [
      name, { satisfied: name === gate }
    ]));
    assert.equal(deriveCanContact(gates), false, `${gate} alone permitted contact`);
  }
  const allOpen = Object.fromEntries(FIRST_CASH_CONTACT_GATES.map(name => [name, { satisfied: true }]));
  assert.equal(deriveCanContact(allOpen), true, 'no combination of gates could ever permit contact');
});

test('the five-conversation canary law is executable, not prose', () => {
  assert.equal(canaryVerdictForConversation(1), 'CONTINUE');
  assert.equal(canaryVerdictForConversation(4), 'CONTINUE');
  assert.equal(canaryVerdictForConversation(5), 'DECISION_REQUIRED_KILL_OR_RETHINK');
  // A sixth conversation with no paid pilot is the exact failure the law
  // exists to prevent: widening volume to avoid learning from rejection.
  assert.equal(canaryVerdictForConversation(6), 'CANARY_LIMIT_EXCEEDED_KILL');
  assert.equal(canaryVerdictForConversation(50), 'CANARY_LIMIT_EXCEEDED_KILL');
});

test('the canary doctrine the packet carries is the one the verdict function enforces', () => {
  const doctrine = packet().canaryDoctrine;
  assert.equal(doctrine.maxQualifiedConversations, 5);
  // Prose and behaviour agreeing is the point: a doctrine documented as five
  // and enforced as six is worse than no doctrine.
  assert.equal(canaryVerdictForConversation(doctrine.maxQualifiedConversations), 'DECISION_REQUIRED_KILL_OR_RETHINK');
  assert.equal(canaryVerdictForConversation(doctrine.maxQualifiedConversations + 1), 'CANARY_LIMIT_EXCEEDED_KILL');
});

test('the offer is the champion at its hypothesised price, stated as a hypothesis', () => {
  assert.equal(FIRST_CASH_OFFER.priceCents, 45000);
  assert.equal(FIRST_CASH_OFFER.currency, 'USD');
  const report = packet();
  assert.equal(report.offer.priceCents, 45000);
});

test('commercial truth is zero and the packet cannot move it', () => {
  const report = packet();
  assert.deepEqual(report.commercialTruth, {
    realCustomers: 0, clearedRevenueCents: 0, acceptedPaidDeliveries: 0, retainedCustomers: 0
  });
  assert.ok(report.blockingGates.length > 0, 'no gate was blocking while contact was refused');
  assert.equal(report.businessEffectAuthority, 'NONE');
  for (const value of Object.values(report.externalEffectLedger)) assert.equal(value, 0);
});

test('the packet is deterministic and carries nothing credential-shaped', () => {
  assert.deepEqual(packet(), packet());
  const offenders = [];
  const walk = (value, path) => {
    if (typeof value === 'string') { if (containsSecretValue(value)) offenders.push(path); return; }
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
  };
  walk(packet(), 'packet');
  assert.deepEqual(offenders, []);
});
