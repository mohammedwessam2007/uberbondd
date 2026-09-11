import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContextCognitiveEvent } from '../src/sovereign-context-fabric.mjs';
import { compileCognitiveJournalEntry } from '../src/cognitive-event-journal.mjs';
import { compileContextMount, retrieveRelevantCognitiveHistory } from '../src/context-history-retrieval.mjs';

function journalEntries() {
  const inputs = [
    { kind: 'DECISION_UPDATE', id: 'distribution-choice', summary: 'Prefer partner distribution experiments over paid media until economics are observed.' },
    { kind: 'MEMORY_UPDATE', id: 'context-spine', summary: 'Cross-chat context continuity uses Brainstate and the Context Spine.' },
    { kind: 'FOUNDER_DOCTRINE', id: 'zero-retelling', summary: 'Founder must not reconstruct machine recoverable context in a fresh chat.' }
  ];
  const entries = [];
  let previous = null;
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const event = compileContextCognitiveEvent({
      kind: input.kind,
      sourceNodeId: 'context-spine',
      subjectType: 'MEMORY_FACT',
      subjectId: input.id,
      summary: input.summary,
      evidenceRefs: [`test://${input.id}`],
      truthClass: 'CHAT_SPEC_GOAL',
      observedAt: `2026-09-11T18:0${index}:00Z`
    });
    assert.equal(event.ok, true);
    const compiled = compileCognitiveJournalEntry({ compiledEvent: event, sequence: index + 1, previousEntryDigest: previous });
    assert.equal(compiled.ok, true);
    entries.push(compiled.entry);
    previous = compiled.entry.entryDigest;
  }
  return entries;
}

test('history retrieval selects mission-relevant cognitive events rather than dumping the journal', () => {
  const result = retrieveRelevantCognitiveHistory({
    entries: journalEntries(),
    mission: 'Restore fresh chat context continuity and Context Spine memory.',
    maxEvents: 2
  });
  assert.equal(result.ok, true);
  assert.equal(result.selectedCount, 2);
  assert.ok(result.events.some(event => event.subjectId === 'context-spine'));
  assert.ok(result.events.some(event => event.subjectId === 'zero-retelling'));
  assert.ok(!result.events.some(event => event.subjectId === 'distribution-choice'));
});

test('history retrieval falls back to a small recent slice when mission has no lexical match', () => {
  const result = retrieveRelevantCognitiveHistory({
    entries: journalEntries(),
    mission: 'quasar xenobiology',
    maxEvents: 2
  });
  assert.equal(result.ok, true);
  assert.equal(result.selectedCount, 2);
  assert.deepEqual(result.events.map(event => event.sequence), [2, 3]);
});

test('context mount combines verified current Brainstate, mission slice, and journal tip without authority', () => {
  const entries = journalEntries();
  const doctorResult = {
    ok: true,
    status: 'CONTEXT_CURRENT__MISSION_CONTEXT_READY',
    sourceCommit: 'a'.repeat(40),
    brainstateId: 'b'.repeat(64),
    contextIdentityDigest: 'c'.repeat(64),
    capsule: {
      contextAbiVersion: 'uberbond.context-abi.v1',
      laws: {
        zeroRetellingLaw: 'FOUNDER_MUST_NOT_RECONSTRUCT_MACHINE_RECOVERABLE_UBERBOND_CONTEXT',
        staleContextLaw: 'CONTEXT_DRIFT_MUST_RECOMPILE_BEFORE_SUBSTANTIVE_EXECUTION'
      }
    },
    missionContext: {
      missionContextId: 'd'.repeat(64),
      mission: 'fresh chat context continuity'
    }
  };
  const result = compileContextMount({ doctorResult, journalEntries: entries, maxHistoricalEvents: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'CONTEXT_MOUNT_READY');
  assert.match(result.mount.contextMountId, /^[a-f0-9]{64}$/);
  assert.equal(result.mount.brainstateId, doctorResult.brainstateId);
  assert.equal(result.mount.cognitiveHistory.totalJournalEntries, 3);
  assert.equal(result.mount.businessEffectAuthority, 'NONE');
  assert.equal(result.mount.externalEffectAuthority, 'NONE');
});

test('mount records automatic stale-cache recompilation explicitly', () => {
  const doctorResult = {
    ok: true,
    status: 'CONTEXT_CURRENT__MISSION_CONTEXT_READY',
    sourceCommit: 'a'.repeat(40),
    brainstateId: 'b'.repeat(64),
    contextIdentityDigest: 'c'.repeat(64),
    capsule: {
      contextAbiVersion: 'uberbond.context-abi.v1',
      laws: { zeroRetellingLaw: 'ZERO_RETELLING', staleContextLaw: 'RECOMPILE_STALE' }
    },
    missionContext: { missionContextId: 'd'.repeat(64), mission: 'continue UberBond' }
  };
  const result = compileContextMount({ doctorResult, journalEntries: [], recompiledFromStale: true });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'CONTEXT_MOUNT_READY__STALE_CACHE_RECOMPILED');
  assert.equal(result.mount.recompiledFromStale, true);
});
