// The V7 gap ledger, and the three sentences it exists to enforce:
// "A label never closes a gap. A stale artifact never closes a gap. A
// self-authored claim never closes an external gap."
//
// Every test here is about one of those. A status that can be written rather
// than measured, an external claim with no named unblock condition, and a check
// that fails silently are the three ways a ledger like this becomes decoration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateGap,
  validateGapRow,
  summarizeGaps,
  GAP_STATUSES,
  EXTERNAL_CLASSES
} from '../src/v7-gap-ledger.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const CONTEXT = { root, sourceSha: 'a'.repeat(40), generatedAt: '2026-09-17T12:00:00.000Z' };

const gap = (overrides = {}) => ({
  id: 'G1', title: 't', family: 'SOFTWARE', statement: 's', whyItMatters: 'w',
  implementationPath: 'p', unblockCondition: null, nextExperiment: null,
  externalEvidenceRequired: null, authorityRequired: null,
  check: () => ({ status: 'CLOSED' }),
  ...overrides
});

test('a status comes from the check, and a written one is ignored', () => {
  // The whole contract. A gap definition claiming CLOSED while its check says
  // OPEN must report OPEN.
  const row = evaluateGap(gap({ status: 'CLOSED', check: () => ({ status: 'OPEN' }) }), CONTEXT);
  assert.equal(row.status, 'OPEN');
  assert.equal(row.checkState, 'MEASURED');
});

test('a check that throws is unmeasured, not open and not closed', () => {
  // Collapsing an unmeasurable gap into either answer is how a ledger starts
  // lying: the reader cannot tell "we looked and it is fine" from "we could not
  // look".
  const row = evaluateGap(gap({ check: () => { throw new Error('boom'); } }), CONTEXT);
  assert.equal(row.checkState, 'CHECK_FAILED');
  assert.equal(row.status, 'OPEN', 'an unmeasurable gap must not read as closed');
  assert.ok(row.sourceEvidence[0].includes('boom'));
});

test('a check returning a status nobody defined is refused', () => {
  const row = evaluateGap(gap({ check: () => ({ status: 'PROBABLY_FINE' }) }), CONTEXT);
  assert.equal(row.checkState, 'CHECK_RETURNED_UNKNOWN_STATUS');
  assert.equal(row.status, 'OPEN');
});

test('an external claim without a named unblock condition is refused', () => {
  // "EXTERNAL_BLOCKED, reason: pending" is exactly the label the contract
  // forbids. Claiming reality is in the way requires naming which reality.
  const row = evaluateGap(
    gap({ family: 'EXTERNAL', unblockCondition: null, check: () => ({ status: 'EXTERNAL_BLOCKED' }) }),
    CONTEXT
  );
  assert.equal(row.checkState, 'EXTERNAL_CLAIM_WITHOUT_UNBLOCK_CONDITION');
  assert.equal(row.status, 'OPEN', 'an unearned external claim falls back to open, not to blocked');
});

test('an external claim that names its unblock condition is accepted', () => {
  // Without this the rule above could be satisfied by refusing every external
  // claim, which would make the classification useless.
  const row = evaluateGap(
    gap({ family: 'EXTERNAL', check: () => ({ status: 'EXTERNAL_BLOCKED', unblockCondition: 'the founder supplies the file' }) }),
    CONTEXT
  );
  assert.equal(row.status, 'EXTERNAL_BLOCKED');
  assert.equal(row.checkState, 'MEASURED');
  assert.equal(row.unblockCondition, 'the founder supplies the file');
});

test('every row carries every field the contract lists', () => {
  const row = evaluateGap(gap(), CONTEXT);
  const validity = validateGapRow(row);
  assert.equal(validity.ok, true, `missing: ${validity.missing.join(', ')}`);
  assert.equal(row.lastVerifiedSha, CONTEXT.sourceSha, 'a row records the head it was measured against');
});

test('the check function does not survive into the artifact', () => {
  // A function serializes to nothing, so a ledger carrying one would silently
  // lose the very thing that makes its status trustworthy.
  const row = evaluateGap(gap(), CONTEXT);
  assert.equal(row.check, undefined);
  assert.ok(!JSON.stringify(row).includes('function'));
});

test('source-side completion requires both zero software-open and zero unmeasured', () => {
  const closed = { id: 'a', family: 'SOFTWARE', status: 'CLOSED', checkState: 'MEASURED' };
  const blocked = { id: 'b', family: 'EXTERNAL', status: 'EXTERNAL_BLOCKED', checkState: 'MEASURED' };
  assert.equal(summarizeGaps([closed, blocked]).sourceSideComplete, true,
    'external blockers do not prevent source-side completion');

  const openSoftware = { id: 'c', family: 'SOFTWARE', status: 'OPEN', checkState: 'MEASURED' };
  assert.equal(summarizeGaps([closed, openSoftware]).sourceSideComplete, false);

  // An unmeasured gap must block completion even when nothing is open, or a
  // broken check becomes a way to finish.
  const unmeasured = { id: 'd', family: 'SOFTWARE', status: 'CLOSED', checkState: 'CHECK_FAILED' };
  assert.equal(summarizeGaps([closed, unmeasured]).sourceSideComplete, false,
    'a gap nobody could measure must not count as complete');
});

test('the committed ledger was produced by measurement, not by hand', () => {
  const ledger = JSON.parse(readFileSync(resolve(root, 'artifacts/v7/gap-ledger.json'), 'utf8'));
  assert.ok(ledger.gaps.length > 0);
  assert.equal(ledger.invalidRows.length, 0, `invalid rows: ${JSON.stringify(ledger.invalidRows)}`);
  for (const row of ledger.gaps) {
    assert.ok(GAP_STATUSES.includes(row.status), `${row.id} has status ${row.status}`);
    assert.equal(row.checkState, 'MEASURED', `${row.id} was not measured`);
    assert.equal(row.lastVerifiedSha.length, 40);
    if (EXTERNAL_CLASSES.includes(row.status)) {
      assert.ok(row.unblockCondition, `${row.id} claims ${row.status} and must name what would unblock it`);
    }
  }
});

test('stranded work counts uncommitted source, not the artifacts the run regenerates', () => {
  // A fixed point that had to be broken. Running the generators dirties the
  // artifacts they write, so counting those made the stranded-work gap
  // unclosable by construction: the ledger recording completion would itself be
  // the uncommitted work preventing it. Source is work that exists nowhere else;
  // a regenerated artifact is the act of measuring.
  const ledger = JSON.parse(readFileSync(resolve(root, 'artifacts/v7/gap-ledger.json'), 'utf8'));
  const stranded = ledger.gaps.find(row => row.id === 'V7G005-VERIFIED-WORK-STRANDED-OFF-MAIN');
  assert.ok(stranded, 'the stranded-work gap must exist');
  assert.ok(Object.hasOwn(stranded.measured ?? {}, 'uncommittedSource'),
    'the gap must count source separately from artifacts');
  // A field counting the generator's own side effects changes on every
  // invocation, so the artifact would never settle and a reader could not tell a
  // real change from the act of measuring.
  assert.ok(!Object.hasOwn(stranded.measured, 'uncommittedArtifacts'),
    'the ledger must not record a count of the artifacts its own run dirtied');
  if (stranded.status === 'CLOSED') {
    assert.equal(stranded.measured.uncommittedSource, 0);
  } else {
    assert.ok(stranded.measured.uncommittedSource > 0 || stranded.measured.ahead > 0,
      'an open stranded-work gap must name uncommitted source or unmerged commits, not regenerated artifacts');
  }
});

test('the ledger reports its own incompleteness rather than rounding it away', () => {
  const ledger = JSON.parse(readFileSync(resolve(root, 'artifacts/v7/gap-ledger.json'), 'utf8'));
  const openSoftware = ledger.gaps.filter(row => row.family === 'SOFTWARE' && row.status === 'OPEN');
  assert.equal(ledger.summary.softwareOpen, openSoftware.length);
  assert.equal(ledger.summary.sourceSideComplete, openSoftware.length === 0 && ledger.summary.unmeasured === 0);
});
