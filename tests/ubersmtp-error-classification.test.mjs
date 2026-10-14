import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberSmtpSubmissionTransport, classifySmtpTransportError } from '../src/ubersmtp-submission-adapter.mjs';

const ROUTE = { host: 'inbound.example.test', port: 465, secure: true, username: 'user', password: 'fixture-password-value', authorized: true, termsCompatible: true, evidenceRef: 'fixture:ref' };

function rejected(stage, code) {
  const error = new Error(`smtp-${stage.toLowerCase()}-rejected`);
  error.code = 'SMTP_COMMAND_REJECTED';
  error.smtpStage = stage;
  error.smtpResponseCode = code;
  return error;
}

function transportThatFailsWith(error) {
  const transport = createUberSmtpSubmissionTransport({ ...ROUTE, smtpSessionFactory: async () => { throw error; } });
  assert.equal(transport.ok, true);
  return transport.probe();
}

test('a connect timeout is classified CONNECT_TIMEOUT, not a generic Error', async () => {
  const result = await transportThatFailsWith(Object.assign(new Error('smtp-connect-timeout'), { smtpStage: 'CONNECT' }));
  assert.equal(result.confirmed, false);
  assert.equal(result.errorClass, 'CONNECT_TIMEOUT');
  assert.equal(result.errorStage, 'CONNECT');
  assert.deepEqual(result.reasonCodes, ['smtp-session-probe-failed']);
  assert.equal(result.messagesSent, 0);
  assert.equal(result.mailFromIssued, false);
  assert.equal(result.dataIssued, false);
});

test('an AUTH rejection with a 535 reply is AUTH_REJECTED, distinct from transport failure', async () => {
  const result = await transportThatFailsWith(rejected('AUTH', 535));
  assert.equal(result.errorClass, 'AUTH_REJECTED');
  assert.equal(result.errorStage, 'AUTH');
  assert.equal(result.smtpResponseCode, 535);
});

test('other command rejections stay SMTP_COMMAND_REJECTED', () => {
  assert.equal(classifySmtpTransportError(rejected('EHLO', 500)), 'SMTP_COMMAND_REJECTED');
});

test('refused, unreachable and reset sockets keep their system error code', () => {
  for (const code of ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'ENOTFOUND']) {
    assert.equal(classifySmtpTransportError(Object.assign(new Error('socket failure'), { code })), code);
  }
});

test('TLS verification failures are TLS_FAILED', () => {
  assert.equal(classifySmtpTransportError(Object.assign(new Error('cert'), { code: 'CERT_HAS_EXPIRED' })), 'TLS_FAILED');
  assert.equal(classifySmtpTransportError(Object.assign(new Error('tls'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' })), 'TLS_FAILED');
});

test('an unknown failure is UNCLASSIFIED and never echoes its message', async () => {
  const result = await transportThatFailsWith(new Error('something with fixture-password-value inside'));
  assert.equal(result.errorClass, 'UNCLASSIFIED');
  assert.equal(JSON.stringify(result).includes('fixture-password-value'), false);
});
