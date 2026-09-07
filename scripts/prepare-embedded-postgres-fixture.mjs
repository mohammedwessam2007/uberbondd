#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const APPROVED_VERSION = '18.4.0-beta.17';
const PACKAGE_ROOT = path.resolve('node_modules/@embedded-postgres/linux-x64');
const REQUIRED_EXECUTABLES = Object.freeze(['initdb', 'pg_ctl', 'postgres']);

export async function prepareEmbeddedPostgresFixture({ packageRoot = PACKAGE_ROOT } = {}) {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    return Object.freeze({ status: 'NOT_APPLICABLE', platform: process.platform, arch: process.arch });
  }

  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  if (packageJson.version !== APPROVED_VERSION) {
    throw new Error(`embedded Postgres fixture version drift: expected ${APPROVED_VERSION}, observed ${String(packageJson.version)}`);
  }

  const binDir = path.join(packageRoot, 'native', 'bin');
  const entries = await fs.readdir(binDir, { withFileTypes: true });
  if (!entries.length) throw new Error('embedded Postgres fixture bin directory is empty');

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = path.join(binDir, entry.name);
    const stat = await fs.stat(file);
    await fs.chmod(file, stat.mode | 0o111);
  }

  for (const executable of REQUIRED_EXECUTABLES) {
    const file = path.join(binDir, executable);
    await fs.access(file, fs.constants.X_OK);
  }

  return Object.freeze({
    status: 'READY',
    package: '@embedded-postgres/linux-x64',
    version: APPROVED_VERSION,
    requiredExecutables: [...REQUIRED_EXECUTABLES]
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = await prepareEmbeddedPostgresFixture();
  process.stdout.write(`embedded-postgres-fixture — ${result.status}${result.version ? ` ${result.version}` : ''}\n`);
}
