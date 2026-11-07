import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadRegistry, retrieveCrossovers } from '../src/founder-890-crossover.mjs';
test('canonical JSONL adapter preserves 890 bodies and verified hashes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phoenix-890-'));
  try {
    const rows = Array.from({ length: 890 }, (_, k) => {
      const body = 'original immutable idea ' + (k + 1);
      return { id: 'founder-moonshot-' + String(k + 1).padStart(4, '0'), ordinal: k + 1, title: 'Idea ' + (k + 1), exact_original_body: body, exact_source_bytes_sha256: createHash('sha256').update(body).digest('hex') };
    });
    const file = join(dir, 'registry.jsonl');
    writeFileSync(file, rows.map(x => JSON.stringify(x)).join('\n') + '\n');
    const loaded = loadRegistry(file);
    assert.equal(loaded.length, 890);
    assert.equal(loaded[889].body, rows[889].exact_original_body);
    assert.equal(retrieveCrossovers(loaded, 'original immutable', 3).length, 3);
    rows[889].exact_source_bytes_sha256 = '0'.repeat(64);
    writeFileSync(file, rows.map(x => JSON.stringify(x)).join('\n'));
    assert.throws(() => loadRegistry(file), /mismatch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
