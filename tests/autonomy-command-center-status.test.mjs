import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAutonomyCommandCenterStatus } from '../src/autonomy-command-center-status.mjs';

async function fixture(files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uberbond-autonomy-status-'));
  for (const [relative, value] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(value)}\n`, 'utf8');
  }
  return root;
}

test('missing evidence stays missing and never becomes runtime completion', async () => {
  const root = await fixture();
  try {
    const out = await buildAutonomyCommandCenterStatus({ root, now: new Date('2026-09-09T17:00:00Z'), sourceCommit: 'a'.repeat(40) });
    assert.equal(out.status, 'EXACT_CURRENT_TRUTH_OR_RUNTIME_EVIDENCE_REQUIRED');
    assert.equal(out.bootstrapAutonomy.selfCompletionClaim, 'NOT_ESTABLISHED_UNTIL_REPEATED_OBSERVED_CYCLES');
    assert.equal(out.terminal.namedRuntimeStatus, 'NOT_MEASURED');
    assert.equal(out.businessEffectAuthority, 'NONE');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('active maintainer receipt is surfaced as loop active without inflating finite closure', async () => {
  const root = await fixture({
    'artifacts/cognitive/self-maintainer-latest.json': { status: 'WAITING_FOR_WORKER_RESULT', generatedAt: '2026-09-09T16:58:00Z' },
    'artifacts/cognitive/self-maintainer-continuation.json': { status: 'RESUME_EXISTING_ATTEMPT_ONLY' },
    'artifacts/sovereign/terminal-realization.json': { status: 'FINITE_ENGINEERING_INCOMPLETE', separatedStatus: { FINITE_ENGINEERING_CLOSURE: 'INCOMPLETE', NAMED_RUNTIME: 'NOT_MEASURED' } },
    'artifacts/sovereign/canonical-execution-leaf-graph.json': { status: 'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED', leaves: [{ leafId: 'L1' }], orphanRequirementIds: [], floatingLeafIds: [], dependencyCycles: [] }
  });
  try {
    const out = await buildAutonomyCommandCenterStatus({ root, now: new Date('2026-09-09T17:00:00Z') });
    assert.equal(out.status, 'SELF_COMPLETION_LOOP_ACTIVE');
    assert.equal(out.graph.leafCount, 1);
    assert.equal(out.graph.orphanRequirementCount, 0);
    assert.equal(out.terminal.finiteEngineeringClosure, 'INCOMPLETE');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('finite source closure still preserves runtime and ASI boundaries', async () => {
  const root = await fixture({
    'artifacts/sovereign/terminal-realization.json': {
      ok: true,
      status: 'FINITE_CLOSURE_TRIBUNAL_COMPLETE',
      separatedStatus: {
        FINITE_ENGINEERING_CLOSURE: 'CLOSED',
        NAMED_RUNTIME: 'NOT_MEASURED',
        OBSERVED_AUTONOMY: 'ELAPSED_EVIDENCE_PENDING',
        EXTERNAL_COMMERCIAL: 'NO_REAL_CUSTOMERS_OR_CLEARED_REVENUE',
        ASI_EVIDENCE: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'
      }
    },
    'artifacts/sovereign/canonical-execution-leaf-graph.json': { leaves: [], orphanRequirementIds: [], floatingLeafIds: [], dependencyCycles: [] }
  });
  try {
    const out = await buildAutonomyCommandCenterStatus({ root, now: new Date('2026-09-09T17:00:00Z') });
    assert.equal(out.status, 'FINITE_ENGINEERING_CLOSED__REALITY_PROOF_REMAINS');
    assert.equal(out.terminal.namedRuntimeStatus, 'NOT_MEASURED');
    assert.equal(out.terminal.asiEvidenceStatus, 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
    assert.equal(out.externalEffectAuthority, 'NONE');
  } finally { await rm(root, { recursive: true, force: true }); }
});
