import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, parseCanonicalBoolean } from '../src/config.mjs';
import * as gmailInbound from '../src/gmail-inbound.mjs';
import { createGmailInboundReader, INBOUND_SCOPES, GmailInboundError, boundMessageLimit } from '../src/gmail-inbound.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const gmailInboundSource = await fs.readFile(path.join(here, '../src/gmail-inbound.mjs'), 'utf8');

test('CFG-08: only the exact canonical string "true" enables a safety gate', () => {
  assert.equal(parseCanonicalBoolean('true'), true);
  assert.equal(parseCanonicalBoolean('TRUE'), false);
  assert.equal(parseCanonicalBoolean('True'), false);
  assert.equal(parseCanonicalBoolean('1'), false);
  assert.equal(parseCanonicalBoolean('yes'), false);
  assert.equal(parseCanonicalBoolean(' true '), false);
  assert.equal(parseCanonicalBoolean('false'), false);
  assert.equal(parseCanonicalBoolean(undefined), false);
  assert.equal(parseCanonicalBoolean(''), false);
});

test('inbound config is independent of outbound and off by default', () => {
  assert.equal(config.inbound.provider, 'test');
  assert.equal(config.inbound.enabled, false);
  assert.equal(config.inbound.gmailReadEnabled, false);
  assert.equal(config.outbound.enabled, false);
  assert.equal(config.outbound.dryRun, true);
});

test('CAP-01: inbound OAuth scope is readonly only, never send', () => {
  assert.deepEqual(INBOUND_SCOPES, ['https://www.googleapis.com/auth/gmail.readonly']);
  assert.ok(!INBOUND_SCOPES.some(scope => scope.includes('gmail.send') || scope.includes('gmail.modify')));
});

test('CAP-02: inbound module exports no send-capable function', () => {
  const exportNames = Object.keys(gmailInbound);
  const forbidden = ['sendEmail', 'buildRawMessage', 'createDraft', 'reply', 'forward', 'modify', 'trash', 'labelMessage'];
  for (const name of forbidden) assert.ok(!exportNames.includes(name), `unexpected export: ${name}`);
});

test('CAP-03: no messages/send or write-endpoint literal anywhere in the inbound module source', () => {
  assert.ok(!gmailInboundSource.includes('messages/send'));
  assert.ok(!gmailInboundSource.includes('/drafts'));
  assert.ok(!gmailInboundSource.includes('/modify'));
  assert.ok(!gmailInboundSource.includes('gmail.send'));
});

test('CAP-07: inbound module never imports the mixed read/write gmail.mjs', () => {
  assert.ok(!gmailInboundSource.includes("from './gmail.mjs'"));
  assert.ok(!gmailInboundSource.includes('from "./gmail.mjs"'));
});

test('CAP-02/CAP-17: the reader object has no sendEmail key and cannot be mutated to add one', () => {
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb' });
  assert.equal('sendEmail' in reader, false);
  assert.equal(Object.isFrozen(reader), true);
  assert.throws(() => { reader.sendEmail = async () => {}; }, TypeError);
  assert.equal('sendEmail' in reader, false);
});

test('reader methods fail closed without an explicit network permission', async () => {
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb' });
  const account = { tokens: { data: '', iv: '', tag: '' } };
  await assert.rejects(() => reader.getProfile(account, 'key'), GmailInboundError);
  await assert.rejects(() => reader.listMessages(account, 'key', 'is:unread'), GmailInboundError);
  await assert.rejects(() => reader.getMessage(account, 'key', 'abc123'), GmailInboundError);
});

test('reader methods stay blocked in NODE_ENV=test even with allowNetwork explicitly true', async () => {
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true });
  const account = { tokens: { data: '', iv: '', tag: '' } };
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    await assert.rejects(() => reader.getProfile(account, 'key'), GmailInboundError);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('BND-05: message page size clamps huge, zero, negative, and non-numeric limits into a safe range', () => {
  assert.equal(boundMessageLimit(999999), 500);
  assert.equal(boundMessageLimit(Number.MAX_SAFE_INTEGER), 500);
  assert.equal(boundMessageLimit(Infinity), 50);
  assert.equal(boundMessageLimit(0), 1);
  assert.equal(boundMessageLimit(-5), 1);
  assert.equal(boundMessageLimit(NaN), 50);
  assert.equal(boundMessageLimit(undefined), 50);
  assert.equal(boundMessageLimit('20'), 20);
  assert.equal(boundMessageLimit('not-a-number'), 50);
});
