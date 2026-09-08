import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadPrivateState,
  runPrivateCommand
} from '../src/personal-civilization-private-operator.mjs';

const OWNER = {
  subject: 'FOUNDER',
  grant: 'PRIVATE_LIFE_STATE',
  issuedAt: '2026-09-08T19:00:00.000Z'
};
const KEY_A = '44'.repeat(32);
const KEY_B = '55'.repeat(32);
const REPO = path.resolve(process.cwd());

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-private-crypto-'));
  return { dir, file: path.join(dir, 'life-state.json') };
}

test('durable private life state refuses to exist without a dedicated 256-bit life key', () => {
  const tmp = fixture();
  try {
    const result = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: REPO,
      authorization: OWNER,
      privateKey: null,
      command: { action: 'capture', utterance: 'must never become plaintext', willEventType: 'RAW_THOUGHT' }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'PRIVATE_STATE_KEY_REQUIRED');
    assert.ok(result.reasonCodes.includes('private-life-key-must-be-64-hex-characters'));
    assert.equal(fs.existsSync(tmp.file), false, 'missing encryption authority must fail before persistence');
  } finally { fs.rmSync(tmp.dir, { recursive: true, force: true }); }
});

test('the wrong life key cannot authenticate or read an existing vault', () => {
  const tmp = fixture();
  try {
    const created = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: REPO,
      authorization: OWNER,
      privateKey: KEY_A,
      command: { action: 'capture', utterance: 'key separation fixture', willEventType: 'RAW_THOUGHT' }
    });
    assert.equal(created.ok, true);

    const wrong = loadPrivateState({ filePath: tmp.file, repoRoot: REPO, authorization: OWNER, privateKey: KEY_B });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.status, 'PRIVATE_STATE_READ_REFUSED');
    assert.ok(wrong.reasonCodes.includes('private-state-authentication-failed'));
    assert.equal(JSON.stringify(wrong).includes(KEY_A), false);
    assert.equal(JSON.stringify(wrong).includes(KEY_B), false);
  } finally { fs.rmSync(tmp.dir, { recursive: true, force: true }); }
});

test('tampering with durable ciphertext is detected rather than parsed as a changed memory', () => {
  const tmp = fixture();
  try {
    const created = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: REPO,
      authorization: OWNER,
      privateKey: KEY_A,
      command: { action: 'capture', utterance: 'tamper detection fixture', willEventType: 'RAW_THOUGHT' }
    });
    assert.equal(created.ok, true);

    const envelope = JSON.parse(fs.readFileSync(tmp.file, 'utf8'));
    const data = Buffer.from(envelope.data, 'base64');
    data[0] ^= 0x01;
    envelope.data = data.toString('base64');
    fs.writeFileSync(tmp.file, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
    if (process.platform !== 'win32') fs.chmodSync(tmp.file, 0o600);

    const loaded = loadPrivateState({ filePath: tmp.file, repoRoot: REPO, authorization: OWNER, privateKey: KEY_A });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.status, 'PRIVATE_STATE_READ_REFUSED');
    assert.ok(loaded.reasonCodes.includes('private-state-authentication-failed'));
  } finally { fs.rmSync(tmp.dir, { recursive: true, force: true }); }
});

test('the vault file reveals cipher metadata but not private content or key material', () => {
  const tmp = fixture();
  try {
    const secretText = 'a thought that must not appear in durable bytes';
    const created = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: REPO,
      authorization: OWNER,
      privateKey: KEY_A,
      command: { action: 'capture', utterance: secretText, willEventType: 'RAW_THOUGHT' }
    });
    assert.equal(created.ok, true);
    const raw = fs.readFileSync(tmp.file, 'utf8');
    assert.match(raw, /AES-256-GCM/);
    assert.equal(raw.includes(secretText), false);
    assert.equal(raw.includes(KEY_A), false);
    assert.equal(raw.includes('PRIVATE_LIFE_STATE'), false,
      'even the inner purpose is authenticated ciphertext rather than plaintext metadata');
  } finally { fs.rmSync(tmp.dir, { recursive: true, force: true }); }
});
