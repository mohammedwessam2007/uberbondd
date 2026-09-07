import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createPortablePayPalBridge } from '../src/portable-paypal-bridge.mjs';

function responseCapture() {
  return { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = Buffer.from(body); } };
}

test('portable PayPal bridge preserves raw webhook bytes and routes status/headers', async () => {
  let observed;
  const handler = createPortablePayPalBridge({
    coreHandler: async () => {},
    handlers: {
      webhook: async request => { observed = Buffer.from(await request.arrayBuffer()); return new Response('ack', { status: 202, headers: { 'x-test': 'kept' } }); }
    }
  });
  const res = responseCapture();
  const raw = Buffer.from('{"event_type":"PAYMENT.CAPTURE.COMPLETED","amount":1}');
  await handler({ method: 'POST', url: '/api/webhooks/paypal', headers: { 'paypal-transmission-id': 'x' }, [Symbol.asyncIterator]: () => Readable.from(raw)[Symbol.asyncIterator]() }, res);
  assert.deepEqual(observed, raw);
  assert.equal(res.status, 202);
  assert.equal(res.headers['x-test'], 'kept');
});

test('portable PayPal bridge delegates unrelated routes to canonical server', async () => {
  let delegated = false;
  const handler = createPortablePayPalBridge({ coreHandler: async () => { delegated = true; }, handlers: {} });
  await handler({ method: 'GET', url: '/api/health', headers: {} }, {});
  assert.equal(delegated, true);
});
