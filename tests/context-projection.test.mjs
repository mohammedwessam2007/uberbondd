import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { compileContextProjection, verifyContextProjection } from '../src/context-projection.mjs';
import { projectWorkerContext } from '../scripts/sovereign-context-project-worker.mjs';

function mountResult() {
  return {
    ok: true,
    status: 'CONTEXT_MOUNT_READY',
    mount: {
      schemaVersion: 'uberbond.context-mount.v1',
      sourceCommit: 'a'.repeat(40),
      brainstateId: 'b'.repeat(64),
      contextMountId: 'c'.repeat(64),
      missionContextId: 'd'.repeat(64),
      mission: 'Expand context sovereignty.',
      brainstate: {
        objective: 'Sovereign Cognitive Continuum',
        economicNorthStar: 'risk-adjusted cleared contribution profit / founder minute',
        frontier: {
          activeMission: 'Keep one continuous brain across substrates.',
          blockers: ['External UI attachment remains product-dependent.'],
          nextActions: ['Project verified context across OS boundaries.']
        }
      },
      missionContext: { relevantInitiatives: [{ id: 'context-spine', name: 'Context Spine', status: 'CURRENT_PROGRAM' }] },
      cognitiveHistory: { events: [{ sequence: 1, eventId: 'brain_evt_1234567890abcdef12345678', kind: 'CONTEXT_CHECKPOINT', subjectId: 'brainstate', summary: 'Verified checkpoint.', truthClass: 'CURRENT_REPOSITORY_CANON', observedAt: '2026-09-11T20:00:00Z', evidenceRefs: ['source-commit://' + 'a'.repeat(40)] }] },
      laws: { zeroRetelling: 'ZERO_RETELLING', staleContext: 'RECOMPILE_ON_DRIFT' }
    }
  };
}

test('context projection is bounded, digest-bound and zero-authority', () => {
  const compiled = compileContextProjection({ mountResult: mountResult(), audience: 'isolated-worker' });
  assert.equal(compiled.ok, true);
  assert.match(compiled.projection.projectionId, /^[a-f0-9]{64}$/);
  assert.equal(compiled.projection.sourceCommit, 'a'.repeat(40));
  assert.equal(compiled.projection.consequenceAuthority, 'NONE');
  const verified = verifyContextProjection(compiled.projection, { audience: 'isolated-worker', sourceCommit: 'a'.repeat(40) });
  assert.equal(verified.ok, true);
});

test('context projection rejects tampering, wrong audience and wrong source', () => {
  const compiled = compileContextProjection({ mountResult: mountResult(), audience: 'isolated-worker' });
  const tampered = structuredClone(compiled.projection);
  tampered.activeMission = 'invented replacement mission';
  assert.equal(verifyContextProjection(tampered).ok, false);
  assert.ok(verifyContextProjection(tampered).reasonCodes.includes('context-projection-digest-mismatch'));
  assert.ok(verifyContextProjection(compiled.projection, { audience: 'founder-dialogue' }).reasonCodes.includes('context-projection-audience-mismatch'));
  assert.ok(verifyContextProjection(compiled.projection, { sourceCommit: 'f'.repeat(40) }).reasonCodes.includes('context-projection-source-mismatch'));
});

test('real worker projector publishes exact-current source-bound projection at group-readable mode', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-worker-projection-'));
  try {
    const journal = path.join(tmp, 'events.jsonl');
    const brain = path.join(tmp, 'brainstate.json');
    const mount = path.join(tmp, 'mount.json');
    const output = path.join(tmp, 'inbox', 'context-projection.json');
    const result = projectWorkerContext({ journalPath: journal, capsuleCachePath: brain, mountCachePath: mount, outputPath: output, generatedAt: '2026-09-11T20:00:00Z' });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'WORKER_CONTEXT_PROJECTION_PUBLISHED');
    const projection = JSON.parse(fs.readFileSync(output, 'utf8'));
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    assert.equal(projection.sourceCommit, head);
    assert.equal(verifyContextProjection(projection, { audience: 'isolated-worker', sourceCommit: head }).ok, true);
    assert.equal((fs.statSync(output).mode & 0o777).toString(8), '640');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
