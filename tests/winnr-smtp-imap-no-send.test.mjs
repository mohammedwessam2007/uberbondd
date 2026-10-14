import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import {
  runWinnrSmtpReadinessProbe,
  probeWinnrImapReadiness,
  WINNR_IMAP_READINESS_COMMANDS
} from '../src/winnr-smtp-readiness.mjs';
import { createUberSmtpSubmissionTransport } from '../src/ubersmtp-submission-adapter.mjs';
import { buildEncryptedImapAccount } from '../src/uberimap.mjs';
import { encryptJson } from '../src/crypto.mjs';

// Hostile loopback proof. Fake SMTP and IMAP servers listen on 127.0.0.1 only and record every command verb they receive.
// The SMTP readiness path may send EHLO (the greeting that AUTH requires), AUTH, NOOP and QUIT. The IMAP readiness path
// may send CAPABILITY, LOGIN and LOGOUT. Any other verb is recorded as a violation, refused, and fails the assertions.
// Control tests send a forbidden verb on purpose and prove the harness sees it. Credentials are random per run and are
// never printed. Nothing leaves loopback.

const KEY = crypto.randomBytes(32).toString('hex');
const secret = () => crypto.randomBytes(18).toString('hex');
const NOW = new Date('2026-10-14T09:00:00.000Z');
const SMTP_ALLOWED = new Set(['EHLO', 'AUTH', 'NOOP', 'QUIT']);
const IMAP_ALLOWED = new Set(WINNR_IMAP_READINESS_COMMANDS);
const CLOSE_WAIT_MS = 1500;

// mode: 'accept' (full success), 'rejectAuth' (535 to AUTH), 'badGreeting' (554 instead of 220), 'rejectEhlo' (500 to EHLO).
function startFakeSmtp({ user = '', pass = '', mode = 'accept' } = {}) {
  const commands = [];
  const violations = [];
  const closed = [];
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    closed.push(new Promise(resolve => socket.once('close', resolve)));
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    if (mode === 'badGreeting') socket.write('554 synthetic refusal before the greeting\r\n');
    else socket.write('220 fake-submission.test ESMTP synthetic\r\n');
    let pending = '';
    socket.on('data', chunk => {
      pending += chunk.toString('latin1');
      let end;
      while ((end = pending.indexOf('\r\n')) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const parts = line.split(' ');
        const verb = parts[0].toUpperCase();
        commands.push(verb);
        if (!SMTP_ALLOWED.has(verb)) {
          violations.push(verb);
          socket.write('500 synthetic refusal of a forbidden command\r\n');
          continue;
        }
        if (verb === 'EHLO') {
          if (mode === 'rejectEhlo') socket.write('500 synthetic EHLO refusal\r\n');
          else socket.write('250-fake-submission.test\r\n250 AUTH PLAIN\r\n');
        } else if (verb === 'AUTH') {
          const [, username = '', password = ''] = Buffer.from(parts[2] || '', 'base64').toString('utf8').split('\0');
          const ok = mode === 'accept' && parts[1]?.toUpperCase() === 'PLAIN' && username === user && password === pass;
          socket.write(ok ? '235 authenticated\r\n' : '535 credentials rejected\r\n');
        } else if (verb === 'NOOP') socket.write('250 OK\r\n');
        else if (verb === 'QUIT') socket.end('221 closing\r\n');
      }
    });
  });
  return listen(server, sockets, commands, violations, closed);
}

function startFakeImap({ user = '', pass = '' } = {}) {
  const commands = [];
  const violations = [];
  const closed = [];
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    closed.push(new Promise(resolve => socket.once('close', resolve)));
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('* OK synthetic-imap ready\r\n');
    let pending = '';
    socket.on('data', chunk => {
      pending += chunk.toString('latin1');
      let end;
      while ((end = pending.indexOf('\r\n')) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const [tag = '', rawVerb = ''] = line.split(' ');
        const verb = rawVerb.toUpperCase();
        commands.push(verb);
        if (!IMAP_ALLOWED.has(verb)) {
          violations.push(verb);
          socket.write(`${tag} BAD synthetic refusal of a forbidden command\r\n`);
          continue;
        }
        if (verb === 'CAPABILITY') socket.write(`* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n${tag} OK CAPABILITY completed\r\n`);
        else if (verb === 'LOGIN') {
          const ok = line.includes(`"${user}"`) && line.includes(`"${pass}"`);
          socket.write(ok ? `${tag} OK LOGIN completed\r\n` : `${tag} NO LOGIN rejected\r\n`);
        } else if (verb === 'LOGOUT') socket.end(`* BYE synthetic logout\r\n${tag} OK LOGOUT completed\r\n`);
      }
    });
  });
  return listen(server, sockets, commands, violations, closed);
}

function listen(server, sockets, commands, violations, closed) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port,
      commands,
      violations,
      connections: closed.length,
      // Resolves to 'CLOSED' once every accepted connection has closed on the server side, or 'OPEN' after the wait.
      async closedWithin(ms) {
        let timer;
        const timeout = new Promise(done => { timer = setTimeout(() => done('OPEN'), ms); });
        const all = Promise.all(closed).then(() => 'CLOSED');
        const result = await Promise.race([all, timeout]);
        clearTimeout(timer);
        return result;
      },
      close: () => new Promise(done => {
        for (const socket of sockets) socket.destroy();
        server.close(() => done());
      })
    }));
  });
}

function memoryStore({ accounts = [], senderHealth = [] } = {}) {
  const state = { accounts: structuredClone(accounts), senderHealth: structuredClone(senderHealth), settings: {}, logs: [] };
  return {
    state,
    async list(key) { return structuredClone(state[key] || []); },
    async setSenderPaused(inbox, paused, reason = '') {
      const row = state.senderHealth.find(item => item.inbox === inbox);
      if (row) Object.assign(row, { paused: Boolean(paused), pauseReason: String(reason || '') });
      else state.senderHealth.push({ id: `sender_${inbox}`, inbox, paused: Boolean(paused), pauseReason: String(reason || '') });
    },
    async setSetting(key, value) { state.settings[key] = structuredClone(value); },
    async log(event, detail) { state.logs.push({ event, detail: structuredClone(detail) }); }
  };
}

function smtpAccount({ port, user, pass }) {
  return {
    id: 'smtp-loopback-1',
    slot: 'winnr:loopback-1',
    email: 'loopback-1@startup01.test',
    provider: 'smtp-relay',
    connected: true,
    tokens: encryptJson({ kind: 'smtp-basic', username: user, password: pass }, KEY),
    smtpRoute: { host: '127.0.0.1', port, secure: false, authorized: true, termsCompatible: true, evidenceRef: 'loopback-fixture' }
  };
}

function smtpTransport({ port, user, pass }) {
  return createUberSmtpSubmissionTransport({
    host: '127.0.0.1', port, secure: false, username: user, password: pass,
    authorized: true, termsCompatible: true, evidenceRef: 'loopback-fixture'
  });
}

test('SMTP readiness over loopback issues only EHLO, AUTH, NOOP and QUIT and sends no message', async () => {
  const user = `synthetic-${secret()}`;
  const pass = secret();
  const server = await startFakeSmtp({ user, pass });
  try {
    const store = memoryStore({ accounts: [smtpAccount({ port: server.port, user, pass })] });
    const receipt = await runWinnrSmtpReadinessProbe({ store, encryptionKey: KEY, quarantineOrdinalsText: '', now: NOW });
    assert.equal(receipt.readyAccounts, 1, JSON.stringify(receipt.results));
    assert.equal(receipt.providerCalls, 1);
    assert.equal(receipt.providerCallsComplete, true);
    assert.equal(receipt.messagesSent, 0);
    assert.equal(receipt.results[0].mailFromIssued, false);
    assert.equal(receipt.results[0].recipientsIssued, 0);
    assert.equal(receipt.results[0].dataIssued, false);
    assert.deepEqual(server.commands, ['EHLO', 'AUTH', 'NOOP', 'QUIT']);
    assert.deepEqual(server.violations, [], 'no forbidden SMTP verb reached the server');
    assert.equal(JSON.stringify(receipt).includes(pass), false);
  } finally {
    await server.close();
  }
});

test('a rejected SMTP AUTH stops before any envelope command and reports only the stage and response code', async () => {
  const user = `synthetic-${secret()}`;
  const pass = secret();
  const server = await startFakeSmtp({ user, pass, mode: 'rejectAuth' });
  try {
    const store = memoryStore({ accounts: [smtpAccount({ port: server.port, user, pass })] });
    const receipt = await runWinnrSmtpReadinessProbe({ store, encryptionKey: KEY, quarantineOrdinalsText: '', now: NOW });
    assert.equal(receipt.ok, false);
    assert.equal(receipt.readyAccounts, 0);
    assert.equal(receipt.results[0].errorStage, 'AUTH');
    assert.equal(receipt.results[0].smtpResponseCode, 535);
    assert.equal(receipt.messagesSent, 0);
    assert.deepEqual(server.commands, ['EHLO', 'AUTH']);
    assert.deepEqual(server.violations, []);
    assert.equal(server.commands.includes('MAIL'), false);
    assert.equal(server.commands.includes('RCPT'), false);
    assert.equal(server.commands.includes('DATA'), false);
    assert.equal(JSON.stringify(receipt).includes(pass), false);
  } finally {
    await server.close();
  }
});

test('control: a deliberate message send is caught by the SMTP harness as a forbidden MAIL verb', async () => {
  const user = `synthetic-${secret()}`;
  const pass = secret();
  const server = await startFakeSmtp({ user, pass });
  try {
    const transport = smtpTransport({ port: server.port, user, pass });
    await assert.rejects(transport.send({ from: 'loopback-1@startup01.test', to: 'recipient@loopback.test', subject: 'synthetic control', body: 'synthetic control' }));
    assert.ok(server.violations.includes('MAIL'), 'the harness recorded the forbidden MAIL verb');
    assert.equal(server.violations.includes('QUIT'), false, 'QUIT is allowed and is not a violation');
  } finally {
    await server.close();
  }
});

// Socket release. The transport opens a TCP connection before it can fail, and a failure after connect used to leave
// that connection open. The server sees the client's side close only when the client destroys its socket.

test('a failed AUTH destroys the TCP socket instead of leaving it open', async () => {
  const user = `synthetic-${secret()}`;
  const pass = secret();
  const server = await startFakeSmtp({ user, pass, mode: 'rejectAuth' });
  try {
    const transport = smtpTransport({ port: server.port, user, pass });
    const result = await transport.probe();
    assert.equal(result.confirmed, false);
    assert.equal(result.errorStage, 'AUTH');
    assert.equal(result.smtpResponseCode, 535);
    assert.equal(await server.closedWithin(CLOSE_WAIT_MS), 'CLOSED', 'the client socket was destroyed after the failed AUTH');
    assert.deepEqual(server.violations, []);
  } finally {
    await server.close();
  }
});

test('a rejected SMTP greeting destroys the TCP socket instead of leaving it open', async () => {
  const user = `synthetic-${secret()}`;
  const pass = secret();
  const server = await startFakeSmtp({ user, pass, mode: 'badGreeting' });
  try {
    const transport = smtpTransport({ port: server.port, user, pass });
    const result = await transport.probe();
    assert.equal(result.confirmed, false);
    assert.equal(result.errorStage, 'GREETING');
    assert.equal(await server.closedWithin(CLOSE_WAIT_MS), 'CLOSED', 'the client socket was destroyed after the bad greeting');
    assert.deepEqual(server.commands, []);
  } finally {
    await server.close();
  }
});

test('a rejected EHLO destroys the TCP socket instead of leaving it open', async () => {
  const user = `synthetic-${secret()}`;
  const pass = secret();
  const server = await startFakeSmtp({ user, pass, mode: 'rejectEhlo' });
  try {
    const transport = smtpTransport({ port: server.port, user, pass });
    const result = await transport.probe();
    assert.equal(result.confirmed, false);
    assert.equal(result.errorStage, 'EHLO');
    assert.equal(await server.closedWithin(CLOSE_WAIT_MS), 'CLOSED', 'the client socket was destroyed after the rejected EHLO');
    assert.deepEqual(server.commands, ['EHLO']);
    assert.deepEqual(server.violations, []);
  } finally {
    await server.close();
  }
});

test('IMAP readiness over loopback issues only CAPABILITY, LOGIN and LOGOUT and reads no mailbox', async () => {
  const user = `synthetic-${secret()}`;
  const pass = secret();
  const server = await startFakeImap({ user, pass });
  try {
    const built = buildEncryptedImapAccount({
      slot: 'winnr-imap:loopback-1', email: 'loopback-1@startup01.test', host: '127.0.0.1', port: server.port, secure: false,
      username: user, password: pass, evidenceRef: 'loopback-fixture', authorized: true, termsCompatible: true
    }, KEY);
    assert.equal(built.ok, true);
    const result = await probeWinnrImapReadiness({ account: built.account, encryptionKey: KEY, timeoutMs: 5000 });
    assert.equal(result.ok, true, result.classification);
    assert.equal(result.classification, 'CAPABILITY_LOGIN_CONFIRMED');
    assert.deepEqual(result.commandsIssued, ['CAPABILITY', 'LOGIN', 'LOGOUT']);
    assert.deepEqual(server.commands, ['CAPABILITY', 'LOGIN', 'LOGOUT']);
    assert.deepEqual(server.violations, [], 'no forbidden IMAP verb reached the server');
    assert.equal(result.mailboxSelected, false);
    assert.equal(result.messagesRead, 0);
    assert.equal(result.messagesSent, 0);
    assert.equal(JSON.stringify(result).includes(pass), false);
  } finally {
    await server.close();
  }
});

test('a rejected IMAP LOGIN is classified as AUTH_REJECTED and sends no further command', async () => {
  const user = `synthetic-${secret()}`;
  const pass = secret();
  const server = await startFakeImap({ user, pass });
  try {
    const built = buildEncryptedImapAccount({
      slot: 'winnr-imap:loopback-2', email: 'loopback-2@startup01.test', host: '127.0.0.1', port: server.port, secure: false,
      username: user, password: secret(), evidenceRef: 'loopback-fixture', authorized: true, termsCompatible: true
    }, KEY);
    const result = await probeWinnrImapReadiness({ account: built.account, encryptionKey: KEY, timeoutMs: 5000 });
    assert.equal(result.ok, false);
    assert.equal(result.classification, 'AUTH_REJECTED');
    assert.deepEqual(result.commandsIssued, ['CAPABILITY', 'LOGIN']);
    assert.deepEqual(server.commands, ['CAPABILITY', 'LOGIN']);
    assert.deepEqual(server.violations, []);
  } finally {
    await server.close();
  }
});

test('an unreachable IMAP route sends no command at all', async () => {
  const server = await startFakeImap({ user: 'u', pass: 'p' });
  const port = server.port;
  await server.close();
  const built = buildEncryptedImapAccount({
    slot: 'winnr-imap:loopback-3', email: 'loopback-3@startup01.test', host: '127.0.0.1', port, secure: false,
    username: 'u', password: 'p', evidenceRef: 'loopback-fixture', authorized: true, termsCompatible: true
  }, KEY);
  const result = await probeWinnrImapReadiness({ account: built.account, encryptionKey: KEY, timeoutMs: 2000 });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'CONNECT');
  assert.deepEqual(result.commandsIssued, []);
});

test('control: a deliberate SELECT is caught by the IMAP harness as a forbidden verb', async () => {
  const user = `synthetic-${secret()}`;
  const pass = secret();
  const server = await startFakeImap({ user, pass });
  try {
    await new Promise((resolve, reject) => {
      let received = '';
      const socket = net.connect({ host: '127.0.0.1', port: server.port }, () => {
        socket.write('C1 SELECT INBOX\r\n');
      });
      // Wait for the refusal to the SELECT itself, not the greeting, so the violation is already recorded.
      socket.on('data', chunk => {
        received += chunk.toString('latin1');
        if (received.includes('C1 BAD')) { socket.destroy(); resolve(); }
      });
      socket.on('error', reject);
    });
    assert.deepEqual(server.violations, ['SELECT'], 'the harness recorded the forbidden SELECT verb');
  } finally {
    await server.close();
  }
});

test('the SMTP readiness gate never opens an IMAP connection and never calls the IMAP stage diagnostic', async () => {
  const user = `synthetic-${secret()}`;
  const pass = secret();
  const smtp = await startFakeSmtp({ user, pass });
  const imap = await startFakeImap({ user, pass });
  try {
    const imapBuilt = buildEncryptedImapAccount({
      slot: 'winnr-imap:loopback-4', email: 'loopback-4@startup01.test', host: '127.0.0.1', port: imap.port, secure: false,
      username: user, password: pass, evidenceRef: 'loopback-fixture', authorized: true, termsCompatible: true
    }, KEY);
    const store = memoryStore({ accounts: [smtpAccount({ port: smtp.port, user, pass }), { ...imapBuilt.account, connected: true }] });
    const receipt = await runWinnrSmtpReadinessProbe({ store, encryptionKey: KEY, quarantineOrdinalsText: '', now: NOW });
    assert.equal(receipt.readyAccounts, 1);
    assert.equal(imap.connections, 0, 'the readiness gate opened no IMAP connection');
    assert.deepEqual(imap.commands, [], 'the readiness gate sent no IMAP command');
    assert.deepEqual(smtp.commands, ['EHLO', 'AUTH', 'NOOP', 'QUIT']);

    // Code, not comments: the module may explain the separation in prose, but it must neither import the SELECT/FETCH
    // diagnostic nor call it.
    const source = await fs.readFile(new URL('../src/winnr-smtp-readiness.mjs', import.meta.url), 'utf8');
    assert.equal(/from\s+['"]\.\/winnr-imap-stage-diagnostic\.mjs['"]/.test(source), false, 'the readiness module does not import the SELECT/FETCH diagnostic');
    assert.equal(/\bdiagnoseWinnrImapStages\s*\(/.test(source), false, 'the readiness module never calls the SELECT/FETCH diagnostic');
  } finally {
    await smtp.close();
    await imap.close();
  }
});
