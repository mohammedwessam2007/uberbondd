import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTATIONS } from '../scripts/mutation-war.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function occurrenceCount(source, needle) {
  if (typeof needle !== 'string' || needle.length === 0) return 0;
  return source.split(needle).length - 1;
}

test('every registered mutation anchor identifies exactly one live source site', () => {
  const invalid = [];
  const ids = new Set();

  for (const mutation of MUTATIONS) {
    if (ids.has(mutation.id)) {
      invalid.push({ id: mutation.id, reason: 'duplicate-mutation-id' });
      continue;
    }
    ids.add(mutation.id);

    let source;
    try {
      source = readFileSync(join(repoRoot, mutation.file), 'utf8');
    } catch (error) {
      invalid.push({ id: mutation.id, file: mutation.file, reason: 'target-file-unreadable', detail: error?.code || error?.message });
      continue;
    }

    const occurrences = occurrenceCount(source, mutation.find);
    if (occurrences !== 1) {
      invalid.push({
        id: mutation.id,
        file: mutation.file,
        reason: occurrences === 0 ? 'anchor-not-found' : 'anchor-ambiguous',
        occurrences
      });
    }
  }

  assert.deepEqual(invalid, [], `Mutation registry contains invalid live anchors:\n${JSON.stringify(invalid, null, 2)}`);
});
