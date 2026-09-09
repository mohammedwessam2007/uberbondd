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
    await fs.chmod(file, stat.mode | 0o115);
  }
}

async function makeNativeTreeChildReadable(nativeDir) {
  const entries = await fs.readdir(nativeDir, { withFileTypes: true });
  const stat = await fs.stat(nativeDir);
  await fs.chmod(nativeDir, stat.mode | 0o001);

  for (const entry of entries) {
    const file = path.join(nativeDir, entry.name);
    let childStat;
    try {
      childStat = await fs.stat(file);
    } catch {
      continue;
    }
    if (childStat.isDirectory()) {
      await makeNativeTreeChildReadable(file);
    } else if (childStat.isFile()) {
      await fs.chmod(file, childStat.mode | 0o004);
    }
  }
}

async function makeAncestorsSearchable(targetDir) {
  let current = path.resolve(targetDir);
  while (true) {
    let stat;
    try {
      stat = await fs.stat(current);
    } catch {
      break;
    }
    if (stat.isDirectory()) {
      try {
        await fs.chmod(current, stat.mode | 0o001);
      } catch (error) {
        if (!['EPERM', 'EACCES', 'EROFS'].includes(String(error?.code || ''))) throw error;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function resolvePostgresIdentity() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return null;
  const uidRun = spawnSync('id', ['-u', 'postgres'], { encoding: 'utf8' });
  const gidRun = spawnSync('id', ['-g', 'postgres'], { encoding: 'utf8' });
  if (uidRun.status !== 0 || gidRun.status !== 0) return null;
  const uid = Number.parseInt(String(uidRun.stdout || '').trim(), 10);
  const gid = Number.parseInt(String(gidRun.stdout || '').trim(), 10);
  if (!Number.isSafeInteger(uid) || uid < 0 || !Number.isSafeInteger(gid) || gid < 0) return null;
  return Object.freeze({ uid, gid });
}

function probeBinDir(binDir, identity = null) {
  for (const executable of REQUIRED_EXECUTABLES) {
    const file = path.join(binDir, executable);
    const run = spawnSync(file, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(identity ? { uid: identity.uid, gid: identity.gid } : {})
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

  await fs.chmod(mirrorRoot, 0o755);
  await fs.cp(sourceNative, mirrorNative, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true
  });
  await makeNativeTreeChildReadable(mirrorNative);
  await makeBinExecutable(path.join(mirrorNative, 'bin'));

  await fs.rm(nativeDir, { recursive: true, force: true });
  await fs.symlink(mirrorNative, nativeDir, 'dir');
  await makeAncestorsSearchable(path.join(packageRoot, 'native', 'bin'));
  return mirrorNative;
}

export async function prepareEmbeddedPostgresFixture({
  packageRoot = PACKAGE_ROOT,
  mirrorBaseDir = os.tmpdir(),
  forceMirror = false,
  probeIdentity = undefined
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
  await makeNativeTreeChildReadable(path.join(packageRoot, 'native'));
  await makeBinExecutable(binDir);
  await makeAncestorsSearchable(binDir);
  for (const executable of REQUIRED_EXECUTABLES) {
    await fs.access(path.join(binDir, executable), FS_CONSTANTS.X_OK);
  }

  const identity = probeIdentity === undefined ? resolvePostgresIdentity() : probeIdentity;
  let probe = probeBinDir(binDir, identity || null);
  let executionMode = 'PACKAGE_NATIVE';

  if (forceMirror || (!probe.ok && probe.code === 'EACCES')) {
    await mirrorNativeTree({ packageRoot, mirrorBaseDir });
    binDir = path.join(packageRoot, 'native', 'bin');
    executionMode = 'TMP_NATIVE_SYMLINK';
    probe = probeBinDir(binDir, identity || null);
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
    executionMode,
    executionIdentity: identity ? 'POSTGRES_UID_GID' : 'CURRENT_PROCESS'
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = await prepareEmbeddedPostgresFixture();
  process.stdout.write(`embedded-postgres-fixture — ${result.status}${result.version ? ` ${result.version}` : ''}${result.executionMode ? ` ${result.executionMode}` : ''}${result.executionIdentity ? ` ${result.executionIdentity}` : ''}\n`);
}
