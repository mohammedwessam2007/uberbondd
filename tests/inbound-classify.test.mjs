import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInboundMime, classifyInboundEvent } from '../src/inbound-classify.mjs';

const b64 = text => Buffer.from(text).toString('base64url');

test('extracts a plain text body from a simple message', () => {
  const result = parseInboundMime({ mimeType: 'text/plain', body: { data: b64('hello there') } });
  assert.equal(result.body, 'hello there');
  assert.equal(result.truncated, false);
});

test('extracts and concatenates nested multipart text/plain bodies', () => {
  const payload = {
    mimeType: 'multipart/alternative',
    parts: [
      { mimeType: 'text/plain', body: { data: b64('first part') } },
      { mimeType: 'multipart/mixed', parts: [{ mimeType: 'text/plain', body: { data: b64('second part') } }] }
    ]
  };
  const result = parseInboundMime(payload);
  assert.equal(result.body, 'first part\nsecond part');
  assert.equal(result.truncated, false);
});

test('INB: MIME depth beyond the limit is truncated, not infinitely recursed', () => {
  let payload = { mimeType: 'text/plain', body: { data: b64('deepest') } };
  for (let i = 0; i < 50; i += 1) payload = { mimeType: 'multipart/mixed', parts: [payload] };
  const result = parseInboundMime(payload, { maxMimeDepth: 5, maxMimePartCount: 1000, maxDecodedBodyBytes: 100000 });
  assert.equal(result.truncated, true);
  assert.equal(result.body, '');
});

test('INB: part count beyond the limit stops processing further parts', () => {
  const parts = Array.from({ length: 500 }, (_, i) => ({ mimeType: 'text/plain', body: { data: b64(`part-${i}`) } }));
  const payload = { mimeType: 'multipart/mixed', parts };
  const result = parseInboundMime(payload, { maxMimeDepth: 10, maxMimePartCount: 10, maxDecodedBodyBytes: 100000 });
  assert.equal(result.truncated, true);
  assert.ok(result.partCount <= 11, `expected bounded part count, got ${result.partCount}`);
});

test('INB: decoded body size beyond the limit is truncated, not unbounded', () => {
  const huge = 'x'.repeat(1000);
  const payload = { mimeType: 'multipart/mixed', parts: Array.from({ length: 20 }, () => ({ mimeType: 'text/plain', body: { data: b64(huge) } })) };
  const result = parseInboundMime(payload, { maxMimeDepth: 10, maxMimePartCount: 1000, maxDecodedBodyBytes: 5000 });
  assert.equal(result.truncated, true);
  assert.ok(result.bytesUsed <= 5000, `expected bounded bytes, got ${result.bytesUsed}`);
});

test('INB: malformed base64 in a part is skipped and marked truncated, not thrown', () => {
  const payload = { mimeType: 'text/plain', body: { data: '###not-valid-base64###' } };
  assert.doesNotThrow(() => parseInboundMime(payload));
});

test('INB: malformed/non-object payload does not throw', () => {
  assert.doesNotThrow(() => parseInboundMime(null));
  assert.doesNotThrow(() => parseInboundMime(undefined));
  assert.doesNotThrow(() => parseInboundMime('not an object'));
  assert.doesNotThrow(() => parseInboundMime({ parts: 'not an array' }));
});

test('classifies a Mailer-Daemon bounce', () => {
  const result = classifyInboundEvent({ headers: { from: 'Mail Delivery System <mailer-daemon@example.com>', subject: 'Undelivered Mail Returned to Sender' }, body: '' });
  assert.equal(result.category, 'bounce');
});

test('classifies an abuse/complaint report', () => {
  const result = classifyInboundEvent({ headers: { subject: 'Spam complaint received' }, body: 'This is a formal abuse report' });
  assert.equal(result.category, 'complaint');
});

test('classifies an unsubscribe request', () => {
  const result = classifyInboundEvent({ headers: { subject: 'Please unsubscribe me' }, body: 'take me off your list' });
  assert.equal(result.category, 'unsubscribe');
});

test('classifies an out-of-office auto-reply', () => {
  const result = classifyInboundEvent({ headers: { subject: 'Automatic reply: Out of Office', 'auto-submitted': 'auto-replied' }, body: 'I am currently on vacation' });
  assert.equal(result.category, 'out-of-office');
});

test('classifies a genuine reply via In-Reply-To header', () => {
  const result = classifyInboundEvent({ headers: { subject: 'Re: your audit', 'in-reply-to': '<msg-1@example.com>' }, body: 'Thanks, tell me more' });
  assert.equal(result.category, 'reply');
});

test('classifies an unrecognized message as unknown rather than guessing', () => {
  const result = classifyInboundEvent({ headers: { subject: 'Newsletter' }, body: 'Just a regular newsletter' });
  assert.equal(result.category, 'unknown');
});

test('classification never produces a send/reply action of any kind (label-only return shape)', () => {
  const result = classifyInboundEvent({ headers: { subject: 'Re: hi', 'in-reply-to': '<a@b>' }, body: 'hello' });
  const keys = Object.keys(result);
  assert.deepEqual(keys.sort(), ['category', 'confidence']);
});
