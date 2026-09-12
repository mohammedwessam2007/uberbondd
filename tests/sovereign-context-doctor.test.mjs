import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  overlayExactCurrentContext,
  TERMINAL_NORTH_STAR_PATH,
  CURRENT_HANDOFF_PATH
} from '../scripts/sovereign-context-doctor.mjs';

function fixture({ terminalMutator = null, handoffMutator = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-context-overlay-'));
  const terminal = {
    schemaVersion: 'uberbond-sovereign-cognitive-continuum-total-north-star-1.0.0',
    status: 'TERMINAL_NORTH_STAR_SUPERSET_CHAT_SPEC_GOAL',
    canonicalName: 'Sovereign Cognitive Continuum',
    canonicalDefinition: 'Terminal cognitive civilization definition.',
    terminalTriad: ['Mohamed provides will', 'UberBond provides intelligence', 'Reality provides feedback'],
    canonicalHierarchy: ['SOVEREIGN_SELF', 'SOVEREIGN_COGNITIVE_CONTINUUM', 'PERSONAL_CIVILIZATION_ENGINE', 'ECONOMIC_AUTONOMY_ENGINE'],
    subordinateEconomicObjective: 'risk-adjusted cleared contribution profit / founder minute',
    truthBoundary: { implementedClaim: false }
  };
  const handoff = {
    schemaVersion: 'uberbond-handoff-3.2.0',
    sourceCommit: 'a'.repeat(40),
    terminalNorthStar: 'Sovereign Cognitive Continuum',
    containedNorthStar: 'Personal Civilization Engine',
    activeMission: 'Preserve exact current cognitive continuity.',
    completedSincePreviousCheckpoint: ['new continuity primitive merged'],
    genuineBlockers: ['owned runtime not yet observed'],
    nextExecutor: {
      primary: 'activate persistent host',
      selfCompletion: 'continue bounded self-completion'
    }
  };
  terminalMutator?.(terminal);
  handoffMutator?.(handoff);
  for (const [relative, value] of [[TERMINAL_NORTH_STAR_PATH, terminal], [CURRENT_HANDOFF_PATH, handoff]]) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  }
  return root;
}

function packet() {
  return {
    project: 'UberBond',
    sourceCommit: 'b'.repeat(40),
    objective: 'STALE Personal Civilization top-level wording',
    economicNorthStar: 'stale economic wording',
    endState: 'stale economic-only end state',
    currentHandoff: {
      activeMission: 'stale mission',
      completed: [],
      blockers: [],
      nextActions: [],
      handoffBasisSha: null,
      freshAgainstSourceCommit: false
    }
  };
}

test('terminal overlay prevents older bootstrap wording from outranking the Sovereign Cognitive Continuum', () => {
  const root = fixture();
  const overlaid = overlayExactCurrentContext({ packet: packet(), rootDir: root });
  assert.equal(overlaid.objective, 'Terminal cognitive civilization definition.');
  assert.equal(overlaid.economicNorthStar, 'risk-adjusted cleared contribution profit / founder minute');
  assert.match(overlaid.endState, /^Sovereign Cognitive Continuum:/);
  assert.equal(overlaid.terminalContext.canonicalName, 'Sovereign Cognitive Continuum');
  assert.equal(overlaid.terminalContext.containedNorthStar, 'Personal Civilization Engine');
});

test('modern handoff schema cannot silently collapse frontier arrays to empty legacy aliases', () => {
  const root = fixture();
  const overlaid = overlayExactCurrentContext({ packet: packet(), rootDir: root });
  assert.deepEqual(overlaid.currentHandoff.completed, ['new continuity primitive merged']);
  assert.deepEqual(overlaid.currentHandoff.blockers, ['owned runtime not yet observed']);
  assert.deepEqual(overlaid.currentHandoff.nextActions, [
    'primary: activate persistent host',
    'selfCompletion: continue bounded self-completion'
  ]);
  assert.equal(overlaid.currentHandoff.activeMission, 'Preserve exact current cognitive continuity.');
  assert.equal(overlaid.currentHandoff.handoffBasisSha, 'a'.repeat(40));
  assert.equal(overlaid.currentHandoff.freshAgainstSourceCommit, false);
});

test('legacy handoff aliases remain readable when present', () => {
  const root = fixture({
    handoffMutator(handoff) {
      handoff.completed = ['legacy complete'];
      handoff.blockers = ['legacy blocker'];
      handoff.nextActions = ['legacy next'];
    }
  });
  const overlaid = overlayExactCurrentContext({ packet: packet(), rootDir: root });
  assert.deepEqual(overlaid.currentHandoff.completed, ['legacy complete']);
  assert.deepEqual(overlaid.currentHandoff.blockers, ['legacy blocker']);
  assert.deepEqual(overlaid.currentHandoff.nextActions, ['legacy next']);
});

test('terminal name drift fails closed instead of accepting a downgraded top-level objective', () => {
  const root = fixture({ terminalMutator: terminal => { terminal.canonicalName = 'Personal Civilization Engine'; } });
  assert.throws(() => overlayExactCurrentContext({ packet: packet(), rootDir: root }), /terminal-north-star-name-mismatch/);
});
