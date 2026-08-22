import test from 'node:test';
import assert from 'node:assert/strict';
import { boundHeaders, parseInboundMime, classifyInboundEvent } from '../src/inbound-classify.mjs';

const b64 = text => Buffer.from(text).toString('base64url');

test('inbound classifier extracts simple text/plain body', () => {
  const result = parseInboundMime({ mimeType: 'text/plain', body: { data: b64('hello there') } });
  assert.equal(result.body, 'hello there');
  assert.equal(result.truncated, false);
});

test('inbound classifier concatenates nested plain text bodies', () => {
  const result = parseInboundMime({
    mimeType: 'multipart/alternative',
    parts: [
      { mimeType: 'text/plain', body: { data: b64('first') } },
      { mimeType: 'multipart/mixed', parts: [{ mimeType: 'text/plain', body: { data: b64('second') } }] }
    ]
  });
  assert.equal(result.body, 'first\nsecond');
});

test('inbound MIME depth is bounded', () => {
  let payload = { mimeType: 'text/plain', body: { data: b64('deep') } };
  for (let i = 0; i < 50; i += 1) payload = { mimeType: 'multipart/mixed', parts: [payload] };
  const result = parseInboundMime(payload, { maxMimeDepth: 5, maxMimePartCount: 1000, maxDecodedBodyBytes: 100000 });
  assert.equal(result.truncated, true);
  assert.equal(result.body, '');
});

test('inbound MIME part count is bounded', () => {
  const payload = { mimeType: 'multipart/mixed', parts: Array.from({ length: 500 }, (_, i) => ({ mimeType: 'text/plain', body: { data: b64(`part-${i}`) } })) };
  const result = parseInboundMime(payload, { maxMimeDepth: 10, maxMimePartCount: 10, maxDecodedBodyBytes: 100000 });
  assert.equal(result.truncated, true);
  assert.ok(result.partCount <= 11);
});

test('inbound decoded body bytes are bounded', () => {
  const payload = { mimeType: 'multipart/mixed', parts: Array.from({ length: 20 }, () => ({ mimeType: 'text/plain', body: { data: b64('x'.repeat(1000)) } })) };
  const result = parseInboundMime(payload, { maxMimeDepth: 10, maxMimePartCount: 1000, maxDecodedBodyBytes: 5000 });
  assert.equal(result.truncated, true);
  assert.ok(result.bytesUsed <= 5000);
});

test('header count and value bytes are bounded', () => {
  const raw = Array.from({ length: 200 }, (_, i) => ({ name: `X-${i}`, value: 'x'.repeat(200) }));
  const result = boundHeaders(raw, { maxHeaderCount: 10, maxHeaderValueBytes: 16 });
  assert.equal(Object.keys(result.headers).length, 10);
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.headers['x-0']) <= 16);
});

test('classification covers bounce complaint unsubscribe OOO reply and unknown', () => {
  assert.equal(classifyInboundEvent({ headers: { from: 'mailer-daemon@example.com', subject: 'Undelivered Mail' } }).category, 'bounce');
  assert.equal(classifyInboundEvent({ headers: { subject: 'Spam complaint received' }, body: 'abuse report' }).category, 'complaint');
  assert.equal(classifyInboundEvent({ headers: { subject: 'Please unsubscribe me' } }).category, 'unsubscribe');
  assert.equal(classifyInboundEvent({ headers: { subject: 'Automatic reply: Out of Office', 'auto-submitted': 'auto-replied' } }).category, 'out-of-office');
  assert.equal(classifyInboundEvent({ headers: { 'in-reply-to': '<x@example.com>' } }).category, 'reply');
  assert.equal(classifyInboundEvent({ headers: { subject: 'Newsletter' }, body: 'ordinary' }).category, 'unknown');
});

test('classification is label-only and has no send action', () => {
  const result = classifyInboundEvent({ headers: { 'in-reply-to': '<x@example.com>' } });
  assert.deepEqual(Object.keys(result).sort(), ['category', 'confidence']);
  assert.equal('send' in result, false);
  assert.equal('reply' in result, false);
});
