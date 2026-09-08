#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileCurrentRealityFreeze,
  extractArtifactSourceCommit
} from '../src/current-reality-freeze.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  try {
    return JSON.parse(readFileSync(join(root, relative), 'utf8'));
  } catch {
    return {};
  }
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const EXACT_READINESS_FILES = new Set([
  'package.json',
  'package-lock.json',
  'server.mjs',
  'worker.mjs',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.portable.yml',
  'vercel.json'
]);

function readinessRelevant(path) {
  return EXACT_READINESS_FILES.has(path)
    || /^(src|scripts|api|tests|config|migrations|public|\.github\/workflows)\//.test(path);
}

function coverageRelevant(path) {
  if (path === 'artifacts/sovereign/implementation-coverage-matrix.json') return false;
  if (/^artifacts\/work\//.test(path)) return false;
  return /^(src|scripts|api|tests|config|\.claude\/skills)\//.test(path)
    || /^artifacts\//.test(path)
    || path === 'package.json'
    || path === 'package-lock.json';
}

function changedPathsSince(commit) {
  if (!commit) return null;
  const output = git(['diff', '--name-only', `${commit}..HEAD`]);
  if (output === null) return null;
  return output.split('\n').map(line => line.trim()).filter(Boolean);
}

function sourceChanged(document, predicate) {
  const commit = extractArtifactSourceCommit(document);
  const changed = changedPathsSince(commit);
  if (changed === null) return null;
  return changed.some(predicate);
}

export function buildCurrentRealityFreeze() {
  const handoff = readJson('docs/CURRENT_HANDOFF.json');
  const readiness = readJson('artifacts/system-readiness.json');
  const coverage = readJson('artifacts/sovereign/implementation-coverage-matrix.json');
  const orchestrator = readJson('artifacts/work/astra-orchestrator-state-2026-09-08.json');
  const headSha = git(['rev-parse', 'HEAD']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const porcelain = git(['status', '--porcelain']);

  return compileCurrentRealityFreeze({
    headSha,
    branch,
    workingTreeClean: porcelain === null ? null : porcelain.length === 0,
    handoff,
    readiness,
    coverage,
    orchestrator,
    sourceChangedByArtifact: {
      'system-readiness': sourceChanged(readiness, readinessRelevant),
      'sovereign-coverage': sourceChanged(coverage, coverageRelevant)
    }
  });
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const receipt = buildCurrentRealityFreeze();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (process.argv.includes('--verify')) {
    const exact = receipt.ok
      && receipt.staleGeneratedArtifactIds?.length === 0
      && receipt.unknownGeneratedArtifactIds?.length === 0
      && receipt.head?.workingTreeClean !== false;
    if (!exact) process.exitCode = 1;
  }
}
