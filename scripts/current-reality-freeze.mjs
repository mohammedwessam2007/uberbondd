#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileCurrentRealityFreeze,
  extractArtifactSourceCommit,
  extractPresentTenseMainClaims
} from '../src/current-reality-freeze.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(rootDir, relative) {
  try {
    return JSON.parse(readFileSync(join(rootDir, relative), 'utf8'));
  } catch {
    return {};
  }
}

function git(rootDir, args) {
  try {
    return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
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

const GENERATED_TRUTH_OUTPUTS = new Set([
  'docs/CURRENT_HANDOFF.json',
  'docs/CURRENT_SYSTEM_STATE.md',
  'artifacts/system-readiness.json',
  'artifacts/sovereign/implementation-coverage-matrix.json'
]);

const CANON_TRUTH_FILES = new Set([
  'NORTH_STAR.md',
  'docs/SOVEREIGN_COGNITIVE_CONTINUUM_TOTAL_NORTH_STAR.md',
  'docs/PERSONAL_CIVILIZATION_ENGINE_NORTH_STAR.md'
]);

export function readinessRelevant(path) {
  return EXACT_READINESS_FILES.has(path)
    || /^(src|scripts|api|tests|config|migrations|public|\.github\/workflows)\//.test(path);
}

export function coverageRelevant(path) {
  if (GENERATED_TRUTH_OUTPUTS.has(path)) return false;
  if (/^artifacts\/work\//.test(path)) return false;
  return /^(src|scripts|api|tests|config|\.claude\/skills)\//.test(path)
    || /^artifacts\//.test(path)
    || path === 'package.json'
    || path === 'package-lock.json';
}

export function currentTruthRelevant(path) {
  if (GENERATED_TRUTH_OUTPUTS.has(path)) return false;
  if (/^artifacts\/work\//.test(path)) return false;
  return readinessRelevant(path) || coverageRelevant(path) || CANON_TRUTH_FILES.has(path);
}

function changedPathsSince(rootDir, commit) {
  if (!commit) return null;
  const output = git(rootDir, ['diff', '--name-only', `${commit}..HEAD`]);
  if (output === null) return null;
  return output.split('\n').map(line => line.trim()).filter(Boolean);
}

function sourceChangedSince(rootDir, commit, predicate) {
  const changed = changedPathsSince(rootDir, commit);
  if (changed === null) return null;
  return changed.some(predicate);
}

function artifactSourceChanged(rootDir, document, predicate) {
  return sourceChangedSince(rootDir, extractArtifactSourceCommit(document), predicate);
}

export function buildCurrentRealityFreeze({ rootDir = defaultRoot } = {}) {
  const handoff = readJson(rootDir, 'docs/CURRENT_HANDOFF.json');
  const readiness = readJson(rootDir, 'artifacts/system-readiness.json');
  const coverage = readJson(rootDir, 'artifacts/sovereign/implementation-coverage-matrix.json');
  const orchestrator = readJson(rootDir, 'artifacts/work/astra-orchestrator-state-2026-09-08.json');
  const headSha = git(rootDir, ['rev-parse', 'HEAD']);
  const branch = git(rootDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const porcelain = git(rootDir, ['status', '--porcelain']);

  const sourceChangedByPresentClaim = Object.fromEntries(
    extractPresentTenseMainClaims(handoff).map(row => [
      row.pointer,
      sourceChangedSince(rootDir, row.sha, currentTruthRelevant)
    ])
  );

  return compileCurrentRealityFreeze({
    headSha,
    branch,
    workingTreeClean: porcelain === null ? null : porcelain.length === 0,
    handoff,
    readiness,
    coverage,
    orchestrator,
    sourceChangedByPresentClaim,
    sourceChangedByArtifact: {
      'system-readiness': artifactSourceChanged(rootDir, readiness, readinessRelevant),
      'sovereign-coverage': artifactSourceChanged(rootDir, coverage, coverageRelevant)
    }
  });
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const receipt = buildCurrentRealityFreeze();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (process.argv.includes('--verify')) {
    const exact = receipt.ok
      && receipt.handoff?.unknownPresentTenseClaims?.length === 0
      && receipt.staleGeneratedArtifactIds?.length === 0
      && receipt.unknownGeneratedArtifactIds?.length === 0
      && receipt.head?.workingTreeClean !== false;
    if (!exact) process.exitCode = 1;
  }
}
