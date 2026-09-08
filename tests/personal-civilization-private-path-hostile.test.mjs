import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { encryptJson } from '../src/crypto.mjs';
import {
  PRIVATE_ENVELOPE_SCHEMA,
  defaultPrivateState,
  loadPrivateState
} from '../src/personal-civilization-private-operator.mjs';

const OWNER = {
  subject: 'FOUNDER',
  grant: 'PRIVATE_LIFE_STATE',
  issuedAt: '2026-09-08T18:30:00.000Z'
};
const KEY = '33'.repeat(32);

function encryptedState() {
  const sealed = encryptJson({ purpose: 'PRIVATE_LIFE_STATE', value: defaultPrivateState() }, KEY);
  return { schemaVersion: PRIVATE_ENVELOPE_SCHEMA, cipher: 'AES-256-GCM', ...sealed };
}

test('a path outside the repo that resolves through a parent symlink back into the repo is refused before read', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-private-path-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-private-path-outside-'));
  try {
    const hidden = path.join(root, 'private-fixture');
    fs.mkdirSync(hidden, { recursive: true });
    const target = path.join(hidden, 'life-state.json');
    fs.writeFileSync(target, `${JSON.stringify(encryptedState())}\n`, { mode: 0o600 });
    if (process.platform !== 'win32') fs.chmodSync(target, 0o600);

    const portal = path.join(outside, 'portal');
    try {
      fs.symlinkSync(hidden, portal, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      // Some Windows environments do not permit symlink/junction creation.
      // Skipping there is better than weakening the Unix/macOS guard.
      return;
    }

    const apparentOutsidePath = path.join(portal, 'life-state.json');
    assert.equal(path.resolve(apparentOutsidePath).startsWith(path.resolve(root)), false,
      'fixture must look outside the repository before realpath resolution');

    const loaded = loadPrivateState({
      filePath: apparentOutsidePath,
      authorization: OWNER,
      privateKey: KEY,
      repoRoot: root
    });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.status, 'PRIVATE_STATE_PATH_REFUSED');
    assert.ok(loaded.reasonCodes.includes('private-state-resolved-into-repository'));
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
