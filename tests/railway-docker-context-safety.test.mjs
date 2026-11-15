import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

// Dependency-free static contract, NOT proof of Docker's glob matcher or an
// isolated Docker build. A real build-context inspection remains a release gate.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lines = readFileSync(join(root, '.dockerignore'), 'utf8')
  .split(/\r?\n/).map(line => line.trim())
  .filter(line => line && !line.startsWith('#'));
const patterns = new Set(lines);
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const requireRules = (...rules) => {
  for (const rule of rules) assert.ok(patterns.has(rule), `missing .dockerignore rule: ${rule}`);
};

test('COPY . . requires an independent Docker context exclusion policy', () => {
  assert.match(dockerfile, /^COPY\s+\.\s+\.\s*$/m);
  assert.match(dockerfile, /^COPY\s+package\*\.json\s+\.\/\s*$/m);
  assert.match(dockerfile, /^RUN\s+npm ci --omit=dev\s*$/m);
});

test('source control and nested dependencies are excluded', () => {
  requireRules('.git', '**/.git', 'node_modules', '**/node_modules');
});

test('root and nested environment files and package auth configs are excluded', () => {
  requireRules('.env', '.env.*', '**/.env', '**/.env.*', '.npmrc', '**/.npmrc',
    '.pypirc', '**/.pypirc');
});

test('cloud credentials and founder-private local paths are excluded', () => {
  requireRules('.ssh', '**/.ssh', '.aws', '**/.aws', '.kube', '**/.kube',
    '.cache', '**/.cache', '.local', '**/.local',
    '.phoenix-backups-private', '**/.phoenix-backups-private');
});

test('local database and launch evidence paths are excluded', () => {
  requireRules('data/db.json', '**/data/db.json', '**/data/screenshots',
    '**/data/quant-vault', 'launch-facts*.json', '**/launch-facts*.json');
});

test('recursive private key, database, and log exclusions remain in place', () => {
  requireRules('**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx',
    '**/*.sqlite', '**/*.sqlite3', '**/*.db', '**/*.log');
});

test('no negations or blanket exclusions erase tracked runtime and GENESIS assets', () => {
  assert.equal(lines.some(line => line.startsWith('!')), false);
  assert.equal(patterns.has('*'), false);
  for (const path of ['Dockerfile', 'package.json', 'package-lock.json',
    'server.mjs', 'worker.mjs', 'src', 'scripts', 'artifacts', 'config',
    'data', 'data/genesis', 'data/frontier-capability-donors.json']) {
    assert.equal(patterns.has(path), false, `${path} must remain in the context`);
  }
});

test('web and worker entrypoints stay separate', () => {
  assert.equal(pkg.scripts['start:web'], 'node server.mjs');
  assert.equal(pkg.scripts['start:worker'], 'node worker.mjs');
  assert.match(dockerfile, /^CMD \["node", "server\.mjs"\]$/m);
});
