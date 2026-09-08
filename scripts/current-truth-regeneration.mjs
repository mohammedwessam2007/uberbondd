#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCurrentRealityFreeze } from './current-reality-freeze.mjs';
import { verifyCurrentTruthRegeneration } from '../src/current-truth-regeneration.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function readJson(relative) {
  try {
    return JSON.parse(readFileSync(join(root, relative), 'utf8'));
  } catch {
    return {};
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    command: [command, ...args].join(' '),
    exitCode: result.status ?? 1,
    started: !result.error,
    error: result.error ? String(result.error.message || result.error) : null
  };
}

function dirtyPaths() {
  const porcelain = git(['status', '--porcelain']);
  if (porcelain === null) return null;
  return porcelain.split('\n').filter(Boolean).map(line => {
    const path = line.slice(3).trim();
    const rename = path.includes(' -> ') ? path.split(' -> ').at(-1) : path;
    return rename;
  }).filter(Boolean);
}

export function executeCurrentTruthRegeneration() {
  const headSha = git(['rev-parse', 'HEAD']);
  const before = dirtyPaths();
  if (!headSha || before === null) {
    return {
      ok: false,
      status: 'CURRENT_TRUTH_REGENERATION_REFUSED',
      reasonCodes: ['git-head-and-status-required'],
      businessEffectAuthority: 'NONE'
    };
  }
  if (before.length) {
    return {
      ok: false,
      status: 'CURRENT_TRUTH_REGENERATION_REFUSED',
      reasonCodes: ['clean-source-checkout-required-before-regeneration'],
      dirtyPathsBefore: before,
      businessEffectAuthority: 'NONE'
    };
  }

  const readinessRun = run('node', ['scripts/system-readiness.mjs']);
  if (readinessRun.exitCode !== 0) {
    return {
      ok: false,
      status: 'CURRENT_TRUTH_REGENERATION_REFUSED',
      reasonCodes: ['readiness-generator-failed'],
      generatorResults: { readiness: readinessRun },
      businessEffectAuthority: 'NONE'
    };
  }

  const coverageRun = run('node', ['scripts/sovereign-coverage-matrix.mjs']);
  if (coverageRun.exitCode !== 0) {
    return {
      ok: false,
      status: 'CURRENT_TRUTH_REGENERATION_REFUSED',
      reasonCodes: ['coverage-generator-failed'],
      generatorResults: { readiness: readinessRun, coverage: coverageRun },
      businessEffectAuthority: 'NONE'
    };
  }

  const readiness = readJson('artifacts/system-readiness.json');
  const coverage = readJson('artifacts/sovereign/implementation-coverage-matrix.json');
  const freeze = buildCurrentRealityFreeze({ rootDir: root });
  const after = dirtyPaths();

  return verifyCurrentTruthRegeneration({
    headSha,
    readiness,
    coverage,
    freeze,
    dirtyPaths: after || [],
    generatorResults: {
      readiness: readinessRun,
      coverage: coverageRun
    }
  });
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const receipt = executeCurrentTruthRegeneration();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.ok) process.exitCode = 1;
}
