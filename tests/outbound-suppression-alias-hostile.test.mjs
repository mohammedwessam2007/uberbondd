import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decideOutboundSend, outboundMessageDigest } from '../src/outbound-send-authorization.mjs';
import { buildEncryptedSmtpAccount, dispatchSmtpFleetAccount } from '../src/uberfleet.mjs';
import { suppressionLookup } from '../src/send-safety.mjs';
import { Store } from '../src/store.mjs';

// Hostile address-alias fixtures for suppression and do-not-contact membership. Every identity is synthetic (.invalid or
// .example). No network, no real credentials. A counting transport proves that a refused alias crosses no provider boundary.
const KEY = 'e'.repeat(64);
const SENDER_EMAIL = 'ops@mail.example.invalid';
const BODY = 'Synthetic body text for fixtures.';
const PASSWORD = 'synthetic-not-a-secret';
const ALLOW_CONSENT = ({ consentReceiptRef }) => consentReceiptRef === 'consent:1';

const SUPPRESSED = 'optout@prospect.example.invalid';
const DNC_LISTED = 'stop@prospect.example.invalid';
const BUYER = 'buyer@prospect.example.invalid';
const GMAIL_SUPPRESSED = 'optout@gmail.com';

// Alias spellings of an address that is on the list. Each one names the same recipient mailbox.
const SUPPRESSED_ALIASES = [
  'OPTOUT@Prospect.Example.Invalid',
  'optout+promo@prospect.example.invalid',
  'optout+a+b@prospect.example.invalid',
  'optout@prospect.example.invalid.',
  '<optout@prospect.example.invalid>',
  '<Optout+promo@prospect.example.invalid.>',
  // Stray or unpaired brackets and trailing separators. A transport may strip them, so they must not slip past the list.
  'optout@prospect.example.invalid>',
  '<optout@prospect.example.invalid',
  'optout@prospect.example.invalid>>',
  '<<optout@prospect.example.invalid>',
  'optout@prospect.example.invalid.>',
  'optout@prospect.example.invalid;'
];

// Gmail and googlemail treat dots in the local part as insignificant and googlemail.com as gmail.com.
const GMAIL_ALIASES = [
  'o.p.t.out@gmail.com',
  'optout@googlemail.com',
  'Opt.Out+promo@GoogleMail.com',
  '<o.ptout+x@gmail.com>',
  'optout@gmail.com.'
];

// Addresses that are genuinely different mailboxes and must stay ALLOW.
const DIFFERENT_RECIPIENTS = [
  BUYER,
  '<buyer@prospect.example.invalid>',
  'optout2@prospect.example.invalid',
  '<optout2@prospect.example.invalid.>',
  'o.p.t.out@prospect.example.invalid',
  'optout@prospect.example.org',
  'optout@gmail.com'
];

function message(to) {
  return { from: SENDER_EMAIL, to, subject: 'Evidence pack', body: BODY };
}

// A decision input where every requirement passes for one exact message. Only the recipient and the lists vary.
function fullInput(to, over = {}) {
  const msg = message(to);
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
    suppression: { snapshotId: 'supp-1', entries: [SUPPRESSED] },
    doNotContact: { listId: 'dnc-1', entries: [DNC_LISTED] },
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

function account() {
  return buildEncryptedSmtpAccount({
    slot: 'slot-1', email: SENDER_EMAIL, host: 'smtp.example.invalid', username: SENDER_EMAIL, password: PASSWORD,
    sendingDomainId: 'd1', sendingMailboxId: 'm1', sendingWorkspaceId: 'w1',
    routeEvidenceRef: 'receipt:route-1', routeAuthorized: true, termsCompatible: true
  }, KEY).account;
}

// The authorization package the dispatch path receives, bound to the exact message it approves.
function dispatchAuthorization(acct, msg) {
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
    suppression: { snapshotId: 'supp-1', entries: [SUPPRESSED] },
    doNotContact: { listId: 'dnc-1', entries: [DNC_LISTED] },
    jurisdictionEvidence: { jurisdiction: 'JX-TEST', allowed: true, evidenceRef: 'jur:1' },
    consent: { receiptRef: 'consent:1' },
    campaignApproval: { campaignId: 'campaign-1', approvalRef: 'approval:1' },
    messageApproval: { approvedDigest: outboundMessageDigest(msg) },
    rateWindow: { sentCount: 0, cap: 10 },
    retry: { attempts: 0, budget: 3 },
    emergencyStop: false
  };
}

function countingTransport() {
  const log = { built: 0, sends: [] };
  log.factory = () => {
    log.built += 1;
    return {
      ok: true,
      send: async msg => {
        log.sends.push(msg);
        return { confirmed: true, providerReceiptId: `smtp250:alias-${log.sends.length}`, messageId: `<alias-${log.sends.length}@example.invalid>` };
      }
    };
  };
  return log;
}

async function dispatchTo(to, transport) {
  const acct = account();
  const msg = message(to);
  return dispatchSmtpFleetAccount({
    account: acct,
    encryptionKey: KEY,
    message: { ...msg, authorization: dispatchAuthorization(acct, msg) },
    consentVerifier: ALLOW_CONSENT,
    transportFactory: transport.factory
  });
}

test('every alias of a suppressed address is refused with a suppression reason code', () => {
  for (const alias of SUPPRESSED_ALIASES) {
    const decision = decideOutboundSend(fullInput(alias));
    assert.equal(decision.decision, 'NO_SEND', `alias ${alias} must not be allowed`);
    assert.ok(decision.reasonCodes.includes('recipient-suppressed'), `alias ${alias} must carry recipient-suppressed, got ${decision.reasonCodes}`);
  }
});

test('every Gmail or googlemail alias of a suppressed Gmail address is refused with a suppression reason code', () => {
  for (const alias of GMAIL_ALIASES) {
    const decision = decideOutboundSend(fullInput(alias, { suppression: { snapshotId: 'supp-1', entries: [GMAIL_SUPPRESSED] } }));
    assert.equal(decision.decision, 'NO_SEND', `alias ${alias} must not be allowed`);
    assert.ok(decision.reasonCodes.includes('recipient-suppressed'), `alias ${alias} must carry recipient-suppressed, got ${decision.reasonCodes}`);
  }
});

test('an alias of a do-not-contact address is refused with a do-not-contact reason code', () => {
  for (const alias of ['Stop+promo@prospect.example.invalid', '<stop@prospect.example.invalid.>', '<stop@prospect.example.invalid']) {
    const decision = decideOutboundSend(fullInput(alias));
    assert.equal(decision.decision, 'NO_SEND', `alias ${alias} must not be allowed`);
    assert.ok(decision.reasonCodes.includes('recipient-do-not-contact'), `alias ${alias} must carry recipient-do-not-contact, got ${decision.reasonCodes}`);
  }
});

test('the alias refusal is also reached through the dispatch path with zero transport construction and zero sends', async () => {
  for (const alias of SUPPRESSED_ALIASES) {
    const transport = countingTransport();
    const result = await dispatchTo(alias, transport);
    assert.equal(result.classification, 'REFUSED', `alias ${alias} must be refused at dispatch`);
    assert.ok(result.reasonCodes.includes('recipient-suppressed'), `alias ${alias} must carry recipient-suppressed, got ${result.reasonCodes}`);
    assert.equal(result.providerCallAttempted, false);
    assert.equal(transport.built, 0, `alias ${alias} must build no transport`);
    assert.equal(transport.sends.length, 0, `alias ${alias} must make no transport call`);
  }
});

test('genuinely different recipients are still ALLOW in the positive fixture', () => {
  for (const to of DIFFERENT_RECIPIENTS) {
    const decision = decideOutboundSend(fullInput(to));
    assert.equal(decision.decision, 'ALLOW', `${to} is a different mailbox and must be ALLOW, got ${decision.reasonCodes}`);
    assert.deepEqual(decision.reasonCodes, []);
  }
});

test('a genuinely different recipient dispatches exactly once through the injected transport', async () => {
  const transport = countingTransport();
  const result = await dispatchTo(BUYER, transport);
  assert.equal(result.classification, 'ACCEPTED');
  assert.equal(transport.built, 1);
  assert.equal(transport.sends.length, 1);
});

test('alias folding does not widen the do-not-contact match to a different local part', () => {
  const decision = decideOutboundSend(fullInput('stop2@prospect.example.invalid'));
  assert.equal(decision.decision, 'ALLOW', JSON.stringify(decision.reasonCodes));
});

test('suppressionLookup refuses a plus-tag, angle-bracket and Gmail-dot alias of a stored address', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-suppression-alias-'));
  try {
    const store = new Store(dir);
    await store.init();
    await store.add('suppressions', { id: 'sup-prospect', value: SUPPRESSED, reason: 'optout' });
    await store.add('suppressions', { id: 'sup-gmail', value: GMAIL_SUPPRESSED, reason: 'optout' });

    for (const email of ['optout+promo@prospect.example.invalid', '<optout@prospect.example.invalid>', 'OPTOUT@prospect.example.invalid', 'optout@prospect.example.invalid>']) {
      const hit = await suppressionLookup(store, { email });
      assert.equal(hit.suppressed, true, `lookup of ${email} must be suppressed`);
      assert.equal(hit.matchedValue, SUPPRESSED);
    }
    for (const email of ['o.p.t.out@googlemail.com', 'Opt.Out+promo@GoogleMail.com']) {
      const hit = await suppressionLookup(store, { email });
      assert.equal(hit.suppressed, true, `lookup of ${email} must be suppressed`);
      assert.equal(hit.matchedValue, GMAIL_SUPPRESSED);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('suppressionLookup still allows a genuinely different address and keeps domain-level suppression', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-suppression-alias-'));
  try {
    const store = new Store(dir);
    await store.init();
    await store.add('suppressions', { id: 'sup-prospect', value: SUPPRESSED, reason: 'optout' });
    await store.add('suppressions', { id: 'sup-domain', value: 'blocked.example.invalid', reason: 'domain-block' });

    const different = await suppressionLookup(store, { email: BUYER });
    assert.equal(different.suppressed, false);
    assert.equal(different.matchedValue, '');

    const dotSignificant = await suppressionLookup(store, { email: 'o.p.t.out@prospect.example.invalid' });
    assert.equal(dotSignificant.suppressed, false, 'dots are significant off the Gmail domains');

    const domain = await suppressionLookup(store, { website: 'https://blocked.example.invalid/contact', email: BUYER });
    assert.equal(domain.suppressed, true);
    assert.equal(domain.matchedValue, 'blocked.example.invalid');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
