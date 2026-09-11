#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const APPROVED_EMBEDDED_POSTGRES_VERSION = '18.4.0-beta.17';
export const APPROVED_EMBEDDED_POSTGRES_SPEC = `@embedded-postgres/linux-x64@${APPROVED_EMBEDDED_POSTGRES_VERSION}`;
const DEFAULT_PACKAGE_ROOT = path.resolve('node_modules/@embedded-postgres/linux-x64');

async function readInstalledVersion(packageRoot) {
  try {
    const raw = await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8');
    return String(JSON.parse(raw)?.version || '');
  } catch (error) {
    if (String(error?.code || '') === 'ENOENT') return null;
    throw error;
  }
}

export async function hydratePinnedEmbeddedPostgresFixture({
  packageRoot = DEFAULT_PACKAGE_ROOT,
  runner = spawnSync
} = {}) {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    return Object.freeze({ status: 'NOT_APPLICABLE', platform: process.platform, arch: process.arch });
  }

  const installed = await readInstalledVersion(packageRoot);
  if (installed === APPROVED_EMBEDDED_POSTGRES_VERSION) {
    return Object.freeze({ status: 'ALREADY_PRESENT', version: installed });
  }
  if (installed) {
    throw new Error(`embedded Postgres platform package version drift: expected ${APPROVED_EMBEDDED_POSTGRES_VERSION}, observed ${installed}`);
  }

  const args = [
    'install',
    '--no-save',
    '--package-lock=false',
    APPROVED_EMBEDDED_POSTGRES_SPEC
  ];
  const run = runner('npm', args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (run?.error) throw run.error;
  if (run?.status !== 0) {
    throw new Error(`failed to hydrate pinned embedded Postgres fixture: npm exit ${String(run?.status)}`);
  }

  const hydrated = await readInstalledVersion(packageRoot);
  if (hydrated !== APPROVED_EMBEDDED_POSTGRES_VERSION) {
    throw new Error(`embedded Postgres hydration identity mismatch: expected ${APPROVED_EMBEDDED_POSTGRES_VERSION}, observed ${String(hydrated)}`);
  }

  return Object.freeze({
    status: 'HYDRATED',
    package: '@embedded-postgres/linux-x64',
    version: hydrated,
    source: 'PINNED_NPM_SPEC'
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = await hydratePinnedEmbeddedPostgresFixture();
  process.stdout.write(`embedded-postgres-hydration — ${result.status}${result.version ? ` ${result.version}` : ''}\n`);
}
