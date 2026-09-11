import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyContextProjection } from '../src/context-projection.mjs';
import { mountFounderDialogueContext } from '../scripts/sovereign-founder-dialogue-context.mjs';

test('founder dialogue receives message-specific verified projection without persisting raw turn as a mount cache', () => {
  const controlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-founder-context-'));
  const marker = 'private-turn-marker-' + Date.now();
  try {
    const result = mountFounderDialogueContext({ controlDir, mission: `Continue UberBond context work ${marker}`, generatedAt: '2026-09-11T20:30:00Z' });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'FOUNDER_DIALOGUE_CONTEXT_READY');
    assert.equal(result.projection.audience, 'founder-dialogue');
    assert.equal(verifyContextProjection(result.projection, { audience: 'founder-dialogue', sourceCommit: result.projection.sourceCommit }).ok, true);
    assert.match(result.projection.mission, new RegExp(marker));
    assert.equal(fs.existsSync(path.join(controlDir, 'context', 'mount.json')), false);
    const brainPath = path.join(controlDir, 'context', 'brainstate.json');
    assert.equal(fs.existsSync(brainPath), true);
    assert.equal((fs.statSync(brainPath).mode & 0o777).toString(8), '600');
    assert.equal(fs.readFileSync(brainPath, 'utf8').includes(marker), false);
  } finally {
    fs.rmSync(controlDir, { recursive: true, force: true });
  }
});

test('founder dialogue rejects empty or oversized retrieval mission', () => {
  assert.equal(mountFounderDialogueContext({ mission: '' }).ok, false);
  assert.equal(mountFounderDialogueContext({ mission: 'x'.repeat(16001) }).ok, false);
});
