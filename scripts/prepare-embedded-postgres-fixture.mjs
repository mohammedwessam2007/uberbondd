#!/usr/bin/env node
import fs from 'node:fs/promises';
import { constants as FS_CONSTANTS } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APPROVED_VERSION = '18.4.0-beta.17';
const PACKAGE_ROOT = path.resolve('node_modules/@embedded-postgres/linux-x64');
const REQUIRED_EXECUTABLES = Object.freeze(['initdb', 'pg_ctl', 'postgres']);

async function makeBinExecutable(binDir) {
  const entries = await fs.readdir(binDir, { withFileTypes: true });
  if (!entries.length) throw new Error('embedded Postgres fixture bin directory is empty');

  for (const entry of entries) {
    const file = path.join(binDir, entry.name);
    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    await fs.chmod(file, stat.mode | 0o111);
  }
}

function probeBinDir(binDir) {
  for (const executable of REQUIRED_EXECUTABLES) {
    const file = path.join(binDir, executable);
    const run = spawnSync(file, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    if (run.error) {
      return {
        ok: false,
        executable,
        code: String(run.error.code || 'SPAWN_ERROR'),
        detail: String(run.error.message || run.error)
      };
    }
    if (run.status !== 0) {
      return {
        ok: false,
        executable,
        code: `EXIT_${String(run.status)}`,
        detail: String(run.stderr || run.stdout || '').trim().slice(0, 500)
      };
    }
  }
  return { ok: true };
}

async function mirrorNativeTree({ packageRoot, mirrorBaseDir }) {
  const nativeDir = path.join(packageRoot, 'native');
  const sourceNative = await fs.realpath(nativeDir);
  const mirrorRoot = await fs.mkdtemp(path.join(mirrorBaseDir, 'uberbond-embedded-postgres-'));
  const mirrorNative = path.join(mirrorRoot, 'native');

  await fs.cp(sourceNative, mirrorNative, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true
  });
  await makeBinExecutable(path.join(mirrorNative, 'bin'));

  const mirrorProbe = probeBinDir(path.join(mirrorNative, 'bin'));
  if (!mirrorProbe.ok) {
    await fs.rm(mirrorRoot, { recursive: true, force: true }).catch(() => {});
    throw new Error(`embedded Postgres executable mirror failed: ${mirrorProbe.executable}:${mirrorProbe.code}`);
  }

  await fs.rm(nativeDir, { recursive: true, force: true });
  await fs.symlink(mirrorNative, nativeDir, 'dir');
  return mirrorNative;
}

export async function prepareEmbeddedPostgresFixture({
  packageRoot = PACKAGE_ROOT,
  mirrorBaseDir = os.tmpdir(),
  forceMirror = false
} = {}) {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    return Object.freeze({ status: 'NOT_APPLICABLE', platform: process.platform, arch: process.arch });
  }

  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  if (packageJson.version !== APPROVED_VERSION) {
    throw new Error(`embedded Postgres fixture version drift: expected ${APPROVED_VERSION}, observed ${String(packageJson.version)}`);
  }

  let binDir = path.join(packageRoot, 'native', 'bin');
  await makeBinExecutable(binDir);
  for (const executable of REQUIRED_EXECUTABLES) {
    await fs.access(path.join(binDir, executable), FS_CONSTANTS.X_OK);
  }

  let probe = probeBinDir(binDir);
  let executionMode = 'PACKAGE_NATIVE';

  if (forceMirror || (!probe.ok && probe.code === 'EACCES')) {
    await mirrorNativeTree({ packageRoot, mirrorBaseDir });
    binDir = path.join(packageRoot, 'native', 'bin');
    executionMode = 'TMP_NATIVE_SYMLINK';
    probe = probeBinDir(binDir);
  }

  if (!probe.ok) {
    throw new Error(`embedded Postgres execution probe failed: ${probe.executable}:${probe.code}`);
  }

  return Object.freeze({
    status: 'READY',
    package: '@embedded-postgres/linux-x64',
    version: APPROVED_VERSION,
    requiredExecutables: [...REQUIRED_EXECUTABLES],
    executionProbe: 'PASSED',
    executionMode
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = await prepareEmbeddedPostgresFixture();
  process.stdout.write(`embedded-postgres-fixture — ${result.status}${result.version ? ` ${result.version}` : ''}${result.executionMode ? ` ${result.executionMode}` : ''}\n`);
}
