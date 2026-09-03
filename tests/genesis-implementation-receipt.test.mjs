import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const text = fs.readFileSync(new URL('../docs/memory/GENESIS_275_IMPLEMENTATION_2026-09-03.md', import.meta.url), 'utf8');

test('GENESIS implementation receipt preserves source-vs-runtime-vs-commercial truth', () => {
  assert.match(text, /SOURCE\/TEST SURFACE IMPLEMENTED/);
  assert.match(text, /Source\/test presence is not a test pass/);
  assert.match(text, /Exact-head green execution .* is still required/);
  assert.match(text, /0 customers, USD 0 cleared revenue/);
});

test('GENESIS receipt preserves the falsified memory diagnosis instead of rewriting history', () => {
  assert.match(text, /original hypothesis .* 160 named-initiative ceiling was falsified/i);
  assert.match(text, /160-item\/no-truncation validator bound was restored unchanged/i);
  assert.match(text, /CURRENT_OWNER_DOCTRINE/);
  assert.match(text, /CURRENT_PROGRAM/);
  assert.doesNotMatch(text, /raising only the bounded named-initiative ceiling from 160 to 512/i);
});

test('GENESIS receipt includes metabolism in the autonomous intended path', () => {
  assert.match(text, /ONTOGENESIS -> GENESIS metabolism -> persisted evidence receipts/);
});
