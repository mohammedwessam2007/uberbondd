import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The companion to tests/server-http-surface.test.mjs, and the reason the handler
// was extracted.
//
// That suite spawns the process and proves the surface an anonymous caller sees.
// It cannot cheaply go deeper: every assertion costs a socket round trip, and
// the authenticated paths need a running store to say anything interesting.
//
// This one drives requests straight through the exported handler. No port is
// bound and no request leaves the process, so the authenticated half of the
// server -- the half that actually does things -- becomes testable at the price
// of a function call.
//
// Importing server.mjs still validates config and initializes a store, which is
// why the environment is set before the dynamic import below. Listening and the
// signal handlers are guarded behind the entry-point check, so the import does
// not start a server.

const ADMIN_TOKEN = 'a-strong-admin-token-value-000000000000';
let handler;
let coreHandler;
let dataDir;

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'uberbond-handler-'));
  process.env.PROCESS_ROLE = 'web';
  process.env.STORE_BACKEND = 'json';
  process.env.DATA_DIR = dataDir;
  process.env.APP_BASE_URL = 'http://127.0.0.1:9999';
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  process.env.NODE_ENV = 'test';
  ({ requestHandler: handler } = await import('../server.mjs'));
  ({ requestHandler: coreHandler } = await import('../server-core.mjs'));
});

test.after(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

function response() {
  const res = { status: null, headers: {}, body: '' };
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {}; };
  res.end = body => { res.body = body || ''; };
  return res;
}

async function call(url, { method = 'GET', token, body, headers = {} } = {}) {
  const res = response();
  const request = {
    method,
    url,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    // The handler reads a body by async-iterating the request.
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(body); }
  };
  await handler(request, res);
  return res;
}

const json = res => { try { return JSON.parse(res.body); } catch { return null; } };

test('the handler is exported and usable without binding a port', () => {
  assert.equal(typeof handler, 'function');
});

test('the core handler remains a named export usable without binding a port', () => {
  assert.equal(typeof coreHandler, 'function',
    'server-core.mjs must keep its named requestHandler export; wrapper capture is not a substitute for a directly reachable handler');
});

test('an authenticated read answers, an unauthenticated one does not', async () => {
  const anonymous = await call('/api/summary');
  assert.equal(anonymous.status, 401);

  const authenticated = await call('/api/summary', { token: ADMIN_TOKEN });
  assert.equal(authenticated.status, 200);
  assert.ok(json(authenticated), 'an authenticated summary must be JSON');
});

// Every admin read, with a good token. This is the half the spawned surface gate
// cannot reach cheaply, and where a routing mistake would actually show.
test('every admin read answers with a valid token', async () => {
  const failures = [];
  for (const route of ['/api/summary', '/api/campaigns', '/api/export.json', '/api/export.csv', '/api/discovery/config']) {
    const res = await call(route, { token: ADMIN_TOKEN });
    if (res.status !== 200) failures.push(`${route} -> ${res.status} ${res.body.slice(0, 80)}`);
  }
  assert.deepEqual(failures, []);
});

// A token is not a licence to use any verb on any route.
test('a valid token does not relax method discipline', async () => {
  const wrongVerb = [];
  for (const [route, method] of [
    ['/api/summary', 'DELETE'],
    ['/api/campaigns', 'PATCH'],
    ['/api/export.json', 'POST'],
    ['/api/discovery/config', 'DELETE']
  ]) {
    const res = await call(route, { method, token: ADMIN_TOKEN });
    if (res.status === 200) wrongVerb.push(`${method} ${route} was served`);
  }
  assert.deepEqual(wrongVerb, [], 'an authenticated caller still may not use any verb');
});

// The error mapping is small, pure and security-relevant: it decides whether a
// caller learns "you asked too often", "this is switched off", or nothing at all.
test('a malformed authenticated request is a client error, never a 500', async () => {
  const surprises = [];
  // `null` is the one that mattered. It is valid JSON, so it parsed cleanly and
  // then threw a TypeError on the first property access -- a caller's mistake
  // surfacing as a 500, producible at will with a one-word body. Every other
  // non-object shape had the same route into the handler.
  for (const [route, body] of [
    ['/api/campaigns', '{'],
    ['/api/campaigns', 'null'],
    ['/api/campaigns', '[]'],
    ['/api/campaigns', '42'],
    ['/api/campaigns', '"a string"'],
    ['/api/campaigns', 'true'],
    ['/api/suppress', 'null'],
    ['/api/suppress', '{}'],
    ['/api/prospects/import', 'null'],
    ['/api/prospects/import', '{"prospects":"not-an-array"}']
  ]) {
    const res = await call(route, { method: 'POST', token: ADMIN_TOKEN, body });
    if (res.status >= 500) surprises.push(`POST ${route} with ${body} -> ${res.status}`);
  }
  assert.deepEqual(surprises, [],
    'bad input from an authenticated caller is their mistake, not a server fault');
});

// A non-object body is refused with a message that says so, rather than being
// coerced into an empty object and quietly creating something.
test('a non-object JSON body is refused, not coerced into a default', async () => {
  const before = json(await call('/api/campaigns', { token: ADMIN_TOKEN })) || [];
  for (const body of ['null', '[]', '42', '"a string"', 'true']) {
    const res = await call('/api/campaigns', { method: 'POST', token: ADMIN_TOKEN, body });
    assert.equal(res.status, 400, `a body of ${body} must be refused`);
    assert.match(res.body, /must be an object/);
  }
  const after = json(await call('/api/campaigns', { token: ADMIN_TOKEN })) || [];
  assert.equal(after.length, before.length,
    'a refused body must not have created a campaign on the way through');
});

test('campaign creation converges on one record after a browser timeout', async () => {
  const body = JSON.stringify({
    name: 'Idempotent test campaign', niche: 'HVAC agencies', offer: 'Lead-path evidence sprint',
    allowedCountries: 'United Kingdom', minScore: 60, maxFollowups: 0, approved: true, autoSend: false
  });
  const headers = { 'idempotency-key': 'campaign-timeout-retry-1' };
  const before = (json(await call('/api/campaigns', { token: ADMIN_TOKEN })) || []).length;
  const first = await call('/api/campaigns', { method: 'POST', token: ADMIN_TOKEN, body, headers });
  assert.equal(first.status, 201);
  const replay = await call('/api/campaigns', { method: 'POST', token: ADMIN_TOKEN, body, headers });
  assert.equal(replay.status, 200);
  assert.equal(json(replay).id, json(first).id);
  assert.equal(json(replay).idempotentReplay, true);
  const after = (json(await call('/api/campaigns', { token: ADMIN_TOKEN })) || []).length;
  assert.equal(after, before + 1);

  const changed = await call('/api/campaigns', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({ name: 'Different campaign', approved: true }), headers
  });
  assert.equal(changed.status, 409);

  const missingKey = await call('/api/campaigns', { method: 'POST', token: ADMIN_TOKEN, body });
  assert.equal(missingKey.status, 400);
  assert.match(missingKey.body, /Idempotency-Key/);
});

test('campaign creation binds one of the four final offer lanes and rejects unknown lanes', async () => {
  const selected = await call('/api/campaigns', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({
      name: 'Final offer lane test', niche: 'AI agencies',
      offerId: 'AI_AGENT_RELEASE_GATE', approved: true, autoSend: false
    }),
    headers: { 'idempotency-key': 'final-offer-lane-test-1' }
  });
  assert.equal(selected.status, 201);
  assert.equal(json(selected).offerId, 'AI_AGENT_RELEASE_GATE');
  assert.match(json(selected).offer, /AI Agent Release Gate/);

  const unknown = await call('/api/campaigns', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({ name: 'Unknown lane', offerId: 'NOT_A_REAL_OFFER' }),
    headers: { 'idempotency-key': 'final-offer-lane-test-2' }
  });
  assert.equal(unknown.status, 400);
  assert.match(unknown.body, /four final UberReply offers/);
});

test('protected owner setup records identity and one exact recipient without external effects', async () => {
  const identity = await call('/api/owner/business-identity', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({
      legalName: 'UberBond Evidence Studio', senderName: 'Mohamed Wessam', company: 'UberBond',
      postalAddress: '12 Evidence Street, Cairo, 11511, Egypt'
    })
  });
  assert.equal(identity.status, 200);
  assert.equal(json(identity).identity.postalAddress, '12 Evidence Street, Cairo, 11511, Egypt');

  const campaignBody = JSON.stringify({
    name: 'Owner canary intake campaign', niche: 'HVAC agencies', offer: 'Lead-path evidence sprint',
    allowedCountries: 'United Kingdom', minScore: 60, maxFollowups: 0, approved: true, autoSend: true
  });
  const campaign = await call('/api/campaigns', {
    method: 'POST', token: ADMIN_TOKEN, body: campaignBody,
    headers: { 'idempotency-key': 'owner-canary-campaign-1' }
  });
  assert.equal(campaign.status, 201);
  const campaignId = json(campaign).id;
  const recipientBody = {
    campaignId,
    company: 'Evidence Intake Example', website: 'https://intake.example',
    email: 'owner@intake.example', name: 'Owner Contact', title: 'Operations Director',
    country: 'United Kingdom', city: 'London', niche: 'HVAC',
    authorizationBasis: 'requested_information', authorizationUrl: 'https://intake.example/request',
    evidenceNote: 'The contact directly requested the audit information.', jurisdiction: 'GB',
    observedAt: new Date().toISOString()
  };
  const first = await call('/api/owner/recipient', {
    method: 'POST', token: ADMIN_TOKEN, body: JSON.stringify(recipientBody)
  });
  assert.equal(first.status, 201);
  const firstJson = json(first);
  assert.equal(firstJson.prospect.contact.source, 'owner_import');
  assert.equal(firstJson.prospect.sourceMetadata.authorization.status, 'owner-evidence-recorded');
  assert.equal(firstJson.providerCalls, 0);
  assert.equal(firstJson.externalEffects, 0);

  const replay = await call('/api/owner/recipient', {
    method: 'POST', token: ADMIN_TOKEN, body: JSON.stringify(recipientBody)
  });
  assert.equal(replay.status, 200);
  assert.equal(json(replay).idempotentReplay, true);
  assert.equal(json(replay).prospect.id, firstJson.prospect.id);

  const setup = await call('/api/owner/setup', { token: ADMIN_TOKEN });
  assert.equal(setup.status, 200);
  assert.equal(json(setup).recipientEvidence.total, 1);
  const canary = await call('/api/outbound/canary/status', { token: ADMIN_TOKEN });
  assert.equal(canary.status, 200);
  assert.equal(json(canary).prerequisites.senderIdentityConfigured, true);
});

test('native lead-ops routes compile, replay, export and plan without external effects', async () => {
  const profile = await call('/api/leadgen/target-profiles', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({
      name: 'Native HVAC lane',
      profile: { query: { industries: ['HVAC'], minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false } }
    })
  });
  assert.equal(profile.status, 201);
  assert.equal(json(profile).kind, 'target-profile');
  const profileReplay = await call('/api/leadgen/target-profiles', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({
      name: 'Native HVAC lane',
      profile: { query: { industries: ['HVAC'], minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false } }
    })
  });
  assert.equal(profileReplay.status, 200);
  assert.equal(json(profileReplay).idempotentReplay, true);

  const listBody = JSON.stringify({
    name: 'Native HVAC lead list',
    profile: { query: { industries: ['HVAC'], minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false } },
    limit: 25
  });
  const list = await call('/api/leadgen/lists', {
    method: 'POST', token: ADMIN_TOKEN, body: listBody,
    headers: { 'idempotency-key': 'native-list-route-1' }
  });
  assert.equal(list.status, 201);
  assert.equal(json(list).handoff.send, 'NOT_AUTHORIZED');
  assert.equal(json(list).providerCalls, 0);
  const replay = await call('/api/leadgen/lists', {
    method: 'POST', token: ADMIN_TOKEN, body: listBody,
    headers: { 'idempotency-key': 'native-list-route-1' }
  });
  assert.equal(replay.status, 200);
  assert.equal(json(replay).idempotentReplay, true);

  const listId = json(list).id;
  const listCsv = await call(`/api/leadgen/lists/${listId}.csv`, { token: ADMIN_TOKEN });
  assert.equal(listCsv.status, 200);
  assert.match(listCsv.body, /prospect_id,account_key,company/);

  const prospects = json(await call('/api/prospects', { token: ADMIN_TOKEN }));
  const prospectId = prospects[prospects.length - 1]?.id;
  assert.ok(prospectId);
  const enrichment = await call('/api/leadgen/enrichment/local', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({ prospectId, fields: ['company_profile', 'website_evidence'] })
  });
  assert.equal(enrichment.status, 201);
  assert.equal(json(enrichment).providerCalls, 0);
  assert.equal(json(enrichment).externalEffects, 0);

  const tower = await call('/api/leadgen/control-tower', { token: ADMIN_TOKEN });
  assert.equal(tower.status, 200);
  assert.ok(Array.isArray(json(tower).nativeLists));
  const providers = await call('/api/leadgen/providers', { token: ADMIN_TOKEN });
  assert.equal(providers.status, 200);
  assert.ok(json(providers).providers.some(provider => provider.id === 'apollo'));
  assert.equal(json(providers).providerCalls, 0);

  const localPreflight = await call('/api/leadgen/provider-preflight', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({ fields: ['website_evidence'], providers: ['local-evidence'], volume: 10 })
  });
  assert.equal(localPreflight.status, 200);
  assert.equal(json(localPreflight).safeToRun, true);
  assert.equal(json(localPreflight).externalEffects, 0);

  const blockedPreflight = await call('/api/leadgen/provider-preflight', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({ fields: ['work_email'], providers: ['apollo'], volume: 10 })
  });
  assert.equal(blockedPreflight.status, 200);
  assert.equal(json(blockedPreflight).safeToRun, false);
  assert.match(json(blockedPreflight).blockingReasons.join(' '), /BYOK/);

  const coverage = await call('/api/leadgen/coverage', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({ name: 'Native HVAC lane', query: { industries: ['HVAC'] } })
  });
  assert.equal(coverage.status, 200);
  assert.ok(json(coverage).totals);
  assert.equal(json(coverage).providerCalls, 0);

  const buyingGroup = await call('/api/leadgen/buying-group', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({ requiredRoles: ['Founder', 'Marketing Director'] })
  });
  assert.equal(buyingGroup.status, 200);
  assert.ok(json(buyingGroup).summary);
  assert.equal(json(buyingGroup).externalEffects, 0);

  const lookalike = await call('/api/leadgen/lookalike', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({ seedIds: [prospectId], limit: 10 })
  });
  assert.equal(lookalike.status, 200);
  assert.equal(json(lookalike).status, 'ready');
  assert.equal(json(lookalike).providerCalls, 0);

  const ledger = await call(`/api/leadgen/prospects/${encodeURIComponent(prospectId)}/ledger`, { token: ADMIN_TOKEN });
  assert.equal(ledger.status, 200);
  assert.equal(json(ledger).prospectId, prospectId);
  assert.equal(json(ledger).externalEffects, 0);

  const capacity = await call('/api/leadgen/capacity-plan', {
    method: 'POST', token: ADMIN_TOKEN,
    body: JSON.stringify({ monthlyMessages: 100000, activeDaysPerMonth: 30, senderCells: [] })
  });
  assert.equal(capacity.status, 200);
  assert.equal(json(capacity).requiredDailyMessages, 3334);
  assert.equal(json(capacity).state, 'CAPACITY_PLAN_ONLY');
});

test('an error response never carries a stack trace, an internal path, or the token', async () => {
  const leaks = [];
  for (const [route, options] of [
    ['/api/summary', {}],
    ['/api/campaigns', { method: 'POST', token: ADMIN_TOKEN, body: '{' }],
    ['/does-not-exist', {}],
    ['/api/summary', { token: 'Bearer-shaped-but-wrong' }]
  ]) {
    const res = await call(route, options);
    const body = res.body || '';
    if (/node:internal|\/home\/|at Object\.|at async /.test(body)) leaks.push(`${route}: stack or path`);
    if (body.includes(ADMIN_TOKEN)) leaks.push(`${route}: token echoed`);
  }
  assert.deepEqual(leaks, []);
});

// Security headers are set once in a shared object and applied by the json/text
// helpers. A route that built its own reply would skip them silently.
test('every response carries the security headers, whatever its status', async () => {
  const missing = [];
  for (const [route, options] of [
    ['/api/health', {}],
    ['/api/summary', {}],
    ['/api/summary', { token: ADMIN_TOKEN }],
    ['/does-not-exist', {}],
    ['/api/campaigns', { method: 'POST', token: ADMIN_TOKEN, body: '{' }]
  ]) {
    const res = await call(route, options);
    for (const header of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'cache-control']) {
      if (!res.headers[header]) missing.push(`${route} (${res.status}) missing ${header}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the public surface stays reachable without a token', async () => {
  for (const route of ['/api/health', '/api/public/config']) {
    const res = await call(route);
    assert.equal(res.status, 200, `${route} must answer anonymously`);
  }
  const config = json(await call('/api/public/config'));
  assert.equal(config.offerCatalog.filter(item => item.kind === 'paid').length, 4);
  const interest = await call('/api/public/offer-interest', {
    method: 'POST',
    body: JSON.stringify({ token: 'not-a-real-report-token', product: 'full' })
  });
  assert.equal(interest.status, 404);
});

// An unknown route under an authenticated prefix must not become a 200 by
// accident of prefix matching.
test('an unknown path under an admin prefix is not served', async () => {
  for (const route of ['/api/definitely-not-a-route', '/api/prospects/', '/api/jobs/']) {
    const res = await call(route, { token: ADMIN_TOKEN });
    assert.notEqual(res.status, 200, `${route} must not be served`);
  }
});
