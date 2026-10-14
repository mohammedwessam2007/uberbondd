import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildEncryptedSmtpAccount, selectFleetMailbox } from '../src/uberfleet.mjs';
import { buildEncryptedImapAccount } from '../src/uberimap.mjs';

const KEY = crypto.randomBytes(32).toString('hex');
const NOW = new Date('2026-10-13T12:00:00.000Z');

function smtp(slot, email) {
  return buildEncryptedSmtpAccount({
    slot, email, host: 'smtp.relay.test', username: email, password: crypto.randomBytes(12).toString('hex'),
    sendingDomainId: 'dom-test', sendingMailboxId: 'mbx-test', sendingWorkspaceId: 'workspace-test',
    routeEvidenceRef: 'receipt:route-test', routeAuthorized: true, termsCompatible: true
  }, KEY).account;
}

function imap(slot, email, { connected = true } = {}) {
  const built = buildEncryptedImapAccount({
    slot, email, host: 'imap.relay.test', username: email, password: crypto.randomBytes(12).toString('hex'),
    evidenceRef: 'receipt:route-test', authorized: true, termsCompatible: true
  }, KEY).account;
  return { ...built, connected };
}

test('an IMAP-forwarding account is never selected for the SMTP relay, even when connected', () => {
  const account = imap('winnr-imap:hello@imap-only.test', 'hello@imap-only.test', { connected: true });
  const r = selectFleetMailbox({ prospectId: 'p1', accounts: [account], senderHealth: [], provider: 'smtp-relay', date: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'UBERFLEET_NO_ELIGIBLE_MAILBOX');
});

test('an empty provider never selects any account, SMTP or IMAP', () => {
  const accounts = [smtp('winnr:team@sender.test', 'team@sender.test'), imap('winnr-imap:team@imap-only.test', 'team@imap-only.test')];
  for (const provider of ['', undefined, null]) {
    const r = selectFleetMailbox({ prospectId: 'p1', accounts, senderHealth: [], provider, date: NOW });
    assert.equal(r.ok, false, `provider=${String(provider)} must fail closed`);
    assert.equal(r.status, 'UBERFLEET_NO_ELIGIBLE_MAILBOX');
  }
});

test('an SMTP account with no provider field is not selected under an empty provider filter', () => {
  const account = { ...smtp('winnr:sales@sender.test', 'sales@sender.test') };
  delete account.provider;
  const r = selectFleetMailbox({ prospectId: 'p1', accounts: [account], senderHealth: [], provider: '', date: NOW });
  assert.equal(r.ok, false);
});

test('provider IMAP-forwarding cannot be used to select an IMAP account', () => {
  const account = imap('winnr-imap:ops@imap-only.test', 'ops@imap-only.test');
  const r = selectFleetMailbox({ prospectId: 'p1', accounts: [account], senderHealth: [], provider: 'imap-forwarding', date: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'UBERFLEET_NO_ELIGIBLE_MAILBOX');
  assert.deepEqual(r.reasonCodes, ['provider-smtp-relay-required']);
});

test('provider match is exact: a differently cased relay name is refused rather than normalised', () => {
  const r = selectFleetMailbox({
    prospectId: 'p1', accounts: [smtp('winnr:ops@sender.test', 'ops@sender.test')], senderHealth: [], provider: 'SMTP-RELAY', date: NOW
  });
  assert.equal(r.ok, false);
});

test('with a mixed list, only the SMTP relay account is ever chosen', () => {
  const smtpAccount = smtp('winnr:growth@sender.test', 'growth@sender.test');
  const imapAccount = imap('winnr-imap:growth@sender.test', 'growth@sender.test', { connected: true });
  const r = selectFleetMailbox({
    prospectId: 'p1', accounts: [imapAccount, smtpAccount], senderHealth: [], provider: 'smtp-relay', date: NOW
  });
  assert.equal(r.ok, true);
  assert.equal(r.slot, 'winnr:growth@sender.test');
  assert.notEqual(r.accountId, imapAccount.id);
});

test('a held import (IMAP disconnected, SMTP paused) yields no selectable mailbox', () => {
  const smtpAccount = smtp('winnr:partnerships@sender.test', 'partnerships@sender.test');
  const imapAccount = imap('winnr-imap:partnerships@sender.test', 'partnerships@sender.test', { connected: false });
  const r = selectFleetMailbox({
    prospectId: 'p1',
    accounts: [smtpAccount, imapAccount],
    senderHealth: [{ inbox: smtpAccount.slot, paused: true, pauseReason: 'WINNR_PRODUCTION_IMPORT_HOLD' }],
    provider: 'smtp-relay',
    date: NOW
  });
  assert.equal(r.ok, false);
});
