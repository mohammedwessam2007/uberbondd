import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2SmtpSeedBridge } from '../src/uberwarm2-smtp-seed-bridge.mjs';
import {
  issueSendCapability, revokeSendCapability, hasSendCapability
} from '../src/uberwarm2-send-capability.mjs';
import { UBERWARM2_SEED_TEMPLATE } from '../src/uberwarm2-seed-executor.mjs';
const ACCOUNT = {
  email: 'tara@example.net', sendingMailboxId: 'tara', connected: true,
  tokens: { encrypted: true },
  smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'winnr-support:authorized-test',
    host: 'smtp.test.invalid', secure: true, port: 465 }
};
// Far-future canonical UTC: the bridge re-checks expiry at every send, so a
// fixture that expires with the calendar would make these tests time-bombs.
const FAR_FUTURE = '2099-12-31T00:00:00Z';
const SEEDS = [{
  email: 'owned-seed@gmail.com', ownerControlled: true, receiveReady: true,
  consentToTest: true, consentEvidenceRef: 'owner-approval:1', permissionExpiresAt: FAR_FUTURE
}];
const OTHER_SEED = {
  email: 'owned-two@gmail.com', ownerControlled: true, receiveReady: true,
  consentToTest: true, consentEvidenceRef: 'owner-approval:2', permissionExpiresAt: FAR_FUTURE
};
const reservationKey = 'uberwarm2-seed:' + 'a'.repeat(64);
const keyOf = ch => 'uberwarm2-seed:' + ch.repeat(64);
const PROBE = {
  from: 'tara@example.net', to: 'owned-seed@gmail.com',
  probeId: 'test-probe-1', reservationKey,
  permittedPurpose: 'OWNER_CONTROLLED_PLACEMENT_PROBE',
  subject: 'UberBond permitted mailbox delivery test',
  body: 'Owner-authorized delivery and inbox-placement test. No reply or other action is requested. Reference: test-probe-1'
};
const TEMPLATE = UBERWARM2_SEED_TEMPLATE;
function build(overrides = {}) {
  const calls = [];
  const bridge = createUberWarm2SmtpSeedBridge({
    account: { ...ACCOUNT, ...(overrides.account || {}) },
    allowedSeeds: overrides.allowedSeeds ?? SEEDS,
    encryptionKey: 'test-only-key',
    credentialReader: () => ({username: 'encrypted-decoded-user', password:'never-export'}),
    transportFactory: () => ({
      ok:true,
      async send(v) { calls.push(v); return {confirmed:true,messageId:v.messageId}; }
    })
  });
  return {bridge, calls};
}
// Fresh account per test so a mutation after bind never leaks into ACCOUNT.
function fresh() {
  return { ...ACCOUNT, smtpRoute: { ...ACCOUNT.smtpRoute } };
}
// Returns the live handles a test needs to mutate state after bind.
function live({ account = fresh(), allowedSeeds = SEEDS, clock, transportFactory, credentialReader } = {}) {
  const calls = [], factoryCalls = [];
  const bridge = createUberWarm2SmtpSeedBridge({
    account, allowedSeeds, encryptionKey: 'test-only-key', clock,
    credentialReader: credentialReader ?? (() => ({ username: 'encrypted-decoded-user', password: 'never-export' })),
    transportFactory: transportFactory ?? (opts => {
      factoryCalls.push(opts);
      return { ok: true, async send(v) { calls.push(v); return { confirmed: true, messageId: v.messageId }; } };
    })
  });
  return { bridge, account, calls, factoryCalls };
}
// Issues the one-shot capability for the duration of fn, then revokes any
// remainder so one test cannot leak a live capability into the next.
// The capability is bound to the exact send in args, as the executor binds it.
const bindingOf = a => ({
  from: a.from, to: a.to, probeId: a.probeId, subject: a.subject, body: a.body,
  permittedPurpose: a.permittedPurpose, reservationKey: a.reservationKey,
});
async function withCapability(key, fn, args = probeArgs()) {
  revokeSendCapability(key);
  issueSendCapability(key, bindingOf({ ...args, reservationKey: key }));
  try { return await fn(); } finally { revokeSendCapability(key); }
}
function probeArgs(probeId = 'test-probe-1', overrides = {}) {
  return {
    from: 'tara@example.net', to: 'owned-seed@gmail.com', probeId, reservationKey,
    permittedPurpose: 'OWNER_CONTROLLED_PLACEMENT_PROBE',
    subject: 'UberBond permitted mailbox delivery test',
    body: `${TEMPLATE.bodyPrefix}${probeId}`, ...overrides
  };
}
test('SMTP seed bridge requires encrypted account, authorized provider route and consenting seeds', () => {
  assert.equal(build({account:{connected:false}}).bridge.ok, false);
  assert.equal(build({account:{smtpRoute:{authorized:false}}}).bridge.ok, false);
  assert.equal(build({allowedSeeds:[]}).bridge.ok, false);
  assert.equal(build({allowedSeeds:[{email:'someone@gmail.com',receiveReady:true}]}).bridge.ok,false);
});
test('SMTP seed bridge refuses recipient substitution, impersonation and non-probe payload', async () => {
  const {bridge,calls} = build();
  assert.equal(bridge.ok,true);
  assert.equal((await bridge.sendOwnedSeed({...PROBE,to:'prospect@business.com'})).ok,false);
  assert.equal((await bridge.sendOwnedSeed({...PROBE,from:'hijack@example.net'})).ok,false);
  assert.equal((await bridge.sendOwnedSeed({...PROBE,body:'Click here to buy'})).ok,false);
  assert.equal((await bridge.sendOwnedSeed({...PROBE,permittedPurpose:'CAMPAIGN'})).ok,false);
  assert.equal(calls.length,0);
});
test('SMTP seed bridge creates one authorized, correlated and transparent test submission', async () => {
  const {bridge,calls} = build();
  const r = await withCapability(reservationKey, () => bridge.sendOwnedSeed(PROBE));
  assert.equal(r.ok,true);
  assert.equal(r.accepted,true);
  assert.equal(r.status,'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN');
  assert.equal(calls.length,1);
  assert.equal(calls[0].from,ACCOUNT.email);
  assert.equal(calls[0].to,SEEDS[0].email);
  assert.match(calls[0].messageId,/^<uw2-[a-f0-9]{32}@example.net>$/);
});

test('paused and quarantined sender cannot construct a live SMTP bridge',()=>{
  assert.equal(build({account:{paused:true}}).bridge.ok,false);
  assert.equal(build({account:{quarantined:true}}).bridge.ok,false);
  assert.equal(build({account:{placementQuarantine:true}}).bridge.ok,false);
});

// --- X1: one-shot send capability ------------------------------------------

test('X1: a send without a live capability makes zero transport calls and reports notTransmitted', async () => {
  const b = live();
  const r = await b.bridge.sendOwnedSeed(probeArgs());
  assert.equal(r.ok, false);
  assert.equal(r.accepted, false);
  assert.equal(r.notTransmitted, true);
  assert.equal(b.calls.length, 0);
  assert.equal(b.factoryCalls.length, 0, 'no transport may be built without authority');
});

test('X1: a refused send does not consume the capability, and a transmitted send consumes it once', async () => {
  const b = live();
  await withCapability(reservationKey, async () => {
    const refusedFirst = await b.bridge.sendOwnedSeed(probeArgs('test-probe-1', { permittedPurpose: 'CAMPAIGN' }));
    assert.equal(refusedFirst.ok, false);
    assert.equal(hasSendCapability(reservationKey, bindingOf(probeArgs())), true, 'a refused request must not spend the capability');
    const accepted = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(accepted.ok, true);
    assert.equal(hasSendCapability(reservationKey, bindingOf(probeArgs())), false, 'a transmitted send spends the capability');
    const replay = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(replay.ok, false);
    assert.equal(replay.notTransmitted, true);
  });
  assert.equal(b.calls.length, 1);
});

test('X1: a capability issued for one reservation cannot authorize a send under another', async () => {
  const b = live();
  await withCapability(keyOf('b'), async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
  });
  assert.equal(b.calls.length, 0);
});

test('X1: an expired capability refuses the send with zero transport calls', async () => {
  const b = live();
  revokeSendCapability(reservationKey);
  issueSendCapability(reservationKey, bindingOf(probeArgs()), { ttlMs: 1 });
  try {
    await new Promise(resolve => setTimeout(resolve, 20));
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
    assert.equal(b.calls.length, 0);
  } finally { revokeSendCapability(reservationKey); }
});

// --- X2: live re-validation at every send ----------------------------------

test('X2: a pause applied after bind refuses the next send with zero transport calls', async () => {
  const b = live();
  await withCapability(reservationKey, async () => {
    b.account.paused = true;
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
    assert.equal(b.calls.length, 0);
    assert.equal(b.factoryCalls.length, 0);
  });
});

test('X2: a terms revocation applied after bind refuses the next send with zero transport calls', async () => {
  const b = live();
  await withCapability(reservationKey, async () => {
    b.account.smtpRoute.termsCompatible = false;
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
    assert.equal(b.calls.length, 0);
    assert.equal(b.factoryCalls.length, 0);
  });
});

test('X2: a host change applied after bind refuses the next send with zero transport calls', async () => {
  const b = live();
  await withCapability(reservationKey, async () => {
    b.account.smtpRoute.host = 'attacker.test.invalid';
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
    assert.equal(b.calls.length, 0);
    assert.equal(b.factoryCalls.length, 0);
  });
});

test('X2: a route object swapped after bind refuses the next send', async () => {
  const b = live();
  await withCapability(reservationKey, async () => {
    b.account.smtpRoute = { ...ACCOUNT.smtpRoute };
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
    assert.equal(b.calls.length, 0);
  });
});

test('X2: every live sender and route flag is re-read at send time', async () => {
  const mutations = [
    ['connected', a => { a.connected = false; }],
    ['quarantined', a => { a.quarantined = true; }],
    ['placementQuarantine', a => { a.placementQuarantine = true; }],
    ['tokens removed', a => { a.tokens = null; }],
    ['route.authorized', a => { a.smtpRoute.authorized = false; }],
    ['route.secure', a => { a.smtpRoute.secure = false; }],
    ['route.evidenceRef', a => { a.smtpRoute.evidenceRef = ''; }],
    ['sender email changed', a => { a.email = 'hijack@example.net'; }]
  ];
  for (const [name, mutate] of mutations) {
    const b = live();
    mutate(b.account);
    await withCapability(reservationKey, async () => {
      const r = await b.bridge.sendOwnedSeed(probeArgs());
      assert.equal(r.ok, false, name);
      assert.equal(r.notTransmitted, true, name);
    });
    assert.equal(b.calls.length, 0, name);
  }
});

// --- X3: seed allowlist built from every row --------------------------------

test('X3: a seed consented then withdrawn for the same address is refused, even beside a valid seed', async () => {
  const withdrawn = { ...SEEDS[0], consentToTest: false, consentEvidenceRef: 'owner-approval:withdrawn' };
  const b = live({ allowedSeeds: [SEEDS[0], withdrawn, OTHER_SEED] });
  assert.equal(b.bridge.ok, true);
  await withCapability(reservationKey, async () => {
    const refused = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(refused.ok, false);
    assert.equal(refused.notTransmitted, true);
  });
  assert.equal(b.calls.length, 0);
  // The capability is bound to the control send itself: it must be issued for test-probe-2 and OTHER_SEED.
  const controlArgs = probeArgs('test-probe-2', { to: OTHER_SEED.email, reservationKey: keyOf('c') });
  await withCapability(keyOf('c'), async () => {
    const control = await b.bridge.sendOwnedSeed(controlArgs);
    assert.equal(control.ok, true, 'control: the valid seed still sends');
  }, controlArgs);
  assert.equal(b.calls.length, 1);
});

test('X3: a seed row withdrawn after bind is refused at the next send', async () => {
  const seed = { ...SEEDS[0] };
  const b = live({ allowedSeeds: [seed, OTHER_SEED] });
  seed.consentToTest = false;
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
  });
  assert.equal(b.calls.length, 0);
});

test('X3: a seed whose permission expires between bind and send is refused', async () => {
  let now = Date.parse('2030-01-01T00:00:00Z');
  const seed = { ...SEEDS[0], permissionExpiresAt: '2030-06-01T00:00:00Z' };
  const b = live({ allowedSeeds: [seed, OTHER_SEED], clock: () => now });
  assert.equal(b.bridge.ok, true);
  now = Date.parse('2030-07-01T00:00:00Z');
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
  });
  assert.equal(b.calls.length, 0);
});

test('X3: a seed row without a canonical UTC permissionExpiresAt is excluded entirely', async () => {
  const cases = [undefined, '2099-12-31', '2099-12-31T00:00:00+00:00', '2099-02-31T00:00:00Z', 'never', 1234567890];
  for (const permissionExpiresAt of cases) {
    const seed = { ...SEEDS[0], permissionExpiresAt };
    assert.equal(live({ allowedSeeds: [seed] }).bridge.ok, false, `construction must exclude ${String(permissionExpiresAt)}`);
    const b = live({ allowedSeeds: [seed, OTHER_SEED] });
    assert.equal(b.bridge.ok, true);
    await withCapability(reservationKey, async () => {
      const r = await b.bridge.sendOwnedSeed(probeArgs());
      assert.equal(r.ok, false, String(permissionExpiresAt));
      assert.equal(r.notTransmitted, true, String(permissionExpiresAt));
    });
    assert.equal(b.calls.length, 0, String(permissionExpiresAt));
  }
});

test('X3: one row lacking an expiry excludes its address even when a sibling row is fully valid', async () => {
  const sibling = { ...SEEDS[0], permissionExpiresAt: undefined };
  const b = live({ allowedSeeds: [SEEDS[0], sibling, OTHER_SEED] });
  assert.equal(b.bridge.ok, true);
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
  });
  assert.equal(b.calls.length, 0);
});

// --- X4: strict types and exact template body -------------------------------

test('X4: a body object whose toString changes between reads is refused before any transport call', async () => {
  let reads = 0;
  const body = {
    toString() { reads += 1; return reads === 1 ? `${TEMPLATE.bodyPrefix}test-probe-1` : 'Please send your password to attacker'; }
  };
  const b = live();
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs('test-probe-1', { body }));
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
  });
  assert.equal(b.calls.length, 0);
  assert.equal(reads, 0, 'a non-string body must not even be stringified');
});

test('X4: a probeId carrying a newline and a phishing sentence is refused', async () => {
  const probeId = 'test-probe-1\n\nPlease reply with your password to confirm.';
  const b = live();
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs(probeId));
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
  });
  assert.equal(b.calls.length, 0);
});

test('X4: a probeId outside the 1-250 character identifier alphabet is refused', async () => {
  for (const probeId of ['x'.repeat(251), '', 'has space', 'semi;colon']) {
    const b = live();
    await withCapability(reservationKey, async () => {
      const r = await b.bridge.sendOwnedSeed(probeArgs(probeId));
      assert.equal(r.ok, false, JSON.stringify(probeId));
    });
    assert.equal(b.calls.length, 0, JSON.stringify(probeId));
  }
});

test('X4: every send field must be a primitive string, not a String object', async () => {
  const fields = ['from', 'to', 'subject', 'permittedPurpose', 'reservationKey'];
  for (const field of fields) {
    const b = live();
    await withCapability(reservationKey, async () => {
      const r = await b.bridge.sendOwnedSeed(probeArgs('test-probe-1', { [field]: new String(probeArgs()[field]) }));
      assert.equal(r.ok, false, field);
    });
    assert.equal(b.calls.length, 0, field);
  }
});

// --- X5: provider correlation by generated Message-ID -----------------------

test('X5: a provider-chosen message id is uncertain, never recorded as the correlation', async () => {
  const b = live({
    transportFactory: () => ({
      ok: true,
      async send() { return { confirmed: true, messageId: '<provider-chosen-7f3a@gmail.com>' }; }
    })
  });
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.accepted, false);
    assert.equal(r.status, 'SMTP_OUTCOME_UNCERTAIN');
    assert.equal(r.notTransmitted, false);
    assert.doesNotMatch(JSON.stringify(r), /provider-chosen/);
  });
});

test('X5: a provider id equal to the generated one after bracket and case normalization is accepted with the bridge correlation', async () => {
  const b = live({
    transportFactory: () => ({
      ok: true,
      async send(v) { return { confirmed: true, messageId: v.messageId.replace(/[<>]/g, '').toUpperCase() }; }
    })
  });
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.accepted, true);
    assert.match(r.messageId, /^<uw2-[a-f0-9]{32}@example\.net>$/);
  });
});

// --- X6: no getter or adapter throw escapes the bridge ----------------------

test('X6: a transport whose ok getter throws resolves as refused and not transmitted', async () => {
  const transport = {
    get ok() { throw new Error('ok-getter encrypted-decoded-user:never-export'); },
    async send() { throw new Error('must not send'); }
  };
  const b = live({ transportFactory: () => transport });
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
    assert.doesNotMatch(JSON.stringify(r), /never-export|encrypted-decoded-user/);
  });
});

test('X6: a send result whose confirmed getter throws resolves as uncertain, not accepted, without secrets', async () => {
  const b = live({
    transportFactory: () => ({
      ok: true,
      async send() { return { get confirmed() { throw new Error('never-export'); }, messageId: 'x' }; }
    })
  });
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.accepted, false);
    assert.equal(r.notTransmitted, false);
    assert.equal(r.status, 'SMTP_OUTCOME_UNCERTAIN');
    assert.doesNotMatch(JSON.stringify(r), /never-export/);
  });
});

test('X6: a throwing account getter at bind returns a blocked bridge and never throws', () => {
  const account = fresh();
  Object.defineProperty(account, 'paused', { get() { throw new Error('paused-getter never-export'); } });
  let bridge;
  assert.doesNotThrow(() => { bridge = live({ account }).bridge; });
  assert.equal(bridge.ok, false);
  assert.doesNotMatch(JSON.stringify(bridge), /never-export/);
});

test('X6: a throwing account getter after bind refuses the next send with notTransmitted true and never rejects', async () => {
  const b = live();
  Object.defineProperty(b.account, 'connected', { get() { throw new Error('connected-getter never-export'); } });
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs());
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
    assert.doesNotMatch(JSON.stringify(r), /never-export/);
  });
  assert.equal(b.calls.length, 0);
});

// --- X7: notTransmitted separates refusals from outcomes --------------------

test('X7: pre-transmission refusals report notTransmitted true and post-transmission outcomes report false', async () => {
  const refusedB = live();
  let refused;
  await withCapability(reservationKey, async () => {
    refused = await refusedB.bridge.sendOwnedSeed(probeArgs('test-probe-1', { permittedPurpose: 'CAMPAIGN' }));
  });
  assert.equal(refused.notTransmitted, true);

  const okB = live();
  let accepted;
  await withCapability(reservationKey, async () => { accepted = await okB.bridge.sendOwnedSeed(probeArgs()); });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.notTransmitted, false);

  const throwB = live({ transportFactory: () => ({ ok: true, async send() { throw new Error('never-export'); } }) });
  let uncertain;
  await withCapability(reservationKey, async () => { uncertain = await throwB.bridge.sendOwnedSeed(probeArgs()); });
  assert.equal(uncertain.status, 'SMTP_OUTCOME_UNCERTAIN');
  assert.equal(uncertain.notTransmitted, false);
});

// --- X8: no-secret shape for every result ----------------------------------

test('X8: refused, uncertain and accepted results keep the no-secret shape', async () => {
  const SECRET = /encrypted-decoded-user|never-export|smtp\.test\.invalid/;
  const ALLOWED_KEYS = new Set(['ok', 'accepted', 'notTransmitted', 'status', 'reasonCodes', 'messageId', 'messagesSent', 'authorizedSmtp']);
  const results = [];
  const refusedB = live();
  await withCapability(reservationKey, async () => {
    results.push(await refusedB.bridge.sendOwnedSeed(probeArgs('test-probe-1', { body: 'Click here' })));
  });
  const throwB = live({
    transportFactory: () => ({ ok: true, async send() { throw new Error('smtp rejected encrypted-decoded-user:never-export'); } })
  });
  await withCapability(reservationKey, async () => { results.push(await throwB.bridge.sendOwnedSeed(probeArgs())); });
  const okB = live();
  await withCapability(reservationKey, async () => { results.push(await okB.bridge.sendOwnedSeed(probeArgs())); });
  results.push(live({ allowedSeeds: [] }).bridge);
  for (const r of results) {
    assert.doesNotMatch(JSON.stringify(r), SECRET);
    for (const key of Object.keys(r)) assert.ok(ALLOWED_KEYS.has(key), key);
    assert.equal(typeof r.notTransmitted, 'boolean');
  }
});

test('a capability issued for probe A refuses a send for probe B, with no transmission', async () => {
  const b = live();
  await withCapability(reservationKey, async () => {
    const r = await b.bridge.sendOwnedSeed(probeArgs('test-probe-2'));
    assert.equal(r.ok, false);
    assert.equal(r.notTransmitted, true);
    assert.equal(b.calls.length, 0);
  });
});
