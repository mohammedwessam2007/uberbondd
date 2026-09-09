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

const cleanGraph = ({ leaves = 1121 } = {}) => ({
  ok: true,
  status: 'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED',
  graphDigest: 'b'.repeat(64),
  counts: {
    requirements: 1038,
    leaves,
    dependencyEdges: 83,
    orphanRequirements: 0,
    floatingLeaves: 0,
    dependencyCycles: 0
  },
  leaves: Array.from({ length: Math.min(leaves, 2) }, (_, index) => ({ leafId: `L${index + 1}` }))
});

const incompleteTerminal = (open = ['finite:a']) => ({
  ok: false,
  status: 'FINITE_CLOSURE_TRIBUNAL_REFUSED',
  finiteOpenRequirements: open,
  separatedStatus: {
    FINITE_ENGINEERING_CLOSURE: 'INCOMPLETE',
    NAMED_RUNTIME_STATUS: 'NOT_MEASURED',
    OBSERVED_AUTONOMY_STATUS: 'NOT_MEASURED',
    EXTERNAL_COMMERCIAL_STATUS: 'NO_REAL_CUSTOMERS_OR_CLEARED_REVENUE',
    PERSONAL_REALITY_STATUS: 'NOT_MEASURED',
    ASI_EVIDENCE_STATUS: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    OPEN_ENDED_FRONTIER_STATUS: 'OPEN'
  }
});

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
    'artifacts/sovereign/terminal-realization.json': incompleteTerminal(['finite:a', 'finite:b']),
    'artifacts/sovereign/canonical-execution-leaf-graph.json': cleanGraph({ leaves: 1121 })
  });
  try {
    const out = await buildAutonomyCommandCenterStatus({ root, now: new Date('2026-09-09T17:00:00Z') });
    assert.equal(out.status, 'SELF_COMPLETION_LOOP_ACTIVE');
    assert.equal(out.graph.leafCount, 1121);
    assert.equal(out.graph.orphanRequirementCount, 0);
    assert.equal(out.graph.floatingLeafCount, 0);
    assert.equal(out.graph.dependencyCycleCount, 0);
    assert.equal(out.terminal.finiteEngineeringClosure, 'INCOMPLETE');
    assert.equal(out.terminal.finiteOpenRequirementCount, 2);
    assert.equal(out.terminal.externalCommercialStatus, 'NO_REAL_CUSTOMERS_OR_CLEARED_REVENUE');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('canonical finite source closure is recognized only from the real tribunal shape and preserves reality boundaries', async () => {
  const root = await fixture({
    'artifacts/sovereign/terminal-realization.json': {
      ok: true,
      status: 'FINITE_REALIZATION_TRIBUNAL_PASSED_WITH_SEPARATE_REALITY_BOUNDARIES',
      finiteOpenRequirements: [],
      separatedStatus: {
        FINITE_ENGINEERING_CLOSURE: '100_PERCENT_OF_DECLARED_FINITE_ENGINEERING_SCOPE',
        NAMED_RUNTIME_STATUS: 'NOT_MEASURED',
        OBSERVED_AUTONOMY_STATUS: 'ELAPSED_EVIDENCE_PENDING',
        EXTERNAL_COMMERCIAL_STATUS: 'NO_REAL_CUSTOMERS_OR_CLEARED_REVENUE',
        PERSONAL_REALITY_STATUS: 'LONGITUDINAL_EVIDENCE_PENDING',
        ASI_EVIDENCE_STATUS: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
        OPEN_ENDED_FRONTIER_STATUS: 'OPEN'
      }
    },
    'artifacts/sovereign/canonical-execution-leaf-graph.json': cleanGraph()
  });
  try {
    const out = await buildAutonomyCommandCenterStatus({ root, now: new Date('2026-09-09T17:00:00Z') });
    assert.equal(out.status, 'FINITE_ENGINEERING_CLOSED__REALITY_PROOF_REMAINS');
    assert.equal(out.terminal.finiteEngineeringClosure, '100_PERCENT_OF_DECLARED_FINITE_ENGINEERING_SCOPE');
    assert.equal(out.terminal.namedRuntimeStatus, 'NOT_MEASURED');
    assert.equal(out.terminal.observedAutonomyStatus, 'ELAPSED_EVIDENCE_PENDING');
    assert.equal(out.terminal.personalRealityStatus, 'LONGITUDINAL_EVIDENCE_PENDING');
    assert.equal(out.terminal.asiEvidenceStatus, 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
    assert.equal(out.externalEffectAuthority, 'NONE');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('dirty nested graph counts cannot be laundered into a clean graph', async () => {
  const root = await fixture({
    'artifacts/sovereign/terminal-realization.json': incompleteTerminal([]),
    'artifacts/sovereign/canonical-execution-leaf-graph.json': {
      ...cleanGraph(),
      counts: { requirements: 1038, leaves: 1121, dependencyEdges: 83, orphanRequirements: 2, floatingLeaves: 3, dependencyCycles: 1 }
    }
  });
  try {
    const out = await buildAutonomyCommandCenterStatus({ root, now: new Date('2026-09-09T17:00:00Z') });
    assert.equal(out.graph.orphanRequirementCount, 2);
    assert.equal(out.graph.floatingLeafCount, 3);
    assert.equal(out.graph.dependencyCycleCount, 1);
    assert.equal(out.status, 'EXACT_CURRENT_TRUTH_OR_RUNTIME_EVIDENCE_REQUIRED');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an incomplete string containing completion-like words never closes the loop', async () => {
  const root = await fixture({
    'artifacts/sovereign/terminal-realization.json': {
      ok: false,
      status: 'FINITE_CLOSURE_TRIBUNAL_REFUSED',
      finiteOpenRequirements: ['finite:a'],
      separatedStatus: { FINITE_ENGINEERING_CLOSURE: 'INCOMPLETE' }
    },
    'artifacts/sovereign/canonical-execution-leaf-graph.json': cleanGraph()
  });
  try {
    const out = await buildAutonomyCommandCenterStatus({ root, now: new Date('2026-09-09T17:00:00Z') });
    assert.equal(out.status, 'FINITE_INTERNAL_WORK_REMAINS');
    assert.notEqual(out.status, 'FINITE_ENGINEERING_CLOSED__REALITY_PROOF_REMAINS');
  } finally { await rm(root, { recursive: true, force: true }); }
});
