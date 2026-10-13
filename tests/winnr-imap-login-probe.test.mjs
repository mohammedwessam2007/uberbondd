import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { buildEncryptedImapAccount } from '../src/uberimap.mjs';
import { probeWinnrImapLoginOnly } from '../src/winnr-imap-login-probe.mjs';

const KEY = 'cd'.repeat(32);
const EVIDENCE = 'owner-mission:UBERBOND_WINNR_FLEET_FINAL_INTEGRATION_2026-10-13';

function imapAccount(password = 'fixture-password-value') {
  const built = buildEncryptedImapAccount({
    slot: 'winnr-imap:box1@fixture-startup.co',
    email: 'box1@fixture-startup.co',
    host: 'inbound.example.test',
    port: 993,
    secure: true,
    username: 'box1@fixture-startup.co',
    password,
    evidenceRef: EVIDENCE,
    authorized: true,
    termsCompatible: true
  }, KEY);
  assert.equal(built.ok, true);
  return built.account;
}

// Scripted IMAP peer: answers each tagged command from a map keyed by the command verb.
class ScriptedImap extends EventEmitter {
  constructor(replies) {
    super();
    this.replies = replies;
    this.sent = [];
    this.ended = false;
  }
  write(data) {
    const line = String(data).replace(/\r\n$/, '');
    this.sent.push(line);
    const [tag, ...rest] = line.split(' ');
    const verb = rest[0].toUpperCase();
    const reply = this.replies[verb];
    if (reply === undefined) return;
    setImmediate(() => this.emit('data', Buffer.from(reply.replace(/TAG/g, tag))));
  }
  end() { this.ended = true; }
}

const greetedFactory = socket => async () => socket;

test('login-only probe authenticates with LOGIN and LOGOUT and touches no mailbox', async () => {
  const socket = new ScriptedImap({
    LOGIN: 'TAG OK [CAPABILITY IMAP4rev1] LOGIN completed\r\n',
    LOGOUT: '* BYE logging out\r\nTAG OK LOGOUT completed\r\n'
  });
  const result = await probeWinnrImapLoginOnly({ account: imapAccount(), encryptionKey: KEY, connectFactory: greetedFactory(socket), timeoutMs: 2000 });
  assert.equal(result.classification, 'AUTH_CONFIRMED');
  assert.equal(result.loginAccepted, true);
  assert.equal(result.mailboxSelected, false);
  assert.equal(result.messageContentRead, false);
  assert.equal(result.messagesRead, 0);
  assert.equal(result.messagesSent, 0);
  const verbs = socket.sent.map(line => line.split(' ')[1].toUpperCase());
  assert.deepEqual(verbs, ['LOGIN', 'LOGOUT']);
  assert.equal(socket.ended, true);
});

test('a rejected LOGIN is classified AUTH_REJECTED with only the bounded response code', async () => {
  const socket = new ScriptedImap({
    LOGIN: 'TAG NO [AUTHENTICATIONFAILED] Invalid credentials\r\n'
  });
  const result = await probeWinnrImapLoginOnly({ account: imapAccount(), encryptionKey: KEY, connectFactory: greetedFactory(socket), timeoutMs: 2000 });
  assert.equal(result.classification, 'AUTH_REJECTED');
  assert.equal(result.responseCode, 'AUTHENTICATIONFAILED');
  assert.equal(result.loginAccepted, false);
  assert.equal(JSON.stringify(result).includes('Invalid credentials'), false);
  assert.deepEqual(socket.sent.map(line => line.split(' ')[1].toUpperCase()), ['LOGIN']);
});

test('a timed-out connection is classified as transport unreachable without attempting login', async () => {
  const connectFactory = async () => {
    const error = new Error('imap-connect-timeout');
    error.code = 'ETIMEDOUT';
    throw error;
  };
  const result = await probeWinnrImapLoginOnly({ account: imapAccount(), encryptionKey: KEY, connectFactory, timeoutMs: 2000 });
  assert.equal(result.classification, 'TRANSPORT_UNREACHABLE');
  assert.equal(result.errorClass, 'ETIMEDOUT');
  assert.equal(result.connectAttempted, true);
  assert.equal(result.loginAttempted, false);
  assert.equal(result.loginAccepted, false);
});

test('a TLS failure is classified separately from unreachability', async () => {
  const connectFactory = async () => {
    const error = new Error('certificate has expired');
    error.code = 'CERT_HAS_EXPIRED';
    throw error;
  };
  const result = await probeWinnrImapLoginOnly({ account: imapAccount(), encryptionKey: KEY, connectFactory, timeoutMs: 2000 });
  assert.equal(result.classification, 'TLS_OR_GREETING_FAILED');
  assert.equal(result.loginAttempted, false);
});

test('a credential that does not open with the supplied key is refused before any connection', async () => {
  let connected = false;
  const result = await probeWinnrImapLoginOnly({
    account: imapAccount(),
    encryptionKey: 'ef'.repeat(32),
    connectFactory: async () => { connected = true; return new ScriptedImap({}); }
  });
  assert.equal(result.classification, 'CREDENTIAL_UNAVAILABLE');
  assert.equal(result.connectAttempted, false);
  assert.equal(connected, false);
});

test('a password containing a line break is refused before any connection', async () => {
  let connected = false;
  const result = await probeWinnrImapLoginOnly({
    account: imapAccount('line\r\nbreak'),
    encryptionKey: KEY,
    connectFactory: async () => { connected = true; return new ScriptedImap({}); }
  });
  assert.equal(result.classification, 'CREDENTIAL_UNSAFE_FOR_LITERAL');
  assert.equal(connected, false);
});

test('an aggregate connect failure is classified by its real per-family cause, not as TLS', async () => {
  const connectFactory = async () => {
    const error = new Error('imap-connect-failed:4:ETIMEDOUT|6:ETIMEDOUT');
    error.code = 'IMAP_CONNECT_FAILED';
    error.reasonCodes = ['4:ETIMEDOUT', '6:ETIMEDOUT'];
    throw error;
  };
  const result = await probeWinnrImapLoginOnly({ account: imapAccount(), encryptionKey: KEY, connectFactory, timeoutMs: 2000 });
  assert.equal(result.classification, 'TRANSPORT_UNREACHABLE');
  assert.equal(result.errorClass, 'ETIMEDOUT');
  assert.equal(result.loginAttempted, false);
});

test('an aggregate connect failure with a certificate cause is TLS_OR_GREETING_FAILED', async () => {
  const connectFactory = async () => {
    const error = new Error('imap-connect-failed:4:CERT_HAS_EXPIRED');
    error.code = 'IMAP_CONNECT_FAILED';
    error.reasonCodes = ['4:CERT_HAS_EXPIRED'];
    throw error;
  };
  const result = await probeWinnrImapLoginOnly({ account: imapAccount(), encryptionKey: KEY, connectFactory, timeoutMs: 2000 });
  assert.equal(result.classification, 'TLS_OR_GREETING_FAILED');
  assert.equal(result.errorClass, 'CERT_HAS_EXPIRED');
});
