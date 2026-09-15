import test from 'node:test';
import assert from 'node:assert/strict';
import { compileObjectiveSubstitution } from '../src/uberreach-objective-substitution.mjs';

const NOW = new Date('2026-09-16T00:00:00.000Z');
const endpoint = (recipientId, endpointId, channel = 'WEB_CONTACT') => ({
  recipientId,
  endpointId,
  channel,
  observedAt: '2026-09-15T23:30:00.000Z',
  evidenceRef: `receipt:${endpointId}`,
  publicOrAuthorized: true,
  platformTermsCompatible: true,
  suppressed: false
});

test('reaches target through legitimate non-SMTP channels without claiming SMTP equivalence', () => {
  const opportunities = Array.from({ length: 3 }, (_, i) => ({ opportunityId: `o${i}`, recipientId: `r${i}` }));
  const endpoints = opportunities.map((_, i) => endpoint(`r${i}`, `e${i}`, i === 0 ? 'EMAIL' : 'WEB_CONTACT'));
  const r = compileObjectiveSubstitution({ opportunities, endpoints, target: 3, now: NOW });
  assert.equal(r.state, 'ECONOMIC_REACH_TARGET_READY');
  assert.equal(r.uniqueReachableRecipients, 3);
  assert.equal(r.substitution.nonEmailReach, 2);
  assert.equal(r.smtpEquivalent, false);
  assert.equal(r.substitution.replacesSmtpCertificate, false);
  assert.equal(r.automaticContactAuthority, false);
  assert.equal(r.externalEffectAuthority, 'NONE');
});

test('deduplicates recipients so route multiplicity cannot inflate reach', () => {
  const opportunities = [
    { opportunityId: 'o1', recipientId: 'r1' },
    { opportunityId: 'o2', recipientId: 'r1' }
  ];
  const endpoints = [endpoint('r1', 'e1', 'WEB_CONTACT'), endpoint('r1', 'e2', 'MATRIX')];
  const r = compileObjectiveSubstitution({ opportunities, endpoints, target: 2, now: NOW });
  assert.equal(r.uniqueReachableRecipients, 1);
  assert.equal(r.state, 'PARTIAL_ECONOMIC_REACH');
});

test('refuses stale or unauthorized endpoints through the underlying UberReach gate', () => {
  const opportunities = [{ opportunityId: 'o1', recipientId: 'r1' }];
  const endpoints = [{ ...endpoint('r1', 'e1'), publicOrAuthorized: false }];
  const r = compileObjectiveSubstitution({ opportunities, endpoints, target: 1, now: NOW });
  assert.equal(r.state, 'NO_LEGITIMATE_REACH');
  assert.equal(r.uniqueReachableRecipients, 0);
});

test('does not turn an unready SMTP certificate into send authority', () => {
  const opportunities = [{ opportunityId: 'o1', recipientId: 'r1' }];
  const endpoints = [endpoint('r1', 'e1', 'ATTENTION_API')];
  const r = compileObjectiveSubstitution({
    opportunities,
    endpoints,
    target: 1,
    now: NOW,
    smtpCertificate: { state: 'WAIT_EXTERNAL_EVIDENCE', oneButton100kPressAvailable: false }
  });
  assert.equal(r.smtpReady, false);
  assert.equal(r.automaticSendAuthority, false);
  assert.equal(r.businessEffectAuthority, 'NONE');
});
