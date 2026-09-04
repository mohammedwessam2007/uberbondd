import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENESIS_IMPLEMENTATION_EVIDENCE } from '../src/genesis-implementation-evidence-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const primitiveSources = [...new Set([
  ...Object.values(GENESIS_IMPLEMENTATION_EVIDENCE).flatMap(item => item.sources || []),
  'src/genesis-metabolism.mjs'
])].filter(relative => relative === 'src/perpetual-frontier-genesis.mjs' || relative.startsWith('src/genesis-'));

const forbidden = [
  /from\s+['"]node:child_process['"]/,
  /from\s+['"]node:(?:net|http|https|http2|tls|dgram|dns)['"]/,
  /\bfetch\s*\(/,
  /\bexec(?:File|FileSync|Sync)?\s*\(/,
  /\bspawn(?:Sync)?\s*\(/,
  /\bprocess\.env\b/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/
];

test('all GENESIS primitive source modules remain zero-effect computation surfaces', () => {
  assert.ok(primitiveSources.length >= 9);
  for (const relative of primitiveSources) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source), false, `${relative} contains prohibited direct-I/O surface ${pattern}`);
    }
  }
});
