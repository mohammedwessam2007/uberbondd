import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { readCognitiveJournal } from '../src/cognitive-event-journal.mjs';
import { syncSovereignContext } from '../scripts/sovereign-context-sync.mjs';

function tempContext() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-context-sync-'));
  return {
    root,
    journalPath: path.join(root, 'events.jsonl'),
    capsuleCachePath: path.join(root, 'brainstate.json'),
    mountCachePath: path.join(root, 'mount.json')
  };
}

test('resident context sync checkpoints a new Brainstate once and is idempotent while truth is unchanged', () => {
  const state = tempContext();
  try {
    const first = syncSovereignContext({ ...state, generatedAt: '2026-09-11T20:00:00Z' });
    assert.equal(first.ok, true);
    assert.equal(first.status, 'CONTEXT_SYNC_CHECKPOINT_APPENDED');
    assert.equal(first.checkpointAppended, true);
    const second = syncSovereignContext({ ...state, generatedAt: '2026-09-11T20:01:00Z' });
    assert.equal(second.ok, true);
    assert.equal(second.status, 'CONTEXT_SYNC_CURRENT_NO_CHECKPOINT');
    assert.equal(second.checkpointAppended, false);
    assert.equal(second.brainstateId, first.brainstateId);
    const journal = readCognitiveJournal(state.journalPath);
    assert.equal(journal.ok, true);
    assert.equal(journal.entryCount, 1);
    assert.equal(journal.entries[0].event.subjectId, first.brainstateId);
    assert.equal((fs.statSync(state.capsuleCachePath).mode & 0o777).toString(8), '600');
    assert.equal((fs.statSync(state.mountCachePath).mode & 0o777).toString(8), '600');
  } finally { fs.rmSync(state.root, { recursive: true, force: true }); }
});

test('resident authorctl routes exact-current finite closure into initiative without weakening pause or context gates', () => {
  const authorctl = readFileSync(new URL('../ops/sovereign/uberbond-authorctl', import.meta.url), 'utf8');
  const wakeStart = authorctl.indexOf('wake(){');
  const verifyStart = authorctl.indexOf('\nverify(){');
  const wake = authorctl.slice(wakeStart, verifyStart);
  assert.match(authorctl, /scripts\/sovereign-context-sync\.mjs/);
  assert.match(authorctl, /scripts\/sovereign-context-mount\.mjs/);
  assert.match(authorctl, /scripts\/sovereign-context-checkpoint\.mjs/);
  assert.match(authorctl, /scripts\/sovereign-initiative-runtime\.mjs/);
  assert.match(authorctl, /NORTH_STAR_INITIATIVE_DEFERRED_TO_FINITE_ENGINEERING/);
  assert.match(authorctl, /CONTEXT_JOURNAL="\$\{UBERBOND_CONTEXT_JOURNAL_PATH:-\$CONTEXT_DIR\/events\.jsonl\}"/);
  assert.ok(wake.indexOf('[[ -L "$PAUSE_FILE" ]]') >= 0);
  assert.ok(wake.indexOf('[[ -f "$PAUSE_FILE" ]]') >= 0);
  assert.ok(wake.indexOf('[[ -f "$PAUSE_FILE" ]]') < wake.indexOf('context_sync'));
  assert.ok(wake.indexOf('context_sync') < wake.indexOf('initiative_wake'));
  assert.ok(wake.indexOf('initiative_wake') < wake.indexOf('publish_worker_context'));
  assert.ok(wake.indexOf('publish_worker_context') < wake.indexOf('scripts/sovereign-autonomy-pulse.mjs'));
  assert.match(authorctl, /context\) context_show/);
  assert.match(authorctl, /checkpoint\) checkpoint/);
});
