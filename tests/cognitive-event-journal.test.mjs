import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileContextCognitiveEvent } from '../src/sovereign-context-fabric.mjs';
import {
  appendCognitiveJournalEvent,
  compileCognitiveJournalEntry,
  readCognitiveJournal,
  verifyCognitiveJournalEntries
} from '../src/cognitive-event-journal.mjs';

function tempJournal() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-cognitive-journal-'));
  return path.join(dir, 'events.jsonl');
}

function event(id, kind = 'CONTEXT_CHECKPOINT', parentEventIds = []) {
  return compileContextCognitiveEvent({
    kind,
    sourceNodeId: 'context-spine',
    subjectType: 'BRAINSTATE',
    subjectId: id,
    summary: `Context event ${id}`,
    evidenceRefs: [`brainstate://${id}`],
    payloadRef: `context://${id}`,
    truthClass: 'CURRENT_REPOSITORY_CANON',
    observedAt: '2026-09-11T18:00:00Z',
    parentEventIds
  });
}

test('journal appends canonical events as a contiguous hash chain and replays them', () => {
  const file = tempJournal();
  const first = event('brain-a');
  assert.equal(first.ok, true);
  const a = appendCognitiveJournalEvent({ journalPath: file, compiledEvent: first });
  assert.equal(a.ok, true);
  assert.equal(a.sequence, 1);
  assert.equal(a.previousEntryDigest, null);

  const second = event('brain-b', 'SESSION_HANDOFF', [first.eventId]);
  assert.equal(second.ok, true);
  const b = appendCognitiveJournalEvent({ journalPath: file, compiledEvent: second });
  assert.equal(b.ok, true);
  assert.equal(b.sequence, 2);
  assert.equal(b.previousEntryDigest, a.entryDigest);

  const replay = readCognitiveJournal(file);
  assert.equal(replay.ok, true);
  assert.equal(replay.entryCount, 2);
  assert.equal(replay.tipDigest, b.entryDigest);
  assert.deepEqual(replay.eventIds, [first.eventId, second.eventId]);
  assert.equal(replay.entries[1].event.parentEventIds[0], first.eventId);
});

test('mutating a historical event breaks the chain digest and is refused', () => {
  const file = tempJournal();
  appendCognitiveJournalEvent({ journalPath: file, compiledEvent: event('brain-a') });
  appendCognitiveJournalEvent({ journalPath: file, compiledEvent: event('brain-b', 'MEMORY_UPDATE') });
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  rows[0].event.summary = 'tampered history';
  fs.writeFileSync(file, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
  const replay = readCognitiveJournal(file);
  assert.equal(replay.ok, false);
  assert.ok(replay.reasonCodes.includes('journal-entry-digest-mismatch'));
});

test('truncated or malformed JSONL is refused rather than partially replayed', () => {
  const file = tempJournal();
  appendCognitiveJournalEvent({ journalPath: file, compiledEvent: event('brain-a') });
  fs.appendFileSync(file, '{"broken":');
  const replay = readCognitiveJournal(file);
  assert.equal(replay.ok, false);
  assert.ok(replay.reasonCodes.includes('journal-jsonl-parse-failed'));
});

test('duplicate cognitive event is idempotently refused', () => {
  const file = tempJournal();
  const same = event('brain-a');
  assert.equal(appendCognitiveJournalEvent({ journalPath: file, compiledEvent: same }).ok, true);
  const duplicate = appendCognitiveJournalEvent({ journalPath: file, compiledEvent: same });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.status, 'COGNITIVE_JOURNAL_DUPLICATE');
  assert.ok(duplicate.reasonCodes.includes('duplicate-cognitive-event'));
});

test('writer lock prevents concurrent append instead of racing the journal tip', () => {
  const file = tempJournal();
  fs.writeFileSync(`${file}.lock`, 'held', { mode: 0o600 });
  const result = appendCognitiveJournalEvent({ journalPath: file, compiledEvent: event('brain-a') });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'COGNITIVE_JOURNAL_BUSY');
  assert.ok(result.reasonCodes.includes('journal-writer-lock-held'));
  assert.equal(fs.existsSync(`${file}.lock`), true);
});

test('symlink journal path is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-cognitive-symlink-'));
  const target = path.join(dir, 'target.jsonl');
  const link = path.join(dir, 'events.jsonl');
  fs.writeFileSync(target, '');
  fs.symlinkSync(target, link);
  const result = appendCognitiveJournalEvent({ journalPath: link, compiledEvent: event('brain-a') });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('regular-nonsymlink-journal-required'));
});

test('journal rejects forged canonical event IDs or mutated canonical payloads', () => {
  const compiled = event('brain-a');
  const forgedId = structuredClone(compiled);
  forgedId.eventId = 'brain_evt_000000000000000000000000';
  assert.equal(compileCognitiveJournalEntry({ compiledEvent: forgedId, sequence: 1 }).ok, false);

  const mutated = structuredClone(compiled);
  mutated.event.summary = 'mutated after compilation';
  assert.equal(compileCognitiveJournalEntry({ compiledEvent: mutated, sequence: 1 }).ok, false);
});

test('standalone verifier catches sequence gaps and broken previous digests', () => {
  const first = compileCognitiveJournalEntry({ compiledEvent: event('brain-a'), sequence: 1 });
  assert.equal(first.ok, true);
  const second = compileCognitiveJournalEntry({ compiledEvent: event('brain-b'), sequence: 2, previousEntryDigest: first.entry.entryDigest });
  assert.equal(second.ok, true);
  second.entry.sequence = 3;
  const gap = verifyCognitiveJournalEntries([first.entry, second.entry]);
  assert.equal(gap.ok, false);
  assert.ok(gap.reasonCodes.includes('journal-sequence-gap'));
});
