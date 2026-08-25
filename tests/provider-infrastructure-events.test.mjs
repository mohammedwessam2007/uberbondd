import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInfrastructureReplay,
  foldInfrastructureEvents,
  normalizeInfrastructureEvent
} from '../src/provider-infrastructure-events.mjs';

const body = {
  event: 'order.mailbox.active',
  timestamp: '2026-08-25T10:00:00.000Z',
  workspace_id: 'ws_1',
  data: {
    mailbox_count: 1,
    mailboxes: [{ mailbox_id: 'm1', username: 'outreach@uberbond.cloud', password: 'never-store-this' }]
  }
};

test('infrastructure events are normalized with stable occurrence identity and secret removal', () => {
  const first = normalizeInfrastructureEvent(body, { provider: 'icemail', rawBody: JSON.stringify(body), receivedAt: '2026-08-25T10:01:00.000Z' });
  const second = normalizeInfrastructureEvent(body, { provider: 'icemail', rawBody: JSON.stringify(body), receivedAt: '2026-08-25T10:01:00.000Z' });
  assert.equal(first.eventType, 'MAILBOX_ACTIVE');
  assert.equal(first.authenticated, false);
  assert.equal(first.disposition, 'QUARANTINED_UNAUTHENTICATED');
  assert.equal(first.providerEventKey, second.providerEventKey);
  assert.equal(first.items[0].password, undefined);
  assert.equal(first.items[0].address, 'outreach@uberbond.cloud');
  assert.equal(classifyInfrastructureReplay(first, []).status, 'NEW_OCCURRENCE');
  assert.equal(classifyInfrastructureReplay(second, [first.providerEventKey]).status, 'IDEMPOTENT_REPLAY');
});

test('provider payload cannot overwrite canonical resource identity or grow unbounded nested state', () => {
  const nested = { value: 'leaf' };
  nested.child = nested;
  const event = normalizeInfrastructureEvent({
    event: 'order.mailbox.active',
    timestamp: '2026-08-25T10:00:00.000Z',
    data: { mailboxes: [{ mailbox_id: 'm1', resourceId: 'forged-id', nested }] }
  }, { provider: 'icemail', signatureVerified: true, receivedAt: '2026-08-25T10:01:00.000Z' });
  assert.equal(event.items[0].resourceId, 'm1');
  assert.equal(event.items[0].nested.child.child.child, null);
});

test('unknown or unauthenticated infrastructure events cannot change readiness', () => {
  const unknown = normalizeInfrastructureEvent({ event: 'provider.secret.event', timestamp: '2026-08-25T10:00:00.000Z', data: { mailbox_id: 'm1' } }, { provider: 'mailforge', signatureVerified: true, receivedAt: '2026-08-25T10:01:00.000Z' });
  const unauthenticated = normalizeInfrastructureEvent(body, { provider: 'icemail', signatureVerified: false, receivedAt: '2026-08-25T10:01:00.000Z' });
  const folded = foldInfrastructureEvents([unknown, unauthenticated]);
  assert.equal(unknown.eventType, 'UNKNOWN');
  assert.equal(unknown.disposition, 'QUARANTINED_UNKNOWN_EVENT');
  assert.equal(folded.resources.length, 0);
  assert.equal(folded.quarantinedEventCount, 2);
});

test('folding is monotonic under out-of-order provider events', () => {
  const active = normalizeInfrastructureEvent(body, { provider: 'icemail', signatureVerified: true, receivedAt: '2026-08-25T10:01:00.000Z' });
  const failed = normalizeInfrastructureEvent({
    event: 'order.mailbox.failed',
    timestamp: '2026-08-25T09:00:00.000Z',
    workspace_id: 'ws_1',
    data: { failed_mailboxes: [{ mailbox_id: 'm1', username: 'outreach@uberbond.cloud', error_message: 'old failure' }] }
  }, { provider: 'icemail', signatureVerified: true, receivedAt: '2026-08-25T10:02:00.000Z' });
  const folded = foldInfrastructureEvents([active, failed]);
  assert.equal(folded.resources.length, 1);
  assert.equal(folded.resources[0].state, 'ACTIVE');
  assert.equal(folded.acceptedEventCount, 2);
});
