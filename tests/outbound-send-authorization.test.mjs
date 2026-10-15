import test from 'node:test';
import assert from 'node:assert/strict';
import { decideOutboundSend, outboundMessageDigest } from '../src/outbound-send-authorization.mjs';
import { buildEncryptedSmtpAccount, dispatchSmtpFleetAccount } from '../src/uberfleet.mjs';

// All identities, domains and addresses are synthetic (.invalid). No network, no real credentials.
const KEY = 'c'.repeat(64);
const SENDER_EMAIL = 'ops@mail.example.invalid';
const BUYER = 'buyer@prospect.example.invalid';
const BODY = 'Synthetic body text for fixtures.';
const PASSWORD = 'synthetic-not-a-secret';
const HEX64 = /^[0-9a-f]{64}$/;
const ALLOW_CONSENT = ({ consentReceiptRef }) => consentReceiptRef === 'consent:1';

function message(over = {}) {
  return { from: SENDER_EMAIL, to: BUYER, subject: 'Evidence pack', body: BODY, ...over };
}

// A decision input where every requirement passes for one exact message and one sender slot.
function fullInput(over = {}) {
  const msg = message();
  return {
    campaignId: 'campaign-1',
    message: msg,
    expectedSender: { accountId: 'acct-1', slot: 'slot-1', email: SENDER_EMAIL },
    sender: {
      accountId: 'acct-1', slot: 'slot-1', email: SENDER_EMAIL,
      paused: false, holdReasons: [], quarantined: false, bounceRate: 0.01, complaintRate: 0.001
    },
    thresholds: { maxBounceRate: 0.05, maxComplaintRate: 0.01 },
    domainReceipt: { domain: 'mail.example.invalid', configured: true },
    provider: { name: 'smtp-relay', routeAuthorized: true, termsCompatible: true },
    recipient: { jurisdiction: 'JX-TEST', eligibilityEvidenceRef: 'elig:1' },
    suppression: { snapshotId: 'supp-1', entries: ['optout@prospect.example.invalid'] },
    doNotContact: { listId: 'dnc-1', entries: ['stop@prospect.example.invalid'] },
    jurisdictionEvidence: { jurisdiction: 'JX-TEST', allowed: true, evidenceRef: 'jur:1' },
    consent: { receiptRef: 'consent:1' },
    verifyConsent: ALLOW_CONSENT,
    campaignApproval: { campaignId: 'campaign-1', approvalRef: 'approval:1' },
    messageApproval: { approvedDigest: outboundMessageDigest(msg) },
    rateWindow: { sentCount: 3, cap: 50 },
    retry: { attempts: 0, budget: 2 },
    emergencyStop: false,
    environment: {},
    ...over
  };
}

// Dispatch-level authorization for an account, bound to the exact message it approves.
function authorizationFor(acct, msg, over = {}) {
  return {
    campaignId: 'campaign-1',
    sender: {
      accountId: acct.id, slot: acct.slot, email: acct.email,
      paused: false, holdReasons: [], quarantined: false, bounceRate: 0.01, complaintRate: 0.001
    },
    thresholds: { maxBounceRate: 0.05, maxComplaintRate: 0.01 },
    domainReceipt: { domain: 'mail.example.invalid', configured: true },
    provider: { name: 'smtp-relay', routeAuthorized: true, termsCompatible: true },
    recipient: { jurisdiction: 'JX-TEST', eligibilityEvidenceRef: 'elig:1' },
    suppression: { snapshotId: 'supp-1', entries: [] },
    doNotContact: { listId: 'dnc-1', entries: [] },
    jurisdictionEvidence: { jurisdiction: 'JX-TEST', allowed: true, evidenceRef: 'jur:1' },
    consent: { receiptRef: 'consent:1' },
    campaignApproval: { campaignId: 'campaign-1', approvalRef: 'approval:1' },
    messageApproval: { approvedDigest: outboundMessageDigest(msg) },
    rateWindow: { sentCount: 0, cap: 10 },
    retry: { attempts: 0, budget: 3 },
    emergencyStop: false,
    ...over
  };
}

function account(slot = 'slot-1', email = SENDER_EMAIL) {
  return buildEncryptedSmtpAccount({
    slot, email, host: 'smtp.example.invalid', username: email, password: PASSWORD,
    sendingDomainId: 'd1', sendingMailboxId: 'm1', sendingWorkspaceId: 'w1',
    routeEvidenceRef: 'receipt:route-1', routeAuthorized: true, termsCompatible: true
  }, KEY).account;
}

// Wraps the account so every read of its encrypted tokens is counted. Opening a credential reads tokens.
function spiedAccount(acct) {
  let reads = 0;
  const copy = { ...acct };
  Object.defineProperty(copy, 'tokens', { enumerable: true, get() { reads++; return acct.tokens; } });
  return { account: copy, reads: () => reads };
}

test('a fully evidenced request for one exact message and slot is ALLOW with no reason codes', () => {
  const r = decideOutboundSend(fullInput());
  assert.equal(r.decision, 'ALLOW');
  assert.deepEqual(r.reasonCodes, []);
  assert.match(r.decisionDigest, HEX64);
});

const MISSING_REQUIREMENTS = [
  ['campaign id missing', i => ({ ...i, campaignId: '' }), 'campaign-id-missing'],
  ['expected sender identity missing', i => ({ ...i, expectedSender: undefined }), 'sender-identity-unverified'],
  ['sender identity missing', i => ({ ...i, sender: undefined }), 'sender-identity-unverified'],
  ['account id differs from expected', i => ({ ...i, expectedSender: { ...i.expectedSender, accountId: 'acct-2' } }), 'sender-identity-mismatch'],
  ['slot differs from expected', i => ({ ...i, expectedSender: { ...i.expectedSender, slot: 'slot-2' } }), 'sender-identity-mismatch'],
  ['email differs from expected', i => ({ ...i, expectedSender: { ...i.expectedSender, email: 'other@mail.example.invalid' } }), 'sender-identity-mismatch'],
  ['message from is a different sender', i => ({ ...i, message: { ...i.message, from: 'other@mail.example.invalid' } }), 'message-sender-mismatch'],
  ['sender paused', i => ({ ...i, sender: { ...i.sender, paused: true } }), 'sender-paused'],
  ['sender pause state unverified', i => ({ ...i, sender: { ...i.sender, paused: undefined } }), 'sender-state-unverified'],
  ['sender hold reason active', i => ({ ...i, sender: { ...i.sender, holdReasons: ['bounce-review'] } }), 'sender-held'],
  ['sender hold reasons malformed', i => ({ ...i, sender: { ...i.sender, holdReasons: 'none' } }), 'sender-state-unverified'],
  ['mailbox quarantined', i => ({ ...i, sender: { ...i.sender, quarantined: true } }), 'mailbox-quarantined'],
  ['mailbox quarantine state unverified', i => ({ ...i, sender: { ...i.sender, quarantined: undefined } }), 'mailbox-health-unverified'],
  ['bounce rate over threshold', i => ({ ...i, sender: { ...i.sender, bounceRate: 0.06 } }), 'bounce-rate-over-threshold'],
  ['bounce rate at threshold is not under it', i => ({ ...i, sender: { ...i.sender, bounceRate: 0.05 } }), 'bounce-rate-over-threshold'],
  ['complaint rate over threshold', i => ({ ...i, sender: { ...i.sender, complaintRate: 0.02 } }), 'complaint-rate-over-threshold'],
  ['health thresholds absent', i => ({ ...i, thresholds: undefined }), 'mailbox-health-unverified'],
  ['domain receipt absent', i => ({ ...i, domainReceipt: undefined }), 'domain-receipt-missing'],
  ['domain receipt for another domain', i => ({ ...i, domainReceipt: { domain: 'other.example.invalid', configured: true } }), 'domain-receipt-mismatch'],
  ['domain receipt not configured', i => ({ ...i, domainReceipt: { domain: 'mail.example.invalid', configured: false } }), 'domain-not-configured'],
  ['provider is not smtp-relay', i => ({ ...i, provider: { ...i.provider, name: 'other-relay' } }), 'provider-not-smtp-relay'],
  ['provider route not authorized', i => ({ ...i, provider: { ...i.provider, routeAuthorized: false } }), 'provider-route-unauthorized'],
  ['provider terms not compatible', i => ({ ...i, provider: { ...i.provider, termsCompatible: false } }), 'provider-terms-incompatible'],
  ['suppression snapshot absent', i => ({ ...i, suppression: undefined }), 'suppression-snapshot-missing'],
  ['suppression snapshot holds a non-string entry', i => ({ ...i, suppression: { snapshotId: 'supp-1', entries: [{ address: BUYER }] } }), 'suppression-snapshot-missing'],
  ['recipient is suppressed', i => ({ ...i, suppression: { snapshotId: 'supp-1', entries: [BUYER.toUpperCase()] } }), 'recipient-suppressed'],
  ['do-not-contact list absent', i => ({ ...i, doNotContact: undefined }), 'do-not-contact-list-missing'],
  ['recipient is on do-not-contact list', i => ({ ...i, doNotContact: { listId: 'dnc-1', entries: [BUYER] } }), 'recipient-do-not-contact'],
  ['recipient eligibility evidence absent', i => ({ ...i, recipient: { jurisdiction: 'JX-TEST' } }), 'recipient-eligibility-evidence-missing'],
  ['jurisdiction evidence absent', i => ({ ...i, jurisdictionEvidence: undefined }), 'jurisdiction-evidence-missing'],
  ['jurisdiction evidence not allowed', i => ({ ...i, jurisdictionEvidence: { jurisdiction: 'JX-TEST', allowed: false, evidenceRef: 'jur:1' } }), 'jurisdiction-not-allowed'],
  ['jurisdiction evidence for another jurisdiction', i => ({ ...i, jurisdictionEvidence: { jurisdiction: 'JX-OTHER', allowed: true, evidenceRef: 'jur:1' } }), 'jurisdiction-not-allowed'],
  ['consent receipt absent', i => ({ ...i, consent: undefined }), 'consent-receipt-missing'],
  ['consent verifier absent', i => ({ ...i, verifyConsent: undefined }), 'consent-verifier-missing'],
  ['consent verifier does not accept', i => ({ ...i, verifyConsent: () => false }), 'consent-not-accepted'],
  ['consent verifier throws', i => ({ ...i, verifyConsent: () => { throw new Error('synthetic verifier failure'); } }), 'consent-verifier-threw'],
  ['consent verifier is asynchronous', i => ({ ...i, verifyConsent: async () => true }), 'consent-verifier-async'],
  ['campaign approval absent', i => ({ ...i, campaignApproval: undefined }), 'campaign-approval-missing'],
  ['campaign approval for another campaign', i => ({ ...i, campaignApproval: { campaignId: 'campaign-2', approvalRef: 'approval:1' } }), 'campaign-approval-mismatch'],
  ['message approval absent', i => ({ ...i, messageApproval: undefined }), 'message-approval-missing'],
  ['message approved for other bytes', i => ({ ...i, messageApproval: { approvedDigest: outboundMessageDigest(message({ body: 'Other body.' })) } }), 'message-digest-mismatch'],
  ['rate window absent', i => ({ ...i, rateWindow: undefined }), 'rate-cap-missing'],
  ['rate cap reached', i => ({ ...i, rateWindow: { sentCount: 50, cap: 50 } }), 'rate-cap-exceeded'],
  ['retry budget absent', i => ({ ...i, retry: undefined }), 'retry-budget-missing'],
  ['retry budget exhausted', i => ({ ...i, retry: { attempts: 2, budget: 2 } }), 'retry-budget-exhausted'],
  ['message subject missing', i => ({ ...i, message: { ...i.message, subject: '' } }), 'message-malformed'],
  ['message subject carries a header break', i => ({ ...i, message: { ...i.message, subject: 'Evidence\r\nBcc: x' } }), 'message-malformed'],
  ['message text differs from body', i => ({ ...i, message: { ...i.message, text: 'Different text.' } }), 'message-text-body-mismatch'],
  ['environment is not an object', i => ({ ...i, environment: 'OUTBOUND_EMERGENCY_STOP=1' }), 'environment-malformed']
];

for (const [label, mutate, code] of MISSING_REQUIREMENTS) {
  test(`NO_SEND when ${label}`, () => {
    const r = decideOutboundSend(mutate(fullInput()));
    assert.equal(r.decision, 'NO_SEND');
    assert.ok(r.reasonCodes.includes(code), `expected ${code} in ${JSON.stringify(r.reasonCodes)}`);
    assert.match(r.decisionDigest, HEX64);
  });
}

test('emergency stop flag forces NO_SEND even with full evidence', () => {
  const r = decideOutboundSend(fullInput({ emergencyStop: true }));
  assert.equal(r.decision, 'NO_SEND');
  assert.deepEqual(r.reasonCodes, ['emergency-stop-active']);
});

test('OUTBOUND_EMERGENCY_STOP forces NO_SEND for any value except the explicit off values 0 and false', () => {
  assert.deepEqual(decideOutboundSend(fullInput({ environment: { OUTBOUND_EMERGENCY_STOP: '1' } })).reasonCodes, ['emergency-stop-active']);
  assert.deepEqual(decideOutboundSend(fullInput({ environment: { OUTBOUND_EMERGENCY_STOP: ' 1 ' } })).reasonCodes, ['emergency-stop-active']);
  assert.equal(decideOutboundSend(fullInput({ environment: { OUTBOUND_EMERGENCY_STOP: '0' } })).decision, 'ALLOW');
  assert.equal(decideOutboundSend(fullInput({ environment: { OUTBOUND_EMERGENCY_STOP: 'true' } })).decision, 'NO_SEND');
  assert.equal(decideOutboundSend(fullInput({ environment: { OUTBOUND_EMERGENCY_STOP: 'yes' } })).decision, 'NO_SEND');
  assert.equal(decideOutboundSend(fullInput({ environment: { OUTBOUND_EMERGENCY_STOP: '' } })).decision, 'NO_SEND');
  assert.equal(decideOutboundSend(fullInput({ environment: { OUTBOUND_EMERGENCY_STOP: 'false' } })).decision, 'ALLOW');
  assert.equal(decideOutboundSend(fullInput({ emergencyStop: 'yes' })).decision, 'NO_SEND');
});

test('with no environment override the process environment is read for the emergency stop', () => {
  const { environment, ...rest } = fullInput();
  const previous = process.env.OUTBOUND_EMERGENCY_STOP;
  try {
    process.env.OUTBOUND_EMERGENCY_STOP = '1';
    assert.deepEqual(decideOutboundSend(rest).reasonCodes, ['emergency-stop-active']);
    delete process.env.OUTBOUND_EMERGENCY_STOP;
    assert.equal(decideOutboundSend(rest).decision, 'ALLOW');
  } finally {
    if (previous === undefined) delete process.env.OUTBOUND_EMERGENCY_STOP;
    else process.env.OUTBOUND_EMERGENCY_STOP = previous;
  }
});

test('an approval for message A cannot authorize message B from the same sender', () => {
  const a = message({ body: 'Body A.' });
  const b = message({ body: 'Body B.' });
  const r = decideOutboundSend(fullInput({ message: b, messageApproval: { approvedDigest: outboundMessageDigest(a) } }));
  assert.equal(r.decision, 'NO_SEND');
  assert.ok(r.reasonCodes.includes('message-digest-mismatch'));
});

test('an approval for slot X cannot send from slot Y', () => {
  const r = decideOutboundSend(fullInput({ expectedSender: { accountId: 'acct-1', slot: 'slot-2', email: SENDER_EMAIL } }));
  assert.equal(r.decision, 'NO_SEND');
  assert.ok(r.reasonCodes.includes('sender-identity-mismatch'));
});

test('message digest is exact: a case change in from or a body change alters the approval digest', () => {
  const base = outboundMessageDigest(message());
  assert.match(base, HEX64);
  assert.notEqual(outboundMessageDigest(message({ from: SENDER_EMAIL.toUpperCase() })), base);
  assert.notEqual(outboundMessageDigest(message({ body: BODY + ' ' })), base);
  assert.equal(outboundMessageDigest(message()), base);
});

test('decision digest is deterministic, distinguishes outcomes and slots, and carries no address, body or secret', () => {
  const allow1 = decideOutboundSend(fullInput());
  const allow2 = decideOutboundSend(fullInput());
  assert.equal(allow1.decisionDigest, allow2.decisionDigest);

  const denied = decideOutboundSend(fullInput({ emergencyStop: true }));
  assert.notEqual(denied.decisionDigest, allow1.decisionDigest);

  const otherSlot = decideOutboundSend(fullInput({
    expectedSender: { accountId: 'acct-1', slot: 'slot-2', email: SENDER_EMAIL },
    sender: { ...fullInput().sender, slot: 'slot-2' }
  }));
  assert.equal(otherSlot.decision, 'ALLOW');
  assert.notEqual(otherSlot.decisionDigest, allow1.decisionDigest);

  const serialized = JSON.stringify([allow1, denied, otherSlot]);
  for (const forbidden of [SENDER_EMAIL, BUYER, BODY, PASSWORD, 'Evidence pack', 'optout@prospect', 'stop@prospect']) {
    assert.equal(serialized.includes(forbidden), false, `digest output leaked ${forbidden}`);
  }
});

test('malformed or hostile input fails closed without throwing or echoing the thrown message', () => {
  assert.deepEqual(decideOutboundSend(undefined).reasonCodes, ['input-not-object']);
  assert.deepEqual(decideOutboundSend('not-an-object').reasonCodes, ['input-not-object']);
  const trap = fullInput();
  Object.defineProperty(trap, 'campaignId', { get() { throw new Error('synthetic-getter-failure'); } });
  const r = decideOutboundSend(trap);
  assert.equal(r.decision, 'NO_SEND');
  assert.ok(r.reasonCodes.includes('authorization-evaluation-threw'));
  assert.equal(JSON.stringify(r).includes('synthetic-getter-failure'), false);
});

test('a rejecting asynchronous consent verifier is refused without an unhandled rejection', async () => {
  const r = decideOutboundSend(fullInput({ verifyConsent: async () => { throw new Error('synthetic-async-failure'); } }));
  assert.equal(r.decision, 'NO_SEND');
  assert.ok(r.reasonCodes.includes('consent-verifier-async'));
  await new Promise(resolve => setImmediate(resolve));
});

test('dispatch ALLOW path sends through the injected transport with the authorization stripped', async () => {
  const acct = account();
  const msg = message({ to: BUYER });
  let sent = null;
  const r = await dispatchSmtpFleetAccount({
    account: acct,
    encryptionKey: KEY,
    message: { ...msg, authorization: authorizationFor(acct, msg) },
    consentVerifier: ALLOW_CONSENT,
    transportFactory: () => ({
      ok: true,
      send: async m => {
        sent = m;
        return { confirmed: true, providerReceiptId: 'smtp250:allow-1', messageId: '<allow@example.invalid>' };
      }
    })
  });
  assert.equal(r.classification, 'ACCEPTED');
  assert.equal(r.providerCallAttempted, true);
  assert.ok(sent, 'transport was not called');
  assert.equal('authorization' in sent, false);
  assert.equal(sent.from, SENDER_EMAIL);
  assert.equal(sent.to, BUYER);
  assert.equal(sent.body, BODY);
});

test('refused dispatch opens no credential and constructs no transport', async () => {
  const acct = account();
  const spy = spiedAccount(acct);
  const msg = message({ to: BUYER });
  let factories = 0;
  let sends = 0;
  const r = await dispatchSmtpFleetAccount({
    account: spy.account,
    encryptionKey: KEY,
    message: { ...msg, authorization: authorizationFor(acct, msg, { campaignApproval: { campaignId: 'campaign-1', approvalRef: '' } }) },
    consentVerifier: ALLOW_CONSENT,
    transportFactory: () => {
      factories++;
      return { ok: true, send: async () => { sends++; return { confirmed: true, providerReceiptId: 'x' }; } };
    }
  });
  assert.equal(r.classification, 'REFUSED');
  assert.ok(r.reasonCodes.includes('campaign-approval-missing'));
  assert.equal(r.providerCallAttempted, false);
  assert.equal(r.effectBoundaryCrossed, false);
  assert.match(r.decisionDigest, HEX64);
  assert.equal(JSON.stringify(r).includes(PASSWORD), false);
  assert.equal(spy.reads(), 0, 'credential was opened for a refused send');
  assert.equal(factories, 0, 'transport was constructed for a refused send');
  assert.equal(sends, 0);
});

test('an authorization for message A cannot dispatch message B', async () => {
  const acct = account();
  const a = message({ to: BUYER, body: 'Body A.' });
  const b = message({ to: BUYER, body: 'Body B.' });
  const spy = spiedAccount(acct);
  let factories = 0;
  const r = await dispatchSmtpFleetAccount({
    account: spy.account,
    encryptionKey: KEY,
    message: { ...b, authorization: authorizationFor(acct, a) },
    consentVerifier: ALLOW_CONSENT,
    transportFactory: () => { factories++; return { ok: true, send: async () => ({ confirmed: true, providerReceiptId: 'x' }) }; }
  });
  assert.equal(r.classification, 'REFUSED');
  assert.ok(r.reasonCodes.includes('message-digest-mismatch'));
  assert.equal(spy.reads(), 0);
  assert.equal(factories, 0);
});

test('an authorization for slot-1 cannot send from slot-2 of the same mailbox', async () => {
  const slot1 = account('slot-1');
  const slot2 = account('slot-2');
  assert.equal(slot1.id, slot2.id, 'fixture expects the same account id across slots');
  const msg = message({ to: BUYER });
  const spy = spiedAccount(slot2);
  let factories = 0;
  const r = await dispatchSmtpFleetAccount({
    account: spy.account,
    encryptionKey: KEY,
    message: { ...msg, authorization: authorizationFor(slot1, msg) },
    consentVerifier: ALLOW_CONSENT,
    transportFactory: () => { factories++; return { ok: true, send: async () => ({ confirmed: true, providerReceiptId: 'x' }) }; }
  });
  assert.equal(r.classification, 'REFUSED');
  assert.ok(r.reasonCodes.includes('sender-identity-mismatch'));
  assert.equal(spy.reads(), 0);
  assert.equal(factories, 0);
});

test('dispatch with no authorization is refused before any credential or transport', async () => {
  const acct = account();
  const spy = spiedAccount(acct);
  let factories = 0;
  const r = await dispatchSmtpFleetAccount({
    account: spy.account,
    encryptionKey: KEY,
    message: message({ to: BUYER }),
    consentVerifier: ALLOW_CONSENT,
    transportFactory: () => { factories++; return { ok: true, send: async () => ({}) }; }
  });
  assert.equal(r.classification, 'REFUSED');
  assert.ok(r.reasonCodes.includes('campaign-id-missing'));
  assert.ok(r.reasonCodes.includes('message-approval-missing'));
  assert.equal(spy.reads(), 0);
  assert.equal(factories, 0);
});

test('a message cannot supply its own consent verifier or environment to widen its decision', async () => {
  const acct = account();
  const msg = message({ to: BUYER });
  const smuggled = {
    ...msg,
    authorization: {
      ...authorizationFor(acct, msg),
      verifyConsent: ALLOW_CONSENT,
      environment: { OUTBOUND_EMERGENCY_STOP: '0' }
    }
  };
  let factories = 0;
  const r = await dispatchSmtpFleetAccount({
    account: acct,
    encryptionKey: KEY,
    message: smuggled,
    transportFactory: () => { factories++; return { ok: true, send: async () => ({}) }; }
  });
  assert.equal(r.classification, 'REFUSED');
  assert.ok(r.reasonCodes.includes('consent-verifier-missing'));
  assert.equal(factories, 0);
});

test('a provider flag in the authorization cannot override an account whose own route is unauthorized', async () => {
  const base = account();
  const acct = { ...base, smtpRoute: { ...base.smtpRoute, authorized: false } };
  const msg = message({ to: BUYER });
  let factories = 0;
  const r = await dispatchSmtpFleetAccount({
    account: acct,
    encryptionKey: KEY,
    message: { ...msg, authorization: authorizationFor(acct, msg) },
    consentVerifier: ALLOW_CONSENT,
    transportFactory: () => { factories++; return { ok: true, send: async () => ({}) }; }
  });
  assert.equal(r.classification, 'REFUSED');
  assert.ok(r.reasonCodes.includes('provider-route-unauthorized'));
  assert.equal(factories, 0);
});

test('a message whose fields throw on read is refused before any credential or transport', async () => {
  const acct = account();
  const spy = spiedAccount(acct);
  const trap = message({ to: BUYER, authorization: authorizationFor(acct, message({ to: BUYER })) });
  Object.defineProperty(trap, 'body', { get() { throw new Error('synthetic-body-getter-failure'); } });
  let factories = 0;
  const r = await dispatchSmtpFleetAccount({
    account: spy.account,
    encryptionKey: KEY,
    message: trap,
    consentVerifier: ALLOW_CONSENT,
    transportFactory: () => { factories++; return { ok: true, send: async () => ({}) }; }
  });
  assert.equal(r.classification, 'REFUSED');
  assert.deepEqual(r.reasonCodes, ['authorization-input-threw']);
  assert.equal(JSON.stringify(r).includes('synthetic-body-getter-failure'), false);
  assert.equal(spy.reads(), 0);
  assert.equal(factories, 0);
});

test('the emergency stop environment blocks a dispatch whose authorization is otherwise complete', async () => {
  const acct = account();
  const msg = message({ to: BUYER });
  const previous = process.env.OUTBOUND_EMERGENCY_STOP;
  let factories = 0;
  try {
    process.env.OUTBOUND_EMERGENCY_STOP = '1';
    const r = await dispatchSmtpFleetAccount({
      account: acct,
      encryptionKey: KEY,
      message: { ...msg, authorization: authorizationFor(acct, msg) },
      consentVerifier: ALLOW_CONSENT,
      transportFactory: () => { factories++; return { ok: true, send: async () => ({}) }; }
    });
    assert.equal(r.classification, 'REFUSED');
    assert.deepEqual(r.reasonCodes, ['emergency-stop-active']);
    assert.equal(factories, 0);
  } finally {
    if (previous === undefined) delete process.env.OUTBOUND_EMERGENCY_STOP;
    else process.env.OUTBOUND_EMERGENCY_STOP = previous;
  }
});


test('an approval binds every field the transport receives, not only from, to, subject and body', () => {
  const base = message();
  assert.notEqual(outboundMessageDigest(base), outboundMessageDigest({ ...base, replyTo: 'unvetted-party@unvetted.example.invalid' }));
  assert.notEqual(outboundMessageDigest(base), outboundMessageDigest({ ...base, listUnsubscribe: '<mailto:x@unvetted.example.invalid>' }));
  const decision = decideOutboundSend(fullInput({
    messageApproval: { approvedDigest: outboundMessageDigest(base) },
    message: { ...base, replyTo: 'unvetted-party@unvetted.example.invalid' }
  }));
  assert.equal(decision.decision, 'NO_SEND');
  assert.ok(decision.reasonCodes.includes('message-digest-mismatch'));
});
