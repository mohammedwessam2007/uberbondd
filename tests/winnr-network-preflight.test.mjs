import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { probeEndpoint, runNetworkPreflight, classifyPreflightError, WINNR_PREFLIGHT_TARGETS } from '../scripts/winnr-network-preflight.mjs';

// Local fixtures only. Nothing here contacts Winnr or any other host.

function listenPlain(onConnection) {
  return new Promise(resolve => {
    const received = { bytes: 0, text: '' };
    const server = net.createServer(socket => {
      socket.on('data', chunk => { received.bytes += chunk.length; received.text += chunk.toString('latin1'); });
      socket.on('error', () => {});
      onConnection(socket);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, received }));
  });
}

function closedPort() {
  return new Promise(resolve => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

let certDir = null;
let certPem = null;
let keyPem = null;
let opensslReady = false;
try {
  certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winnr-preflight-test-'));
  const keyPath = path.join(certDir, 'k.pem');
  const certPath = path.join(certDir, 'c.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  keyPem = fs.readFileSync(keyPath, 'utf8');
  certPem = fs.readFileSync(certPath, 'utf8');
  opensslReady = true;
} catch {
  opensslReady = false;
}
const TLS_SKIP = opensslReady ? false : 'openssl not available -- TLS preflight fixtures not generated';

function listenTls(greeting) {
  return new Promise(resolve => {
    const received = { text: '' };
    const server = tls.createServer({ key: keyPem, cert: certPem }, socket => {
      socket.on('data', chunk => { received.text += chunk.toString('latin1'); });
      socket.on('error', () => {});
      if (greeting) socket.write(greeting);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, received }));
  });
}

test('SMTP banner on 587: a 220 greeting is BANNER_OK and the client writes nothing', async () => {
  const { server, port, received } = await listenPlain(socket => socket.write('220 fixture ESMTP\r\n'));
  try {
    const result = await probeEndpoint({ host: '127.0.0.1', port, kind: 'SMTP_PLAIN_BANNER', timeoutMs: 2000 });
    assert.equal(result.outcome, 'BANNER_OK');
    assert.equal(result.tcp, 'CONNECTED');
    assert.equal(result.greeting, 'SMTP_220');
    assert.equal(result.bytesWrittenByClient, 0);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(received.bytes, 0, 'the preflight must not write a single byte to the server');
  } finally {
    server.close();
  }
});

test('a server that accepts but never greets is a timeout, not a success', async () => {
  const { server, port } = await listenPlain(() => {});
  try {
    const result = await probeEndpoint({ host: '127.0.0.1', port, kind: 'SMTP_PLAIN_BANNER', timeoutMs: 300 });
    assert.equal(result.outcome, 'TCP_TIMEOUT');
    assert.equal(result.tcp, 'CONNECTED');
    assert.equal(result.greeting, 'NOT_READ');
  } finally {
    server.close();
  }
});

test('a refused port is reported as a connection refusal, distinct from TLS and greeting failures', async () => {
  const port = await closedPort();
  const result = await probeEndpoint({ host: '127.0.0.1', port, kind: 'SMTP_PLAIN_BANNER', timeoutMs: 2000 });
  assert.equal(result.outcome, 'TCP_ECONNREFUSED');
  assert.equal(result.tcp, 'ECONNREFUSED');
});

test('an unexpected greeting on the submission port is not counted as a banner', async () => {
  const { server, port } = await listenPlain(socket => socket.write('500 not smtp\r\n'));
  try {
    const result = await probeEndpoint({ host: '127.0.0.1', port, kind: 'SMTP_PLAIN_BANNER', timeoutMs: 2000 });
    assert.equal(result.outcome, 'BANNER_UNEXPECTED');
  } finally {
    server.close();
  }
});

test('implicit-TLS SMTP with a trusted chain: verified handshake and a 220 greeting', { skip: TLS_SKIP }, async () => {
  const { server, port, received } = await listenTls('220 fixture ESMTP\r\n');
  try {
    const result = await probeEndpoint({ host: '127.0.0.1', port, kind: 'SMTP_IMPLICIT_TLS', timeoutMs: 3000, connectOptions: { ca: certPem } });
    assert.equal(result.tls, 'VERIFIED');
    assert.equal(result.outcome, 'GREETING_OK');
    assert.equal(result.greeting, 'SMTP_220');
    await new Promise(r => setTimeout(r, 50));
    assert.equal(/EHLO|AUTH|MAIL FROM|RCPT TO|DATA/i.test(received.text), false, 'no SMTP command may be sent');
  } finally {
    server.close();
  }
});

test('implicit-TLS with an untrusted self-signed certificate fails verification and is not accepted', { skip: TLS_SKIP }, async () => {
  const { server, port } = await listenTls('220 fixture ESMTP\r\n');
  try {
    const result = await probeEndpoint({ host: '127.0.0.1', port, kind: 'SMTP_IMPLICIT_TLS', timeoutMs: 3000, connectOptions: {} });
    assert.equal(result.outcome, 'TLS_VERIFY_FAILED');
    assert.equal(result.greeting, 'NOT_READ');
    assert.notEqual(result.tls, 'VERIFIED');
  } finally {
    server.close();
  }
});

test('implicit-TLS IMAP: a trusted "* OK" greeting is GREETING_OK, and a 220 greeting on IMAP is unexpected', { skip: TLS_SKIP }, async () => {
  const imap = await listenTls('* OK fixture IMAP4rev1 ready\r\n');
  const wrong = await listenTls('220 not imap\r\n');
  try {
    const ok = await probeEndpoint({ host: '127.0.0.1', port: imap.port, kind: 'IMAP_IMPLICIT_TLS', timeoutMs: 3000, connectOptions: { ca: certPem } });
    assert.equal(ok.outcome, 'GREETING_OK');
    assert.equal(ok.greeting, 'IMAP_OK');
    const bad = await probeEndpoint({ host: '127.0.0.1', port: wrong.port, kind: 'IMAP_IMPLICIT_TLS', timeoutMs: 3000, connectOptions: { ca: certPem } });
    assert.equal(bad.outcome, 'GREETING_UNEXPECTED');
  } finally {
    imap.server.close();
    wrong.server.close();
  }
});

test('control TLS target: a trusted handshake is TLS_VERIFIED with no greeting read', { skip: TLS_SKIP }, async () => {
  const { server, port } = await listenTls(null);
  try {
    const result = await probeEndpoint({ host: '127.0.0.1', port, kind: 'TLS_ONLY', timeoutMs: 3000, connectOptions: { ca: certPem } });
    assert.equal(result.outcome, 'TLS_VERIFIED');
    assert.equal(result.greeting, 'NOT_READ');
  } finally {
    server.close();
  }
});

test('the preflight never reads environment secrets and imports no credential, store, key or config code', () => {
  const source = fs.readFileSync(new URL('../scripts/winnr-network-preflight.mjs', import.meta.url), 'utf8');
  assert.equal(/process\.env/.test(source), false, 'no environment access');
  assert.equal(/from ['"]\.\.\/src\//.test(source), false, 'no imports from application code');
  assert.equal(/TOKEN_ENCRYPTION_KEY|DATABASE_URL|WINNR_API/.test(source), false, 'no credential names');
  assert.equal(/(?<!stdout)\.write\(/.test(source), false, 'the module never writes to a socket (stdout report output excluded)');
});

test('the target list is exactly the four reachability checks and nothing that authenticates', () => {
  const labels = WINNR_PREFLIGHT_TARGETS.map(t => t.label);
  assert.deepEqual(labels, ['control-https-443', 'smtp-implicit-tls-465', 'smtp-submission-587', 'imap-implicit-tls-993']);
  assert.ok(WINNR_PREFLIGHT_TARGETS.every(t => ['TLS_ONLY', 'SMTP_IMPLICIT_TLS', 'SMTP_PLAIN_BANNER', 'IMAP_IMPLICIT_TLS'].includes(t.kind)));
});

test('the summary reports authentication-port readiness only when both 465 and 993 greet', async () => {
  const probe = async ({ port, kind }) => {
    const outcome = kind === 'TLS_ONLY' ? 'TLS_VERIFIED' : (port === 587 ? 'BANNER_OK' : (port === 993 ? 'GREETING_OK' : 'TCP_ETIMEDOUT'));
    return { host: 'h', port, kind, tcp: 'CONNECTED', tls: 'VERIFIED', greeting: 'NOT_READ', outcome, bytesWrittenByClient: 0, elapsedMs: 1 };
  };
  const report = await runNetworkPreflight({ probe });
  assert.equal(report.summary.controlTlsReachable, true);
  assert.equal(report.summary.smtp465Ready, false);
  assert.equal(report.summary.smtp587BannerReachable, true);
  assert.equal(report.summary.imap993Ready, true);
  assert.equal(report.summary.allAuthenticationPortsReachable, false);
  assert.equal(report.bytesWrittenToAnyServer, 0);
  assert.equal(report.credentialsUsed, false);
  assert.equal(report.authenticationAttempted, false);
  assert.equal(report.messagesSent, 0);
});

test('error classes are closed and never echo message text', () => {
  assert.equal(classifyPreflightError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), 'ECONNREFUSED');
  assert.equal(classifyPreflightError(Object.assign(new Error('x'), { code: 'PREFLIGHT_TIMEOUT' })), 'TIMEOUT');
  assert.equal(classifyPreflightError(Object.assign(new Error('x'), { code: 'CERT_HAS_EXPIRED' })), 'TLS_VERIFY_FAILED');
  assert.equal(classifyPreflightError(Object.assign(new Error('x'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })), 'TLS_VERIFY_FAILED');
  assert.equal(classifyPreflightError(Object.assign(new Error('x'), { code: 'ERR_SSL_WRONG_VERSION_NUMBER' })), 'TLS_HANDSHAKE_FAILED');
  assert.equal(classifyPreflightError(new Error('unexpected fixture-secret-text')), 'UNCLASSIFIED');
});

test.after(() => { if (certDir) fs.rmSync(certDir, { recursive: true, force: true }); });
