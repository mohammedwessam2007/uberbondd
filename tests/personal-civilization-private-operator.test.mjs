import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  defaultPrivateState,
  validatePrivateStatePath,
  loadPrivateState,
  runPrivateCommand
} from '../src/personal-civilization-private-operator.mjs';
import {
  founderPresenceSatisfied,
  PRIVATE_OPERATOR_CONFIRMATION,
  runFounderInteractiveSession
} from '../scripts/personal-civilization-private.mjs';

const OWNER = { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-08T18:00:00.000Z' };
const AT = new Date('2026-09-08T18:00:00.000Z');

function tempPrivate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-private-operator-'));
  return { dir, file: path.join(dir, 'life-state.json'), exportFile: path.join(dir, 'export.json') };
}

function cleanup(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

const tradeoffOptions = () => ([
  { name: 'stay', scores: { meaning: 0.8, financial_cost: 0.2 } },
  { name: 'move', scores: { meaning: 0.3, financial_cost: 0.1 } }
]);

test('founder presence requires an actual TTY pair and the exact confirmation phrase', () => {
  assert.equal(founderPresenceSatisfied({ stdinIsTTY: false, stdoutIsTTY: true, confirmation: PRIVATE_OPERATOR_CONFIRMATION }), false);
  assert.equal(founderPresenceSatisfied({ stdinIsTTY: true, stdoutIsTTY: false, confirmation: PRIVATE_OPERATOR_CONFIRMATION }), false);
  assert.equal(founderPresenceSatisfied({ stdinIsTTY: true, stdoutIsTTY: true, confirmation: 'close enough' }), false);
  assert.equal(founderPresenceSatisfied({ stdinIsTTY: true, stdoutIsTTY: true, confirmation: PRIVATE_OPERATOR_CONFIRMATION }), true);
});

test('the interactive entry point refuses non-TTY invocation before reading private state', async () => {
  const result = await runFounderInteractiveSession({ stdin: { isTTY: false }, stdout: { isTTY: true } });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FOUNDER_PRESENCE_REQUIRED');
  assert.ok(result.reasonCodes.includes('interactive-tty-required'));
});

test('private persistence refuses network and repository destinations', () => {
  const repoRoot = path.resolve(process.cwd());
  const network = validatePrivateStatePath('https://example.com/private.json', { repoRoot });
  assert.equal(network.ok, false);
  assert.ok(network.reasonCodes.includes('private-state-must-be-local-filesystem-only'));

  const repoPath = validatePrivateStatePath(path.join(repoRoot, 'private-life.json'), { repoRoot });
  assert.equal(repoPath.ok, false);
  assert.ok(repoPath.reasonCodes.includes('private-state-may-not-enter-repository'));
});

test('private state cannot be read or mutated without founder authorization', () => {
  const tmp = tempPrivate();
  try {
    const loaded = loadPrivateState({ filePath: tmp.file, authorization: null, repoRoot: process.cwd() });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.status, 'PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED');

    const result = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: process.cwd(),
      authorization: { subject: 'WORKER', grant: 'PRIVATE_LIFE_STATE', issuedAt: AT.toISOString() },
      command: { action: 'capture', utterance: 'private thought' },
      now: AT
    });
    assert.equal(result.ok, false);
    assert.equal(fs.existsSync(tmp.file), false);
  } finally { cleanup(tmp.dir); }
});

test('founder capture persists outside the repository with owner-only file permissions', () => {
  const tmp = tempPrivate();
  try {
    const result = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: process.cwd(),
      authorization: OWNER,
      command: { action: 'capture', utterance: 'I keep thinking about a new path', willEventType: 'CURIOSITY' },
      now: AT
    });
    assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
    assert.equal(result.status, 'CAPTURE_RECORDED');
    assert.equal(result.persisted, true);
    assert.equal(fs.existsSync(tmp.file), true);
    const stat = fs.statSync(tmp.file);
    if (process.platform !== 'win32') assert.equal(stat.mode & 0o077, 0, 'private state must not be group/world readable');
    const disk = JSON.parse(fs.readFileSync(tmp.file, 'utf8'));
    assert.equal(disk.records.length, 1);
    assert.equal(disk.records[0].body, 'I keep thinking about a new path');
    assert.equal(disk.records[0].capture.promotion, 'NONE');
  } finally { cleanup(tmp.dir); }
});

test('a private state file with permissive permissions is refused rather than silently repaired after read', () => {
  if (process.platform === 'win32') return;
  const tmp = tempPrivate();
  try {
    fs.writeFileSync(tmp.file, `${JSON.stringify(defaultPrivateState())}\n`, { mode: 0o644 });
    fs.chmodSync(tmp.file, 0o644);
    const loaded = loadPrivateState({ filePath: tmp.file, authorization: OWNER, repoRoot: process.cwd() });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.status, 'PRIVATE_STATE_READ_REFUSED');
    assert.ok(loaded.reasonCodes.includes('private-state-file-permissions-too-open'));
  } finally { cleanup(tmp.dir); }
});

test('deleting a source record deletes derived model records and prunes their hypothesis metadata', () => {
  const tmp = tempPrivate();
  try {
    const captured = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: process.cwd(),
      authorization: OWNER,
      command: { action: 'capture', utterance: 'I enjoyed teaching today', willEventType: 'RAW_THOUGHT' },
      now: AT
    });
    assert.equal(captured.ok, true);
    const sourceId = captured.record.id;

    const hypothesis = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: process.cwd(),
      authorization: OWNER,
      command: {
        action: 'hypothesis',
        dimension: 'work-energy',
        type: 'PREFERENCE',
        statement: 'Teaching may be energizing in some contexts',
        derivedFrom: [sourceId],
        evidenceStrength: 0.45
      },
      now: new Date('2026-09-08T18:01:00.000Z')
    });
    assert.equal(hypothesis.ok, true, JSON.stringify(hypothesis.reasonCodes));
    assert.equal(hypothesis.state.hypotheses.length, 1);
    assert.equal(hypothesis.state.records.length, 2);

    const deleted = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: process.cwd(),
      authorization: OWNER,
      command: { action: 'delete', ids: [sourceId] },
      now: new Date('2026-09-08T18:02:00.000Z')
    });
    assert.equal(deleted.ok, true);
    assert.equal(deleted.state.records.length, 0);
    assert.equal(deleted.state.hypotheses.length, 0);
    assert.equal(deleted.prunedHypothesisCount, 1);
    assert.ok(deleted.derivedAlsoDeleted.length >= 1);
  } finally { cleanup(tmp.dir); }
});

test('decision command can expose a value boundary but cannot decide or mutate private state', () => {
  const tmp = tempPrivate();
  try {
    const result = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: process.cwd(),
      authorization: OWNER,
      command: {
        action: 'decision',
        packet: { decision: 'stay or move', options: tradeoffOptions() }
      },
      now: AT
    });
    assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
    assert.equal(result.mutation, false);
    assert.equal(result.packet.recommendation, 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED');
    assert.match(result.packet.sovereigntyStatement, /FOUNDER REMAINS THE CHOOSER/);
    assert.equal(fs.existsSync(tmp.file), false, 'a read-only decision aid must not create private persistence by itself');
    assert.equal(result.businessEffectAuthority, 'NONE');
  } finally { cleanup(tmp.dir); }
});

test('export writes the full record set only to an explicit private destination and keeps the repository untouched', () => {
  const tmp = tempPrivate();
  try {
    const captured = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: process.cwd(),
      authorization: OWNER,
      command: { action: 'capture', utterance: 'a private export fixture', willEventType: 'RAW_THOUGHT' },
      now: AT
    });
    assert.equal(captured.ok, true);

    const exported = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: process.cwd(),
      authorization: OWNER,
      command: { action: 'export', destination: tmp.exportFile },
      now: new Date('2026-09-08T18:03:00.000Z')
    });
    assert.equal(exported.ok, true, JSON.stringify(exported.reasonCodes));
    assert.equal(exported.exportWritten, true);
    const body = JSON.parse(fs.readFileSync(tmp.exportFile, 'utf8'));
    assert.equal(body.recordCount, 1);
    assert.equal(body.records[0].id, captured.record.id);
    assert.equal(body.completeness.complete, true);
  } finally { cleanup(tmp.dir); }
});
