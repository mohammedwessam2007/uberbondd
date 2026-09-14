#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: opts.binary ? null : 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function classify(file) {
  if (/^(AI_START_HERE\.md|AGENTS\.md|CLAUDE\.md|NORTH_STAR\.md|UBERBOND_CANON\.md|UBERBOND_BOOTSTRAP\.json)$/.test(file)) return 'constitutional-kernel';
  if (/^docs\/(CURRENT_|handoffs\/)/.test(file) || /^artifacts\/(system-readiness|.*current.*)\b/i.test(file)) return 'current-truth';
  if (/UBERBOND_TOTAL_BRAIN|UBERBOND_MASTER_MEMORY|uberbond-memory-index|PERPETUAL_FRONTIER|GENESIS|SOVEREIGN_COGNITIVE_CONTINUUM|PERSONAL_CIVILIZATION/i.test(file)) return 'total-memory-canon';
  if (/^src\//.test(file)) return 'source';
  if (/^api\//.test(file)) return 'api';
  if (/^scripts\//.test(file)) return 'script';
  if (/^tests?\//.test(file)) return 'test';
  if (/^\.github\//.test(file)) return 'github-automation';
  if (/^\.claude\//.test(file)) return 'claude-agent';
  if (/^(docs\/archive\/|archive\/|historical\/)/.test(file) || /HISTORICAL|ARCHIVE/i.test(file)) return 'historical-donor';
  if (/^docs\//.test(file)) return 'documentation';
  if (/^artifacts\//.test(file)) return 'artifact';
  if (/\.(json|ya?ml|toml|ini|env\.example)$/i.test(file)) return 'config';
  return 'other';
}

function isProbablyBinary(buffer) {
  const n = Math.min(buffer.length, 8192);
  for (let i = 0; i < n; i += 1) if (buffer[i] === 0) return true;
  return false;
}

function terms(s) {
  return [...new Set(String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9._-]{2,}/g) || [])]
    .filter(t => !['the','and','for','with','this','that','from','into','uberbond'].includes(t))
    .slice(0, 80);
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const all = args.includes('--all');
const missionIndex = args.indexOf('--mission');
const mission = missionIndex >= 0 ? (args[missionIndex + 1] || '') : '';
const missionTerms = terms(mission);

const root = git(['rev-parse', '--show-toplevel']).trim();
process.chdir(root);
const head = git(['rev-parse', 'HEAD']).trim();
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
const raw = git(['ls-files', '-z'], { binary: true });
const files = raw.toString('utf8').split('\0').filter(Boolean);

const mandatory = [
  'AI_START_HERE.md',
  'AGENTS.md',
  'NORTH_STAR.md',
  'docs/SOVEREIGN_COGNITIVE_CONTINUUM_TOTAL_NORTH_STAR.md',
  'artifacts/sovereign-cognitive-continuum-total-north-star.json',
  'UBERBOND_CANON.md',
  'UBERBOND_BOOTSTRAP.json',
  'docs/UBERBOND_TOTAL_BRAIN.md',
  'artifacts/uberbond-total-brain.json',
  'docs/UBERBOND_MASTER_MEMORY.md',
  'artifacts/uberbond-memory-index.json',
  'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md',
  'artifacts/perpetual-frontier-genesis.json',
  'docs/CURRENT_HANDOFF.json',
  'docs/CURRENT_SYSTEM_STATE.md',
  'docs/CROSS_CHAT_CONTINUITY.md',
  'docs/UNIVERSAL_CONTEXT_PROTOCOL.md'
].filter(file => fs.existsSync(file));

let totalBytes = 0;
let textFiles = 0;
let binaryFiles = 0;
const entries = [];

for (const file of files) {
  const buffer = fs.readFileSync(file);
  const binary = isProbablyBinary(buffer);
  totalBytes += buffer.length;
  if (binary) binaryFiles += 1; else textFiles += 1;

  let score = 0;
  if (mandatory.includes(file)) score += 1000;
  const hayPath = file.toLowerCase();
  for (const term of missionTerms) {
    if (hayPath.includes(term)) score += 40;
  }

  if (!binary && missionTerms.length) {
    const sample = buffer.length <= 1_000_000 ? buffer.toString('utf8') : buffer.subarray(0, 1_000_000).toString('utf8');
    const low = sample.toLowerCase();
    for (const term of missionTerms) {
      const first = low.indexOf(term);
      if (first >= 0) score += 8;
      const second = first >= 0 ? low.indexOf(term, first + term.length) : -1;
      if (second >= 0) score += 3;
    }
  }

  entries.push({
    path: file,
    bytes: buffer.length,
    sha256: sha256(buffer),
    binary,
    role: classify(file),
    relevanceScore: score
  });
}

entries.sort((a, b) => b.relevanceScore - a.relevanceScore || a.path.localeCompare(b.path));

const summary = {
  schemaVersion: 'uberbond-context-universe-1.0.0',
  generatedAt: new Date().toISOString(),
  repositoryRoot: path.basename(root),
  branch,
  head,
  mission: mission || null,
  trackedFiles: entries.length,
  trackedBytes: totalBytes,
  textFiles,
  binaryFiles,
  mandatory,
  topRelevant: entries.filter(e => e.relevanceScore > 0).slice(0, 60).map(e => ({ path: e.path, role: e.role, relevanceScore: e.relevanceScore, bytes: e.bytes, sha256: e.sha256 })),
  noAmputation: true,
  truthRule: 'Current exact source and durable external evidence outrank memory and historical donors.'
};

if (json) {
  process.stdout.write(JSON.stringify(all ? { ...summary, files: entries } : summary, null, 2) + '\n');
} else {
  console.log(`UBERBOND_CONTEXT_UNIVERSE_READY head=${head} files=${entries.length} bytes=${totalBytes}`);
  console.log('\nMandatory context:');
  for (const file of mandatory) console.log(`  ${file}`);
  if (mission) {
    console.log(`\nMission: ${mission}`);
    console.log('Mission-relevant paths:');
    for (const item of summary.topRelevant) console.log(`  [${item.relevanceScore}] ${item.path} (${item.role}, ${item.bytes} bytes)`);
  }
  if (all) {
    console.log('\nComplete tracked manifest:');
    for (const item of entries.sort((a, b) => a.path.localeCompare(b.path))) {
      console.log(`${item.sha256}  ${String(item.bytes).padStart(10)}  ${item.role.padEnd(24)}  ${item.path}`);
    }
  }
}
