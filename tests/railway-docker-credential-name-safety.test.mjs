import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static Docker-context policy check. Actual Docker pattern matching, image
// contents, and remote builder behavior require separate isolated verification.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lines = readFileSync(join(root, '.dockerignore'), 'utf8')
  .split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#'));
const patterns = new Set(lines);

const requireAtAllDepths = name => {
  assert.ok(patterns.has(name), `missing root exclusion: ${name}`);
  assert.ok(patterns.has(`**/${name}`), `missing recursive exclusion: ${name}`);
};

test('Docker context refuses common credential files without private-key extensions', () => {
  for (const name of ['.envrc', '.netrc', '.pgpass', '.git-credentials',
    'id_rsa', 'id_ed25519', 'credentials.json', 'secrets.json',
    'service-account.json']) requireAtAllDepths(name);
});

test('Terraform state and backups are excluded at root and nested paths', () => {
  for (const name of ['*.tfstate', '*.tfstate.*']) requireAtAllDepths(name);
});

test('new exclusions do not blanket-remove founder GENESIS or runtime source', () => {
  assert.ok(!lines.some(line => line.startsWith('!')), 'negation could re-include secrets');
  for (const path of ['data', 'data/genesis', 'artifacts', 'src', 'scripts', 'config',
    'server.mjs', 'worker.mjs']) {
    assert.ok(!patterns.has(path), `must preserve runtime or provenance: ${path}`);
  }
});
