// A guard that reads as an allowlist and is in fact a truthiness check.
//
// `definition(key)` did `const def = MAP[key]; if (!def) throw`. `MAP[key]`
// walks the prototype chain, so `definition('constructor')` returned Object --
// truthy, past the guard, and on into `def.table` as undefined. The filter loop
// had the same shape: `def.columns[property]` returned a function for
// 'toString', 'hasOwnProperty', 'valueOf', and the prototype object for
// '__proto__', each of them truthy enough to be string-interpolated into SQL.
//
// The interpolated text is a syntax error rather than an injection today, which
// is luck rather than design: it stops being luck the moment a column is named
// after a prototype member, or an interpolation moves. Object.hasOwn is what
// these checks always meant.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store, PostgresStore } from '../src/store.mjs';

// The interpolation lives on the Postgres path; the JSON path filters an array
// and cannot inject anything. Both are checked, for different properties.
const DATABASE_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

const PROTOTYPE_KEYS = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'];

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-lookup-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('a prototype member is not a collection', { skip: !DATABASE_URL && 'set OMNIA_V9_TEST_DATABASE_URL' }, async () => {
  const store = new PostgresStore({ databaseUrl: DATABASE_URL, ssl: false });
  try {
    for (const key of PROTOTYPE_KEYS) {
      await assert.rejects(
        () => store.list(key, {}),
        error => /Unknown collection|INVALID_COLLECTION/.test(String(error?.message || error?.code)),
        `${key} was accepted as a collection name`
      );
    }
  } finally { await store.close?.(); }
});

test('a prototype member is not a filterable column', { skip: !DATABASE_URL && 'set OMNIA_V9_TEST_DATABASE_URL' }, async () => {
  const store = new PostgresStore({ databaseUrl: DATABASE_URL, ssl: false });
  try {
    for (const key of PROTOTYPE_KEYS) {
      await assert.rejects(
        () => store.list('auditLog', { filters: { [key]: 'x' } }),
        error => /Unsupported filter|INVALID_FILTER/.test(String(error?.message || error?.code)),
        `${key} was accepted as a filter column`
      );
    }
  } finally { await store.close?.(); }
});

test('the JSON path matches no row for a prototype filter, rather than every row', async () => {
  // It filters an array rather than building SQL, so nothing can be injected --
  // but `row?.[key]` walks the prototype chain too, and a comparison that
  // accidentally succeeded would return rows the caller never asked for.
  const store = await tempStore();
  await store.log('probe_type', { n: 1 });
  for (const key of PROTOTYPE_KEYS) {
    const rows = await store.list('auditLog', { filters: { [key]: 'x' } });
    assert.deepEqual(rows, [], `${key} matched rows`);
  }
});

test('a prototype member is not an ordering column either', async () => {
  const store = await tempStore();
  await store.log('probe_type', { n: 1 });
  for (const key of PROTOTYPE_KEYS) {
    // Ordering falls back rather than throwing, but it must fall back to the
    // default column and never interpolate an inherited value.
    const rows = await store.list('auditLog', { orderBy: key });
    assert.ok(Array.isArray(rows), `${key} broke the ordering fallback`);
  }
});

test('real collections and real filters still work: this is an allowlist, not a wall', async () => {
  const store = await tempStore();
  await store.log('probe_type', { n: 1 });
  await store.log('other_type', { n: 2 });
  const filtered = await store.list('auditLog', { filters: { type: 'probe_type' } });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].type, 'probe_type');
  assert.equal((await store.list('auditLog')).length, 2);
});

test('an unknown but ordinary filter name is still refused on the Postgres path', { skip: !DATABASE_URL && 'set OMNIA_V9_TEST_DATABASE_URL' }, async () => {
  const store = new PostgresStore({ databaseUrl: DATABASE_URL, ssl: false });
  try {
    await assert.rejects(
      () => store.list('auditLog', { filters: { notAColumn: 'x' } }),
      error => /Unsupported filter|INVALID_FILTER/.test(String(error?.message || error?.code))
    );
  } finally { await store.close?.(); }
});

test('the two stores disagree about an unknown filter, and the divergence is recorded', async () => {
  // Postgres throws INVALID_FILTER; the JSON path returns []. A typo'd filter
  // name is therefore a loud error in production and a silent empty result in
  // development, which is the wrong way round. Pinned rather than changed:
  // making the JSON path throw would be a behaviour change across every caller
  // and belongs in its own pass, but the divergence should not be discovered
  // again from scratch.
  const store = await tempStore();
  await store.log('probe_type', { n: 1 });
  assert.deepEqual(await store.list('auditLog', { filters: { notAColumn: 'x' } }), [],
    'the JSON path silently matches nothing where Postgres refuses');
});
