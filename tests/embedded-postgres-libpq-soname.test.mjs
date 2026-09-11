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

const PAYLOADS = Object.freeze([
  ['libpq.so.5', 'libpq.so.5.18'],
  ['libicuuc.so.60', 'libicuuc.so.60.2'],
  ['libicui18n.so.60', 'libicui18n.so.60.2'],
  ['libicudata.so.60', 'libicudata.so.60.2']
]);

function fixture({ withLibraries = true, omitPayload = null, createLibDir = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'uberbond-pg-soname-'));
  const packageRoot = path.join(root, 'platform-package');
  const binDir = path.join(packageRoot, 'native', 'bin');
  const libDir = path.join(packageRoot, 'native', 'lib');
  mkdirSync(binDir, { recursive: true });
  if (createLibDir) mkdirSync(libDir, { recursive: true });
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: '18.4.0-beta.17' }));
  for (const executable of ['initdb', 'pg_ctl', 'postgres']) {
    const file = path.join(binDir, executable);
    writeFileSync(file, '#!/bin/sh\nprintf "fake-postgres-version\\n"\n');
    chmodSync(file, 0o755);
  }
  if (withLibraries && createLibDir) {
    for (const [, payload] of PAYLOADS) {
      if (payload === omitPayload) continue;
      writeFileSync(path.join(libDir, payload), `pinned:${payload}`);
    }
  }
  return { root, packageRoot, libDir };
}

test('fixture materializes the strict pinned Postgres soname set and remains idempotent', {
  skip: process.platform !== 'linux' || process.arch !== 'x64'
}, async () => {
  const f = fixture();
  const previousLoader = process.env.LD_LIBRARY_PATH;
  try {
    const first = await prepareEmbeddedPostgresFixture({ packageRoot: f.packageRoot, probeIdentity: null });
    assert.equal(first.status, 'READY');
    assert.equal(first.runtimeLibraryPathConfigured, true);
    assert.equal(first.runtimeSonames.length, PAYLOADS.length);
    for (const [soname, payload] of PAYLOADS) {
      const row = first.runtimeSonames.find(item => item.soname === soname);
      assert.deepEqual(row, { soname, payload, status: 'MATERIALIZED_FROM_PINNED_PAYLOAD' });
      assert.equal(existsSync(path.join(f.libDir, soname)), true);
      assert.equal(readFileSync(path.join(f.libDir, soname), 'utf8'), `pinned:${payload}`);
    }
    assert.equal(String(process.env.LD_LIBRARY_PATH || '').split(':')[0], f.libDir);

    const second = await prepareEmbeddedPostgresFixture({ packageRoot: f.packageRoot, probeIdentity: null });
    assert.equal(second.status, 'READY');
    assert.equal(second.runtimeSonames.length, PAYLOADS.length);
    assert.ok(second.runtimeSonames.every(item => item.status === 'PRESENT'));
  } finally {
    if (previousLoader === undefined) delete process.env.LD_LIBRARY_PATH;
    else process.env.LD_LIBRARY_PATH = previousLoader;
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('fixture leaves shell-only synthetic executable fixtures free of invented library requirements', {
  skip: process.platform !== 'linux' || process.arch !== 'x64'
}, async () => {
  const f = fixture({ withLibraries: false, createLibDir: false });
  try {
    const result = await prepareEmbeddedPostgresFixture({ packageRoot: f.packageRoot, probeIdentity: null });
    assert.equal(result.status, 'READY');
    assert.deepEqual(result.runtimeSonames, []);
    assert.equal(result.runtimeLibraryPathConfigured, false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('fixture refuses a partial pinned native-library payload instead of improvising', {
  skip: process.platform !== 'linux' || process.arch !== 'x64'
}, async () => {
  const f = fixture({ omitPayload: 'libicuuc.so.60.2' });
  try {
    await assert.rejects(
      () => prepareEmbeddedPostgresFixture({ packageRoot: f.packageRoot, probeIdentity: null }),
      /pinned runtime payload missing: libicuuc\.so\.60\.2/
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
