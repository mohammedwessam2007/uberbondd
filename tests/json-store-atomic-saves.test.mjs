import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '../src/store.mjs';

test('two JSON store instances never collide on the same fixed temporary path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ub-jsonstore-atomic-'));
  try {
    const first = new JsonStore(root);
    await first.init();
    const second = new JsonStore(root);
    await second.init();

    for (let i = 0; i < 48; i++) {
      first.data.settings = { writer: 'first', revision: i };
      second.data.settings = { writer: 'second', revision: i };
      await Promise.all([first.save(), second.save()]);
      const onDisk = JSON.parse(await readFile(join(root, 'db.json'), 'utf8'));
      assert.equal(onDisk.settings.revision, i);
      assert.ok(['first', 'second'].includes(onDisk.settings.writer));
    }

    const files = await readdir(root);
    assert.deepEqual(files, ['db.json'], 'private temp files must not leak');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('concurrent writes on the same store keep the JSON file valid and leave no temps', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ub-jsonstore-one-'));
  try {
    const store = new JsonStore(root);
    await store.init();
    await Promise.all(Array.from({ length: 40 }, (_, i) => {
      store.data.settings = { finalRevision: i };
      return store.save();
    }));
    const data = JSON.parse(await readFile(join(root, 'db.json'), 'utf8'));
    assert.equal(typeof data.settings.finalRevision, 'number');
    assert.deepEqual(await readdir(root), ['db.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
