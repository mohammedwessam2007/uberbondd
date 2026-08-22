import test from 'node:test';
import assert from 'node:assert/strict';
import { compileInboundFeedbackEvent, compileInboundLocalIntents } from '../src/inbound-feedback-kernel.mjs';

const b64 = text => Buffer.from(text).toString('base64url');
function message({ id = 'm-1', threadId = 't-1', from = 'Buyer <buyer@example.com>', subject = 'Re: hello', body = 'secret body', extraHeaders = [] } = {}) {
  return {
    id,
    threadId,
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
        { name: 'In-Reply-To', value: '<sent-123@example.invalid>' },
        ...extraHeaders
      ],
      body: { data: b64(body) }
    }
  };
}

test('inbound event persists classification and routing refs, not raw message content', () => {
  const event = compileInboundFeedbackEvent({
    message: message({ body: 'TOP SECRET BUYER BODY' }),
    routingRefs: { contactRef: 'contact:1', campaignRef: 'campaign:1', sendRef: 'send:1' },
    privacyHmacKey: 'privacy-key-at-least-16-bytes',
    evidence: 'TEST_FIXTURE',
    date: new Date('2026-08-22T00:00:00Z')
  });
  assert.equal(event.ok, true);
  assert.equal(event.category, 'reply');
  assert.equal(event.evidenceClass, 'TEST_FIXTURE');
  assert.equal(event.routingRefs.contactRef, 'contact:1');
  assert.equal(event.privacy.rawHeadersPersisted, false);
  assert.equal(event.privacy.rawBodyPersisted, false);
  assert.ok(event.privacy.senderAddressHmac);
  assert.equal(JSON.stringify(event).includes('TOP SECRET BUYER BODY'), false);
  assert.equal(JSON.stringify(event).includes('buyer@example.com'), false);
});

test('event identity is stable for the same provider message and account occurrence', () => {
  const first = compileInboundFeedbackEvent({ message: message(), routingRefs: { accountRef: 'acct:1' } });
  const second = compileInboundFeedbackEvent({ message: message(), routingRefs: { accountRef: 'acct:1' }, date: new Date('2030-01-01') });
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.eventDigest, second.eventDigest);
});

test('same provider message on a different account cannot collide', () => {
  const first = compileInboundFeedbackEvent({ message: message(), routingRefs: { accountRef: 'acct:1' } });
  const second = compileInboundFeedbackEvent({ message: message(), routingRefs: { accountRef: 'acct:2' } });
  assert.notEqual(first.eventId, second.eventId);
});

test('missing provider message id fails closed', () => {
  const result = compileInboundFeedbackEvent({ message: { payload: {} } });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('provider-message-id-required'));
});

test('reply produces only local unexecuted stop + replied recommendations', () => {
  const event = compileInboundFeedbackEvent({ message: message(), routingRefs: { contactRef: 'contact:1' } });
  const compiled = compileInboundLocalIntents(event);
  assert.deepEqual(compiled.intents.map(x => x.action), ['STOP_FOLLOWUP', 'MARK_REPLIED']);
  assert.ok(compiled.intents.every(x => x.executionStatus === 'NOT_RUN' && x.authority === 'NONE'));
});

test('unsubscribe and complaint compile suppression without executing it', () => {
  const unsub = compileInboundFeedbackEvent({ message: message({ subject: 'Please unsubscribe me' }) });
  const complaint = compileInboundFeedbackEvent({ message: message({ subject: 'Spam complaint received', body: 'formal abuse report' }) });
  assert.ok(compileInboundLocalIntents(unsub).intents.some(x => x.action === 'SUPPRESS_CONTACT'));
  const actions = compileInboundLocalIntents(complaint).intents.map(x => x.action);
  assert.ok(actions.includes('SUPPRESS_CONTACT'));
  assert.ok(actions.includes('FLAG_SENDER_HEALTH'));
});

test('bounce marks route invalid, OOO pauses, unknown does nothing', () => {
  const bounce = compileInboundFeedbackEvent({ message: message({ from: 'mailer-daemon@example.com', subject: 'Undelivered Mail' }) });
  assert.ok(compileInboundLocalIntents(bounce).intents.some(x => x.action === 'MARK_ROUTE_INVALID'));

  const ooo = compileInboundFeedbackEvent({ message: message({ subject: 'Automatic reply: Out of Office', extraHeaders: [{ name: 'Auto-Submitted', value: 'auto-replied' }] }) });
  assert.deepEqual(compileInboundLocalIntents(ooo).intents.map(x => x.action), ['PAUSE_FOLLOWUP']);

  const unknownMessage = message({ subject: 'Newsletter', body: 'ordinary' });
  unknownMessage.payload.headers = [{ name: 'From', value: 'news@example.com' }, { name: 'Subject', value: 'Newsletter' }];
  const unknown = compileInboundFeedbackEvent({ message: unknownMessage });
  const none = compileInboundLocalIntents(unknown);
  assert.equal(none.status, 'NO_ACTION_RECOMMENDED');
  assert.deepEqual(none.intents, []);
});

test('compiled event and local intents carry all-zero effect ledgers', () => {
  const event = compileInboundFeedbackEvent({ message: message() });
  const compiled = compileInboundLocalIntents(event);
  assert.ok(Object.values(event.externalEffectLedger).every(v => v === 0));
  assert.ok(Object.values(compiled.externalEffectLedger).every(v => v === 0));
  assert.ok(compiled.intents.every(intent => Object.values(intent.externalEffectLedger).every(v => v === 0)));
});
