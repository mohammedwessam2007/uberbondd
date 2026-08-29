import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOverpassWithPolicy, resetOverpassThrottleForTests } from '../src/overpass-throttle.mjs';

const response = (status, retryAfter = null) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => name.toLowerCase() === 'retry-after' ? retryAfter : null }
});

test.beforeEach(() => resetOverpassThrottleForTests());

test('Overpass policy serializes concurrent calls for the same endpoint', async () => {
  const order = [];
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    const id = calls;
    order.push(`start-${id}`);
    if (id === 1) await firstGate;
    order.push(`end-${id}`);
    return response(200);
  };
  const options = { minIntervalMs: 0, timeoutMs: 1000 };
  const first = fetchOverpassWithPolicy(fetcher, 'https://overpass.test/api', {}, options);
  const second = fetchOverpassWithPolicy(fetcher, 'https://overpass.test/api', {}, options);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ['start-1']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['start-1', 'end-1', 'start-2', 'end-2']);
});

test('Overpass policy retries retryable HTTP responses with bounded attempts', async () => {
  const statuses = [503, 429, 200];
  const sleeps = [];
  let now = 1000;
  let calls = 0;
  const fetcher = async () => {
    const status = statuses[calls++];
    return response(status, status === 429 ? '2' : null);
  };
  const result = await fetchOverpassWithPolicy(fetcher, 'https://overpass.test/api', {}, {
    maxAttempts: 3,
    minIntervalMs: 0,
    timeoutMs: 1000,
    now: () => now,
    sleep: async ms => { sleeps.push(ms); now += ms; }
  });
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [5000, 2000]);
});

test('Overpass policy does not retry nonretryable HTTP failures', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return response(400); };
  await assert.rejects(
    fetchOverpassWithPolicy(fetcher, 'https://overpass.test/api', {}, { maxAttempts: 5, minIntervalMs: 0, timeoutMs: 1000 }),
    error => error?.status === 400 && error?.retryable === false
  );
  assert.equal(calls, 1);
});

test('Overpass policy fails closed after retryable attempt cap', async () => {
  let calls = 0;
  let now = 0;
  const fetcher = async () => { calls += 1; return response(503); };
  await assert.rejects(
    fetchOverpassWithPolicy(fetcher, 'https://overpass.test/api', {}, {
      maxAttempts: 2,
      minIntervalMs: 0,
      timeoutMs: 1000,
      now: () => now,
      sleep: async ms => { now += ms; }
    }),
    error => error?.status === 503 && error?.retryable === true
  );
  assert.equal(calls, 2);
});

test('Overpass policy retries transport errors only up to the configured cap', async () => {
  let calls = 0;
  let now = 0;
  const fetcher = async () => { calls += 1; throw new Error('network-down'); };
  await assert.rejects(
    fetchOverpassWithPolicy(fetcher, 'https://overpass.test/api', {}, {
      maxAttempts: 2,
      minIntervalMs: 0,
      timeoutMs: 1000,
      now: () => now,
      sleep: async ms => { now += ms; }
    }),
    /network-down/
  );
  assert.equal(calls, 2);
});
