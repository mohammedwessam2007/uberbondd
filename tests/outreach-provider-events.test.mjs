import test from 'node:test';
import assert from 'node:assert/strict';

import {
  internalReplyFromProviderEvent,
  normalizeProviderEvent,
  verifyWebhookSignature,
  webhookSignature
} from '../src/outreach-provider-events.mjs';

const secret = 'provider-webhook-secret-for-tests-0123456789';
const receivedAt = new Date('2026-08-12T10:00:00.000Z');

test('signed provider webhook accepts the exact timestamp/body and rejects tampering or replay', () => {
  const body = JSON.stringify({ event_type: 'reply_received', lead_email: 'owner@example.test' });
  const timestamp = String(Math.floor(receivedAt.getTime() / 1000));
  const signature = webhookSignature(body, timestamp, secret);
  assert.equal(verifyWebhookSignature({ rawBody: body, timestamp, signature, secret, now: receivedAt }).ok, true);
  assert.equal(verifyWebhookSignature({ rawBody: `${body} `, timestamp, signature, secret, now: receivedAt }).reason, 'webhook-signature-invalid');
  assert.equal(verifyWebhookSignature({ rawBody: body, timestamp: String(Number(timestamp) - 301), signature, secret, now: receivedAt }).reason, 'webhook-timestamp-expired');
  assert.equal(verifyWebhookSignature({ rawBody: body, timestamp, signature: `sha256=${signature}`, secret, now: receivedAt }).ok, true);
});

test('Instantly reply events normalize into a stable internal event and preserve bounded provider evidence', () => {
  const raw = {
    timestamp: '2026-08-12T09:59:00.000Z',
    event_type: 'reply_received',
    workspace: 'workspace-1',
    campaign_id: 'campaign-1',
    lead_email: 'owner@example.test',
    email_account: 'hello@uberbond.example',
    email_id: 'email-1',
    step: 2,
    variant: 3,
    reply_subject: 'Re: QA',
    reply_text: 'Interested — send details.',
    unibox_url: 'https://app.instantly.ai/unibox/thread-1'
  };
  const event = normalizeProviderEvent(raw, { provider: 'instantly', rawBody: JSON.stringify(raw), receivedAt });
  assert.equal(event.eventType, 'reply');
  assert.equal(event.rawType, 'reply_received');
  assert.equal(event.leadEmail, 'owner@example.test');
  assert.equal(event.emailId, 'email-1');
  assert.equal(event.step, 2);
  assert.equal(event.variant, 3);
  assert.match(event.providerEventKey, /^instantly:reply:/);
  assert.equal(normalizeProviderEvent(raw, { provider: 'instantly', rawBody: JSON.stringify(raw), receivedAt }).providerEventKey, event.providerEventKey);
  assert.equal(Object.hasOwn(event, 'raw'), false);
  const reply = internalReplyFromProviderEvent(event, { prospectId: 'prospect-1', threadId: 'thread-1' });
  assert.equal(reply.prospectId, 'prospect-1');
  assert.equal(reply.threadId, 'thread-1');
  assert.equal(reply.body, 'Interested — send details.');
  assert.equal(reply.classification.label, 'unknown');
});

test('normalized outreach events do not retain provider-only raw payload fields', () => {
  const raw = {
    timestamp: '2026-08-12T09:59:00.000Z',
    event_type: 'reply_received',
    event_id: 'evt-private-1',
    lead_email: 'owner@example.test',
    reply_text_snippet: 'Interested from bounded snippet.',
    provider_customer_name: 'Private Customer Name',
    provider_private_note: 'provider-only-private-marker-7e62',
    billing_address: { street: 'Private Street', city: 'Private City' },
    provider_session_reference: 'provider-session-reference-test-value'
  };
  const event = normalizeProviderEvent(raw, { provider: 'instantly', rawBody: JSON.stringify(raw), receivedAt });
  const serialized = JSON.stringify(event);

  assert.equal(event.providerEventId, 'evt-private-1');
  assert.equal(event.replyBody, 'Interested from bounded snippet.');
  assert.equal(Object.hasOwn(event, 'raw'), false);
  assert.doesNotMatch(serialized, /Private Customer Name/);
  assert.doesNotMatch(serialized, /provider-only-private-marker-7e62/);
  assert.doesNotMatch(serialized, /Private Street/);
  assert.doesNotMatch(serialized, /provider-session-reference-test-value/);

  const reply = internalReplyFromProviderEvent(event, { prospectId: 'prospect-1' });
  assert.equal(reply.body, 'Interested from bounded snippet.');
});

test('internal reply construction does not fall back to a legacy raw provider object', () => {
  const event = normalizeProviderEvent({
    timestamp: '2026-08-12T09:59:00.000Z',
    event_type: 'reply_received',
    event_id: 'evt-no-raw-fallback',
    lead_email: 'owner@example.test'
  }, { provider: 'instantly', rawBody: '{}', receivedAt });

  event.raw = { reply_text_snippet: 'must-not-be-consumed' };
  const reply = internalReplyFromProviderEvent(event, { prospectId: 'prospect-1' });
  assert.equal(reply.body, '');
});

test('unknown provider event types fail closed instead of becoming arbitrary mutations', () => {
  assert.throws(
    () => normalizeProviderEvent({ event_type: 'made_up_event' }, { provider: 'instantly', rawBody: '{}', receivedAt }),
    /Unsupported provider event type/
  );
});
