import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareEmbeddedPostgresFixture } from '../scripts/prepare-embedded-postgres-fixture.mjs';

function fixture({ withPayload = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'uberbond-pg-soname-'));
  const packageRoot = path.join(root, 'platform-package');
  const binDir = path.join(packageRoot, 'native', 'bin');
  const libDir = path.join(packageRoot, 'native', 'lib');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(libDir, { recursive: true });
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: '18.4.0-beta.17' }));
  for (const executable of ['initdb', 'pg_ctl', 'postgres']) {
    const file = path.join(binDir, executable);
    writeFileSync(file, '#!/bin/sh\nprintf "fake-postgres-version\\n"\n');
    chmodSync(file, 0o755);
  }
  if (withPayload) writeFileSync(path.join(libDir, 'libpq.so.5.18'), 'pinned-libpq-payload');
  return { root, packageRoot, libDir };
}

test('fixture materializes only the pinned libpq soname and remains idempotent', {
  skip: process.platform !== 'linux' || process.arch !== 'x64'
}, async () => {
  const f = fixture();
  try {
    const first = await prepareEmbeddedPostgresFixture({ packageRoot: f.packageRoot, probeIdentity: null });
    assert.equal(first.status, 'READY');
    assert.deepEqual(first.runtimeSonames, [{
      soname: 'libpq.so.5',
      payload: 'libpq.so.5.18',
      status: 'MATERIALIZED_FROM_PINNED_PAYLOAD'
    }]);
    const soname = path.join(f.libDir, 'libpq.so.5');
    assert.equal(existsSync(soname), true);
    assert.equal(readFileSync(soname, 'utf8'), 'pinned-libpq-payload');

    const second = await prepareEmbeddedPostgresFixture({ packageRoot: f.packageRoot, probeIdentity: null });
    assert.equal(second.status, 'READY');
    assert.deepEqual(second.runtimeSonames, [{
      soname: 'libpq.so.5',
      payload: 'libpq.so.5.18',
      status: 'PRESENT'
    }]);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('fixture refuses to invent libpq when the pinned payload is absent', {
  skip: process.platform !== 'linux' || process.arch !== 'x64'
}, async () => {
  const f = fixture({ withPayload: false });
  try {
    await assert.rejects(
      () => prepareEmbeddedPostgresFixture({ packageRoot: f.packageRoot, probeIdentity: null }),
      /pinned runtime payload missing: libpq\.so\.5\.18/
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
