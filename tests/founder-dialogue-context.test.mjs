import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFounderDialogueContext } from '../src/founder-dialogue-context.mjs';

function mountResult(overrides = {}) {
  return {
    ok: true,
    status: 'CONTEXT_MOUNT_READY',
    mount: {
      contextMountId: 'a'.repeat(64),
      brainstateId: 'b'.repeat(64),
      sourceCommit: 'c'.repeat(40),
      missionContextId: 'd'.repeat(64),
      mission: 'Continue Context Sovereignty expansion.',
      brainstate: {
        objective: 'Sovereign Cognitive Continuum',
        economicNorthStar: 'risk-adjusted cleared contribution profit / founder minute',
        frontier: {
          activeMission: 'Expand context sovereignty until only external blockers remain.',
          blockers: ['No cross-product UI auto-attachment yet.'],
          nextActions: ['Bind Context Mount into every resident reasoning path.']
        }
      },
      missionContext: {
        relevantInitiatives: [
          { id: 'context-spine', name: 'Context Spine', status: 'CURRENT_PROGRAM' },
          { id: 'world-brain', name: 'World Brain', status: 'CURRENT_PROGRAM' }
        ]
      },
      cognitiveHistory: {
        events: [
          {
            sequence: 1,
            eventId: 'brain_evt_1234567890abcdef12345678',
            kind: 'CONTEXT_CHECKPOINT',
            subjectId: 'brainstate-a',
            summary: 'Exact-current Brainstate checkpoint observed.',
            truthClass: 'VERIFIED_CURRENT',
            observedAt: '2026-09-11T18:00:00.000Z',
            evidenceRefs: ['main:' + 'c'.repeat(40)]
          }
        ]
      },
      laws: {
        zeroRetelling: 'FOUNDER_MUST_NOT_RECONSTRUCT_MACHINE_RECOVERABLE_UBERBOND_CONTEXT',
        staleContext: 'CONTEXT_DRIFT_MUST_RECOMPILE_BEFORE_SUBSTANTIVE_EXECUTION'
      }
    },
    ...overrides
  };
}

test('founder dialogue compiler projects current mount into bounded zero-authority context', () => {
  const out = compileFounderDialogueContext({ mountResult: mountResult(), maxHistory: 8 });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'FOUNDER_DIALOGUE_CONTEXT_READY');
  assert.equal(out.context.terminalObjective, 'Sovereign Cognitive Continuum');
  assert.equal(out.context.relevantInitiatives.length, 2);
  assert.equal(out.context.cognitiveHistory.length, 1);
  assert.equal(out.context.businessEffectAuthority, 'NONE');
  assert.equal(out.context.externalEffectAuthority, 'NONE');
  assert.equal(out.externalEffectLedger.providerCalls, 0);
});

test('founder dialogue compiler accepts an automatically recompiled stale mount', () => {
  const value = mountResult({ status: 'CONTEXT_MOUNT_READY__STALE_CACHE_RECOMPILED' });
  const out = compileFounderDialogueContext({ mountResult: value });
  assert.equal(out.ok, true);
  assert.equal(out.context.sourceCommit, 'c'.repeat(40));
});

test('founder dialogue compiler refuses unverified or failed context mount', () => {
  const out = compileFounderDialogueContext({ mountResult: { ok: false, status: 'CONTEXT_MOUNT_CONTEXT_REFUSED' } });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('current-context-mount-required'));
});

test('founder dialogue compiler refuses malformed history instead of dropping it silently', () => {
  const value = mountResult();
  value.mount.cognitiveHistory.events[0].summary = '';
  const out = compileFounderDialogueContext({ mountResult: value });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('bounded-cognitive-history-required'));
});

test('founder dialogue compiler enforces a hard history bound', () => {
  const out = compileFounderDialogueContext({ mountResult: mountResult(), maxHistory: 13 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('valid-history-limit-required'));
});
