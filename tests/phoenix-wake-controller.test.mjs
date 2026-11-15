import test from 'node:test';
import assert from 'node:assert/strict';
import { createWakeEngine, createWakeServer } from '../scripts/codespace/wake-controller.mjs';

const item = state => ({ name: 'automatic-fortnight-gx6xxpjjp5pjcwxq9', owner: { login: 'uberbond2007' }, repository: { full_name: 'mohammedwessam2007/uberbondd' }, state });
function setup(state = 'Shutdown', extra = {}) {
  const calls = []; let current = item(state);
  const engine = createWakeEngine({ token: 'private-test-token', fetchImpl: async (url, options) => { calls.push({ url, method: options.method }); return { ok: true, json: async () => current }; }, ...extra });
  return { engine, calls, set: x => { current = x; } };
}
test('sleeping wake calls only pinned start endpoint and coalesces requests', async () => {
  const { engine, calls } = setup();
  const r = await Promise.all(Array.from({ length: 8 }, () => engine.wake()));
  assert.ok(r.every(x => x.state === 'STARTING'));
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
  assert.match(calls.at(-1).url, /^https:\/\/api.github.com\/user\/codespaces\/automatic-fortnight-gx6xxpjjp5pjcwxq9\/start$/);
  await engine.wake(); assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});
test('available host never implies READY; repeated wake does not restart', async () => {
  const { engine, calls } = setup('Available');
  assert.equal((await engine.wake()).state, 'RECONNECTING');
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);
});
test('starting and failed provider states do not trigger extra starts', async () => {
  for (const state of ['Starting', 'Failed', 'Unavailable']) {
    const { engine, calls } = setup(state); await engine.wake(); assert.equal(calls.length, 1);
  }
});
test('wrong owner/repository/name refuses start', async () => {
  for (const bad of [{ ...item('Shutdown'), owner: { login: 'wrong' } }, { ...item('Shutdown'), name: 'wrong' }, { ...item('Shutdown'), repository: { full_name: 'wrong' } }]) {
    const s = setup(); s.set(bad); assert.equal((await s.engine.wake()).state, 'BLOCKED'); assert.equal(s.calls.length, 1);
  }
});
test('provider credential/quota errors are bounded and secret-free', async () => {
  for (const status of [401, 403, 404, 429, 503]) {
    const engine = createWakeEngine({ token: 'SECRET', fetchImpl: async () => ({ ok: false, status }) });
    const result = await engine.wake(); assert.equal(result.state, 'BLOCKED'); assert.match(result.reason, new RegExp(String(status))); assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  }
});
test('READY requires fresh success for both connectors and a receipt digest', async () => {
  const evidence = { localServer: true, tunnelConnected: true, phoenixToolSucceeded: true, cosToolSucceeded: true, receiptDigest: 'sha256:' + 'a'.repeat(64), observedAt: 100000 };
  for (const changed of [{}, { observedAt: 1 }, { observedAt: 100001 }, { cosToolSucceeded: false }, { receiptDigest: 'made-up' }]) {
    const { engine } = setup('Available', { now: () => 100000, probe: async () => ({ ...evidence, ...changed }) });
    assert.equal((await engine.status()).state, Object.keys(changed).length ? 'RECONNECTING' : 'READY');
  }
});
test('transport exceptions cannot leak tokens', async () => {
  const engine = createWakeEngine({ token: 'SECRET', fetchImpl: async () => { throw new Error('SECRET'); } });
  assert.doesNotMatch(JSON.stringify(await engine.wake()), /SECRET/);
});
test('HTTP controller denies bad auth, origin and excessive login attempts', async t => {
  let effects = 0;
  const server = createWakeServer({ origin: 'https://wake.example', ownerKey: 'x'.repeat(32), engine: { wake: async () => { effects++; return { state: 'STARTING' }; }, status: async () => ({ state: 'RECONNECTING' }) } });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const url = 'http://127.0.0.1:' + server.address().port;
  const send = (path, body = {}, headers = {}) => fetch(url + path, { method: 'POST', headers: { Origin: 'https://wake.example', 'Content-Type': 'application/json', 'X-Phoenix-Wake': '1', ...headers }, body: JSON.stringify(body) });
  assert.equal((await send('/wake')).status, 401);
  assert.equal((await send('/login', { key: 'x'.repeat(32) }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await send('/login', { key: 'wrong' })).status, 401);
  const login = await send('/login', { key: 'x'.repeat(32) }); assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie'); assert.match(cookie, /Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await send('/wake', {}, { Cookie: cookie.split(';')[0] })).status, 200); assert.equal(effects, 1);
  for (let n = 0; n < 4; n++) await send('/login', { key: 'wrong' });
  assert.equal((await send('/login', { key: 'wrong' })).status, 429);
  assert.doesNotMatch(await (await fetch(url + '/')).text(), /private-test-token/);
});
test('server fails closed on missing secrets or non-HTTPS origin', () => {
  assert.throws(() => createWakeEngine({}));
  assert.throws(() => createWakeServer({ origin: 'http://wake.example', ownerKey: 'x'.repeat(32) }));
  assert.throws(() => createWakeServer({ origin: 'https://wake.example', ownerKey: 'short' }));
});
