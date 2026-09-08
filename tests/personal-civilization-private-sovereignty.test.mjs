import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runPrivateCommand } from '../src/personal-civilization-private-operator.mjs';
import { decryptJson } from '../src/crypto.mjs';

const OWNER = { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-08T18:10:00.000Z' };
const REPO = path.resolve(process.cwd());
const KEY = '22'.repeat(32);

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-private-sovereignty-'));
  return { dir, file: path.join(dir, 'life-state.json'), exportFile: path.join(dir, 'complete-export.json') };
}
function opened(file) {
  const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
  return decryptJson({ iv: envelope.iv, tag: envelope.tag, data: envelope.data }, KEY);
}

test('a thought cannot become a commitment without new founder-stated words', () => {
  const tmp = fixture();
  try {
    const capture = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: REPO,
      privateKey: KEY,
      authorization: OWNER,
      command: { action: 'capture', utterance: 'I keep thinking about building a clinic', willEventType: 'CURIOSITY' },
      now: new Date('2026-09-08T18:10:00.000Z')
    });
    assert.equal(capture.ok, true);

    const refused = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: REPO,
      privateKey: KEY,
      authorization: OWNER,
      command: { action: 'promote', captureId: capture.record.id, target: 'COMMITMENT', commitmentBody: '' },
      now: new Date('2026-09-08T18:11:00.000Z')
    });
    assert.equal(refused.ok, false);
    assert.ok(refused.reasonCodes.includes('founder-stated-commitment-body-required'));

    const promoted = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: REPO,
      privateKey: KEY,
      authorization: OWNER,
      command: {
        action: 'promote',
        captureId: capture.record.id,
        target: 'COMMITMENT',
        commitmentBody: 'I choose to investigate whether owning a clinic fits the life I want.'
      },
      now: new Date('2026-09-08T18:12:00.000Z')
    });
    assert.equal(promoted.ok, true, JSON.stringify(promoted.reasonCodes));
    assert.equal(promoted.promotion, 'COMMITMENT');
    const source = promoted.state.records.find(row => row.id === capture.record.id);
    assert.equal(source.capture.promotion, 'NONE', 'the original thought remains a thought');
    const commitment = promoted.state.records.find(row => row.id === promoted.record.id);
    assert.equal(commitment.capture.promotion, 'COMMITMENT');
    assert.equal(commitment.derivedFrom[0], capture.record.id);
  } finally { fs.rmSync(tmp.dir, { recursive: true, force: true }); }
});

test('private export contains derived hypothesis state as well as raw records, but only inside ciphertext', () => {
  const tmp = fixture();
  try {
    const sourceText = 'I felt energized after explaining a difficult idea';
    const capture = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: REPO,
      privateKey: KEY,
      authorization: OWNER,
      command: { action: 'capture', utterance: sourceText, willEventType: 'RAW_THOUGHT' },
      now: new Date('2026-09-08T18:10:00.000Z')
    });
    const hypothesis = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: REPO,
      privateKey: KEY,
      authorization: OWNER,
      command: {
        action: 'hypothesis',
        dimension: 'work-energy',
        type: 'PREFERENCE',
        statement: 'Explaining complex ideas may be energizing in some contexts',
        derivedFrom: [capture.record.id],
        evidenceStrength: 0.4
      },
      now: new Date('2026-09-08T18:11:00.000Z')
    });
    assert.equal(hypothesis.ok, true);

    const exported = runPrivateCommand({
      filePath: tmp.file,
      repoRoot: REPO,
      privateKey: KEY,
      authorization: OWNER,
      command: { action: 'export', destination: tmp.exportFile },
      now: new Date('2026-09-08T18:12:00.000Z')
    });
    assert.equal(exported.ok, true, JSON.stringify(exported.reasonCodes));
    assert.equal(exported.hypothesisCount, 1);
    assert.equal(typeof exported.stateDigest, 'string');
    assert.equal(exported.stateDigest.length, 64);
    assert.equal(fs.readFileSync(tmp.exportFile, 'utf8').includes(sourceText), false);
    const body = opened(tmp.exportFile);
    assert.equal(body.purpose, 'PRIVATE_LIFE_EXPORT');
    assert.equal(body.value.records.length, 2, 'source and derived model records must both export');
    assert.equal(body.value.hypotheses.length, 1, 'hypothesis metadata must not be stranded behind the export boundary');
    assert.equal(body.value.completeness.completePrivateOperatorState, true);
  } finally { fs.rmSync(tmp.dir, { recursive: true, force: true }); }
});
