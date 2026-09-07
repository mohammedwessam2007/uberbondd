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

function isInside(base, candidate) {
  const relative = path.relative(path.resolve(base), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

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

async function makeMirrorReadableAndTraversable(root) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const stat = await fs.stat(current);
    if (stat.isDirectory()) {
      await fs.chmod(current, stat.mode | 0o005);
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) stack.push(path.join(current, entry.name));
      continue;
    }
    if (stat.isFile()) await fs.chmod(current, stat.mode | 0o004);
  }
}

async function ensureDirectoryChainTraversable({ fromDir, stopAt }) {
  const stop = path.resolve(stopAt);
  let current = path.resolve(fromDir);
  if (!isInside(stop, current)) {
    throw new Error(`embedded Postgres traversal root does not contain package path: ${stop}`);
  }

  while (true) {
    const stat = await fs.stat(current);
    if (!stat.isDirectory()) throw new Error(`embedded Postgres traversal component is not a directory: ${current}`);
    // Add only "other execute". This grants path traversal to the deliberately
    // downgraded postgres OS user without granting directory listing or writes.
    await fs.chmod(current, stat.mode | 0o001);
    if (current === stop) break;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('embedded Postgres traversal chain escaped its bounded root');
    current = parent;
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

async function mirrorNativeTree({ packageRoot, mirrorBaseDir, traversalRoot }) {
  const nativeDir = path.join(packageRoot, 'native');
  const resolvedMirrorBase = path.resolve(mirrorBaseDir);
  const sourceNative = await fs.realpath(nativeDir);

  // Reuse an already-created bounded mirror. Mutation War starts several
  // disposable PostgreSQL servers in one process; copying the same reviewed
  // package repeatedly adds no evidence and leaks temp trees.
  if (isInside(resolvedMirrorBase, sourceNative)
      && path.basename(path.dirname(sourceNative)).startsWith('uberbond-embedded-postgres-')) {
    await makeMirrorReadableAndTraversable(sourceNative);
    await makeBinExecutable(path.join(sourceNative, 'bin'));
    await ensureDirectoryChainTraversable({ fromDir: packageRoot, stopAt: traversalRoot });
    return sourceNative;
  }

  const mirrorRoot = await fs.mkdtemp(path.join(resolvedMirrorBase, 'uberbond-embedded-postgres-'));
  // mkdtemp is intentionally private (0700) by default. embedded-postgres
  // deliberately drops from root to the postgres uid before exec, so that uid
  // must be able to traverse this one ephemeral fixture directory.
  await fs.chmod(mirrorRoot, 0o755);
  const mirrorNative = path.join(mirrorRoot, 'native');

  // Materialize symlink targets so no mirrored file resolves back through the
  // Vercel checkout, whose root may be inaccessible after the uid drop.
  await fs.cp(sourceNative, mirrorNative, {
    recursive: true,
    dereference: true
  });
  await makeMirrorReadableAndTraversable(mirrorNative);
  await makeBinExecutable(path.join(mirrorNative, 'bin'));

  const mirrorProbe = probeBinDir(path.join(mirrorNative, 'bin'));
  if (!mirrorProbe.ok) {
    await fs.rm(mirrorRoot, { recursive: true, force: true }).catch(() => {});
    throw new Error(`embedded Postgres executable mirror failed: ${mirrorProbe.executable}:${mirrorProbe.code}`);
  }

  // The platform package still exports /checkout/.../native/bin/*. Keep that
  // stable API, but make only the directory chain needed to reach the symlink
  // traversable. No source file gains write or execute authority here.
  await ensureDirectoryChainTraversable({ fromDir: packageRoot, stopAt: traversalRoot });
  await fs.rm(nativeDir, { recursive: true, force: true });
  await fs.symlink(mirrorNative, nativeDir, 'dir');
  return mirrorNative;
}

export async function prepareEmbeddedPostgresFixture({
  packageRoot = PACKAGE_ROOT,
  mirrorBaseDir = os.tmpdir(),
  traversalRoot = process.cwd(),
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
    await mirrorNativeTree({ packageRoot, mirrorBaseDir, traversalRoot });
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
