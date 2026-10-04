import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectProspect, executeFrozenProspect, mountProspectPreflight } from '../public/prospect-preflight-ui.js';

test('read-only frozen validation rejects execution and payload overrides before API access', async () => {
  let calls = 0;
  const request = async () => { calls++; return { validation: { valid: true } }; };
  await assert.rejects(inspectProspect({ request, input: { frozenEffectDigest: 'a'.repeat(64), executeFrozenEffect: true } }), /frozen-preflight-accepts-only-digest/);
  await assert.rejects(inspectProspect({ request, input: { frozenEffectDigest: 'a'.repeat(64), executeFrozenEffect: false } }), /frozen-preflight-accepts-only-digest/);
  await assert.rejects(inspectProspect({ request, input: { executeFrozenEffect: true } }), /execution-flag-forbidden-in-read-only-preflight/);
  assert.equal(calls, 0);
});

test('read-only frozen validation sends only the digest and cannot confer authority', async () => {
  let call;
  const result = await inspectProspect({
    request: async (path, options) => { call = { path, options }; return { validation: { valid: true } }; },
    input: { frozenEffectDigest: 'b'.repeat(64) }
  });
  assert.equal(call.path, '/api/prospect-preflight');
  assert.deepEqual(JSON.parse(call.options.body), { frozenEffectDigest: 'b'.repeat(64) });
  assert.equal(result.readOnly, true);
  assert.equal(result.sendAuthority, false);
  assert.equal(result.externalEffects, 0);
});

test('frozen execution helper accepts one exact lowercase digest and emits only the canonical two-field POST', async () => {
  const digest = 'c'.repeat(64);
  let call;
  await executeFrozenProspect({ request: async (path, options) => { call = { path, options }; return { ok: true }; }, digest });
  assert.equal(call.path, '/api/prospect-preflight');
  assert.equal(call.options.method, 'POST');
  assert.deepEqual(JSON.parse(call.options.body), { frozenEffectDigest: digest, executeFrozenEffect: true });
  assert.deepEqual(Object.keys(JSON.parse(call.options.body)).sort(), ['executeFrozenEffect', 'frozenEffectDigest']);
});

test('malformed or override-bearing execution requests cannot reach the API', async () => {
  const digest = 'd'.repeat(64);
  let calls = 0;
  const request = async () => { calls++; return {}; };
  for (const malformed of ['d'.repeat(63), 'D'.repeat(64), `${digest} `, `${digest.slice(0, 63)}g`]) {
    await assert.rejects(executeFrozenProspect({ request, digest: malformed }), /frozen-effect-digest-invalid/);
  }
  await assert.rejects(executeFrozenProspect({
    request, digest, payload: { subject: 'changed', body: 'changed' }, recipient: 'other@example.com',
    sender: 'other@example.com', route: 'other-route', provider: 'other-provider', authority: true, cap: 9
  }), /frozen-execution-accepts-only-request-and-digest/);
  assert.equal(calls, 0);
});

const digest = 'e'.repeat(64);
const authBlocker = { gate: 'authorization', code: 'founder-signed-authorization-absent-or-unverified' };
function readyFrozenValidation({ recipient = 'partnerships@intelo.ai', routeClass = 'INVITED_GREEN' } = {}) {
  const authorizationValid = { status: 'FAIL', codes: [authBlocker.code] };
  return {
    ok: true,
    state: 'READY_FOR_AUTHORIZATION',
    blockerCodes: [],
    validation: { valid: true, frozenEffectDigest: digest },
    frozenEffect: { digest, expiresAt: '2099-01-01T00:00:00.000Z', maxEffects: 1 },
    effectPackage: {
      finalEffectDigest: digest,
      maxEffects: 1,
      participants: {
        recipient,
        sender: { slot: 'winnr:nadia.chen@cedarpointdomains.com', provider: 'smtp-relay' },
        provider: 'smtp-relay',
        route: { routeClass, providerRouteType: 'INVITED_BUSINESS_CONTACT' }
      }
    },
    globalRoute: {
      green: true,
      routeDigest: 'f'.repeat(64),
      governanceGate: { refused: false, routeType: 'INVITED_BUSINESS_CONTACT' },
      sendPrerequisites: Object.fromEntries(['suppressionClean', 'historyClean', 'identityComplete', 'senderEligible', 'providerAllowed'].map(key => [key, { status: 'PASS' }]))
    },
    oneButton: { sendAuthority: false, gates: { authorizationValid }, blockers: [authBlocker] }
  };
}

function mockElement(value = '') {
  return { value, textContent: '', disabled: false, readOnly: false, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } };
}

function mountFixture({ validation = readyFrozenValidation(), receipt = { state: 'SENT_EXACTLY_ONCE', receipt: { providerReferenceId: 'smtp-ref-1', remainingEffectCap: 0 } } } = {}) {
  const elements = Object.fromEntries([
    ['#prospect-preflight-request', mockElement(JSON.stringify({ frozenEffectDigest: digest }))],
    ['#frozen-effect-digest', mockElement(digest)],
    ['#execute-frozen-effect', mockElement()],
    ['#frozen-effect-execution-result', mockElement()],
    ['#frozen-effect-execution-form', mockElement()],
    ['#run-prospect-preflight', mockElement()],
    ['#prospect-preflight-result', mockElement()],
  ]);
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    return calls.length === 1 ? validation : receipt;
  };
  mountProspectPreflight({ request, document: { querySelector: selector => elements[selector] || null } });
  return { elements, calls };
}

test('owner executor unlocks only after matching read-only validation and consumes one UI attempt', async () => {
  const { elements, calls } = mountFixture();
  assert.equal(elements['#execute-frozen-effect'].disabled, true);
  await elements['#run-prospect-preflight'].listeners.click();
  assert.equal(elements['#execute-frozen-effect'].disabled, false);
  await elements['#frozen-effect-execution-form'].listeners.submit({ preventDefault() {} });
  await elements['#frozen-effect-execution-form'].listeners.submit({ preventDefault() {} });
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].options.body), { frozenEffectDigest: digest });
  assert.deepEqual(JSON.parse(calls[1].options.body), { frozenEffectDigest: digest, executeFrozenEffect: true });
  assert.equal(elements['#frozen-effect-digest'].readOnly, true);
  assert.equal(elements['#execute-frozen-effect'].disabled, true);
  assert.match(elements['#frozen-effect-execution-result'].textContent, /smtp-ref-1/);
});

test('wrong recipient or route leaves the separate executor disabled', async () => {
  for (const validation of [
    readyFrozenValidation({ recipient: 'wrong@example.com' }),
    readyFrozenValidation({ routeClass: 'PUBLIC_BUSINESS_CONTACT' })
  ]) {
    const { elements, calls } = mountFixture({ validation });
    await elements['#run-prospect-preflight'].listeners.click();
    assert.equal(elements['#execute-frozen-effect'].disabled, true);
    await elements['#frozen-effect-execution-form'].listeners.submit({ preventDefault() {} });
    assert.equal(calls.length, 1, 'only the read-only preflight is allowed');
  }
});

test('admin exposes a separate owner-only executor and keeps the preflight action read-only', () => {
  const html = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
  assert.match(html, /id="run-prospect-preflight">Run read-only preflight/);
  assert.match(html, /id="frozen-effect-execution"[\s\S]*Owner-only exact frozen-effect execution/);
  assert.match(html, /id="frozen-effect-digest"[^>]*pattern="\[a-f0-9\]\{64\}"/);
  assert.match(html, /id="execute-frozen-effect"[^>]*disabled>Execute exact authorized effect once/);
  assert.match(html, /id="frozen-effect-execution-result"/);
});
