import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  APPROVED_EMBEDDED_POSTGRES_SPEC,
  APPROVED_EMBEDDED_POSTGRES_VERSION,
  hydratePinnedEmbeddedPostgresFixture
} from '../scripts/hydrate-embedded-postgres-fixture.mjs';

const linuxX64 = process.platform === 'linux' && process.arch === 'x64';

function fixtureRoot(prefix) {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, packageRoot: path.join(root, 'node_modules', '@embedded-postgres', 'linux-x64') };
}

function writePackage(packageRoot, version) {
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version }));
}

test('approved platform package identity stays exact and version pinned', () => {
  assert.equal(APPROVED_EMBEDDED_POSTGRES_VERSION, '18.4.0-beta.17');
  assert.equal(APPROVED_EMBEDDED_POSTGRES_SPEC, '@embedded-postgres/linux-x64@18.4.0-beta.17');
});

test('existing exact package is accepted without invoking npm', { skip: !linuxX64 }, async () => {
  const { root, packageRoot } = fixtureRoot('uberbond-pg-hydrate-present-');
  writePackage(packageRoot, APPROVED_EMBEDDED_POSTGRES_VERSION);
  let calls = 0;
  try {
    const result = await hydratePinnedEmbeddedPostgresFixture({
      packageRoot,
      runner() { calls += 1; return { status: 0 }; }
    });
    assert.equal(result.status, 'ALREADY_PRESENT');
    assert.equal(calls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing package hydrates only the exact approved npm spec and verifies identity', { skip: !linuxX64 }, async () => {
  const { root, packageRoot } = fixtureRoot('uberbond-pg-hydrate-missing-');
  const calls = [];
  try {
    const result = await hydratePinnedEmbeddedPostgresFixture({
      packageRoot,
      runner(command, args) {
        calls.push({ command, args: [...args] });
        writePackage(packageRoot, APPROVED_EMBEDDED_POSTGRES_VERSION);
        return { status: 0 };
      }
    });
    assert.equal(result.status, 'HYDRATED');
    assert.deepEqual(calls, [{
      command: 'npm',
      args: ['install', '--no-save', '--package-lock=false', APPROVED_EMBEDDED_POSTGRES_SPEC]
    }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pre-existing version drift fails closed and never invokes npm', { skip: !linuxX64 }, async () => {
  const { root, packageRoot } = fixtureRoot('uberbond-pg-hydrate-drift-');
  writePackage(packageRoot, '999.0.0');
  let calls = 0;
  try {
    await assert.rejects(
      hydratePinnedEmbeddedPostgresFixture({ packageRoot, runner() { calls += 1; return { status: 0 }; } }),
      /version drift/
    );
    assert.equal(calls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('failed npm hydration fails closed', { skip: !linuxX64 }, async () => {
  const { root, packageRoot } = fixtureRoot('uberbond-pg-hydrate-fail-');
  try {
    await assert.rejects(
      hydratePinnedEmbeddedPostgresFixture({ packageRoot, runner() { return { status: 17 }; } }),
      /npm exit 17/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
