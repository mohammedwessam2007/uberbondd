import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAutonomyCommandCenterStatus } from '../src/autonomy-command-center-status.mjs';
import { statusMarkdown } from '../src/autonomy-command-center-control.mjs';
import { compileSovereignReleaseRequest } from '../src/sovereign-release-handoff.mjs';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);
async function fixture(files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uberbond-release-phase-'));
  for (const [relative, value] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(value)}\n`, 'utf8');
  }
  return root;
}
function releaseRequest() {
  return compileSovereignReleaseRequest({
    mergeReceipt: {
      ok: true,
      status: 'SELF_MAINTAINER_PR_MERGED_AFTER_INDEPENDENT_VERIFICATION',
      prNumber: 700,
      headSha: b,
      priorMainSha: a,
      mergeCommitSha: c,
      changeSetId: `agent_changes_${'1'.repeat(24)}`,
      receiptId: `self_maint_${'2'.repeat(24)}`,
      deploymentAuthority: 'NONE',
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE'
    }
  });
}
function closedTerminal(namedRuntimeStatus = 'NOT_MEASURED') {
  return {
    ok: true,
    status: 'FINITE_REALIZATION_TRIBUNAL_PASSED_WITH_SEPARATE_REALITY_BOUNDARIES',
    finiteOpenRequirements: [],
    separatedStatus: {
      FINITE_ENGINEERING_CLOSURE: '100_PERCENT_OF_DECLARED_FINITE_ENGINEERING_SCOPE',
      NAMED_RUNTIME_STATUS: namedRuntimeStatus,
      OBSERVED_AUTONOMY_STATUS: 'ELAPSED_EVIDENCE_PENDING',
      EXTERNAL_COMMERCIAL_STATUS: 'NO_REAL_CUSTOMERS_OR_CLEARED_REVENUE',
      PERSONAL_REALITY_STATUS: 'LONGITUDINAL_EVIDENCE_PENDING',
      ASI_EVIDENCE_STATUS: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
      OPEN_ENDED_FRONTIER_STATUS: 'OPEN'
    }
  };
}
function cleanGraph() {
  return {
    ok: true,
    status: 'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED',
    graphDigest: `sha256:${'b'.repeat(64)}`,
    counts: { leaves: 1121, orphanRequirements: 0, floatingLeaves: 0, dependencyCycles: 0 }
  };
}

test('finite-closed command center surfaces current release request without implying deploy', async () => {
  const root = await fixture({
    'artifacts/sovereign/terminal-realization.json': closedTerminal(),
    'artifacts/sovereign/canonical-execution-leaf-graph.json': cleanGraph(),
    'artifacts/sovereign/sovereign-release-request.json': releaseRequest()
  });
  try {
    const out = await buildAutonomyCommandCenterStatus({ root, now: new Date('2026-09-10T00:00:00Z'), sourceCommit: c });
    assert.equal(out.status, 'FINITE_ENGINEERING_CLOSED__REALITY_PROOF_REMAINS');
    assert.equal(out.bootstrapAutonomy.releasePhase, 'PENDING_OFFLINE_SIGNER');
    assert.equal(out.bootstrapAutonomy.runtimePhase, 'WAITING_FOR_SIGNED_RELEASE_AND_REAL_HOST_REHEARSAL');
    assert.equal(out.sovereignRelease.deploymentAuthority, 'NONE');
    const rendered = statusMarkdown({ status: out, sourceCommit: c });
    assert.match(rendered, /Release handoff:\*\* PENDING_OFFLINE_SIGNER/);
    assert.match(rendered, /Runtime proof phase:\*\* WAITING_FOR_SIGNED_RELEASE_AND_REAL_HOST_REHEARSAL/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('stale release request is visible as stale after main advances', async () => {
  const newer = 'd'.repeat(40);
  const root = await fixture({
    'artifacts/sovereign/terminal-realization.json': closedTerminal(),
    'artifacts/sovereign/canonical-execution-leaf-graph.json': cleanGraph(),
    'artifacts/sovereign/sovereign-release-request.json': releaseRequest()
  });
  try {
    const out = await buildAutonomyCommandCenterStatus({ root, now: new Date('2026-09-10T00:00:00Z'), sourceCommit: newer });
    assert.equal(out.bootstrapAutonomy.releasePhase, 'STALE_FOR_CURRENT_SOURCE');
    assert.equal(out.bootstrapAutonomy.runtimePhase, 'RUNTIME_PROOF_PENDING');
    assert.equal(out.sovereignRelease.deploymentAuthority, 'NONE');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('named runtime verified remains a separate observed boundary', async () => {
  const root = await fixture({
    'artifacts/sovereign/terminal-realization.json': closedTerminal('NAMED_RUNTIME_VERIFIED_WITHIN_REHEARSED_SCOPE'),
    'artifacts/sovereign/canonical-execution-leaf-graph.json': cleanGraph()
  });
  try {
    const out = await buildAutonomyCommandCenterStatus({ root, now: new Date('2026-09-10T00:00:00Z'), sourceCommit: c });
    assert.equal(out.bootstrapAutonomy.releasePhase, 'NOT_REQUIRED_FOR_ALREADY_VERIFIED_RUNTIME_SCOPE');
    assert.equal(out.bootstrapAutonomy.runtimePhase, 'VERIFIED_WITHIN_REHEARSED_SCOPE');
    assert.equal(out.terminal.namedRuntimeStatus, 'NAMED_RUNTIME_VERIFIED_WITHIN_REHEARSED_SCOPE');
  } finally { await rm(root, { recursive: true, force: true }); }
});
