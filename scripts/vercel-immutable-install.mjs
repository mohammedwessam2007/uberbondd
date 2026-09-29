#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERCEL_IMMUTABLE_INSTALL_VERSION = 'uberbond.vercel-immutable-install.v1';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parsePorcelainPaths(output = '') {
  return String(output)
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.slice(3).trim())
    .filter(Boolean)
    .sort();
}

export function packageTruthDirt({ cwd = repoRoot } = {}) {
  try {
    const output = execFileSync('git', [
      'status',
      '--porcelain',
      '--untracked-files=no',
      '--',
      'package.json',
      'package-lock.json'
    ], { cwd, encoding: 'utf8' });
    return parsePorcelainPaths(output);
  } catch {
    return null;
  }
}

export function compileVercelImmutableInstallPlan({ cwd = repoRoot } = {}) {
  return Object.freeze({
    cwd,
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: Object.freeze(['ci', '--include=dev']),
    protectedFiles: Object.freeze(['package.json', 'package-lock.json']),
    mutationPolicy: 'TRACKED_PACKAGE_TRUTH_MUST_BE_CLEAN_BEFORE_AND_AFTER_INSTALL'
  });
}

export function executeVercelImmutableInstall({ cwd = repoRoot } = {}) {
  const plan = compileVercelImmutableInstallPlan({ cwd });
  const before = packageTruthDirt({ cwd });
  if (before === null) {
    return {
      ok: false,
      status: 'VERCEL_IMMUTABLE_INSTALL_REFUSED',
      reasonCodes: ['git-package-truth-status-required'],
      exitCode: 82,
      businessEffectAuthority: 'NONE'
    };
  }
  if (before.length) {
    return {
      ok: false,
      status: 'VERCEL_IMMUTABLE_INSTALL_REFUSED',
      reasonCodes: ['package-truth-dirty-before-install'],
      dirtyPaths: before,
      exitCode: 83,
      businessEffectAuthority: 'NONE'
    };
  }

  const install = spawnSync(plan.command, [...plan.args], {
    cwd,
    env: process.env,
    stdio: 'inherit'
  });
  if (install.error) {
    return {
      ok: false,
      status: 'VERCEL_IMMUTABLE_INSTALL_FAILED',
      reasonCodes: ['npm-ci-failed-to-start'],
      errorCode: install.error.code ? String(install.error.code) : null,
      exitCode: 84,
      businessEffectAuthority: 'NONE'
    };
  }
  if (install.status !== 0) {
    return {
      ok: false,
      status: 'VERCEL_IMMUTABLE_INSTALL_FAILED',
      reasonCodes: ['npm-ci-nonzero'],
      npmCiExitCode: install.status,
      exitCode: 85,
      businessEffectAuthority: 'NONE'
    };
  }

  const after = packageTruthDirt({ cwd });
  if (after === null) {
    return {
      ok: false,
      status: 'VERCEL_IMMUTABLE_INSTALL_REFUSED',
      reasonCodes: ['git-package-truth-status-required-after-install'],
      exitCode: 86,
      businessEffectAuthority: 'NONE'
    };
  }
  if (after.length) {
    return {
      ok: false,
      status: 'VERCEL_IMMUTABLE_INSTALL_REFUSED',
      reasonCodes: ['package-truth-mutated-by-install'],
      dirtyPaths: after,
      exitCode: 87,
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'VERCEL_IMMUTABLE_INSTALL_PASSED',
    version: VERCEL_IMMUTABLE_INSTALL_VERSION,
    packageManagerCommand: `${plan.command} ${plan.args.join(' ')}`,
    packageTruthCleanBefore: true,
    packageTruthCleanAfter: true,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'DEPENDENCY_INSTALL_ONLY'
  };
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const result = executeVercelImmutableInstall();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = result.exitCode || 1;
}
