import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';
import { compileSourceBoundSelfMaintainerProposal } from '../.github/workflows/runtime/self-maintainer-source-bound-compiler.mjs';

const BASE = 'a'.repeat(40);
const SOURCE_PATH = 'src/example-safe-module.mjs';
const SOURCE_CONTENT = 'export const safe = 1;\n';
const BEFORE = contentSha256(SOURCE_CONTENT);

function task(overrides = {}) {
  return {
    taskId: `uberbond_self_maintain_${BASE.slice(0, 24)}`,
    objective: 'Repair one bounded source defect.',
    originAgent: 'uberbond-max-council-controller',
    targetAgent: 'claude-code',
    parentTask: `main:${BASE}`,
    contextRefs: [`github:commit:${BASE}`],
    evidenceRefs: [`github:commit:${BASE}`],
    constraints: [`exact-base-revision:${BASE}`],
    forbiddenActions: ['merge', 'deploy', 'send', 'spend'],
    requiredOutputs: ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision', 'codeChangeSet'],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 12000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

function inventory(paths = [SOURCE_PATH]) {
  const normalized = [...paths].sort();
  const encoded = JSON.stringify(normalized);
  return {
    ok: true,
    status: 'SOURCE_INVENTORY_READY',
    sourceSha: BASE,
    paths: normalized,
    pathCount: normalized.length,
    inventoryDigest: contentSha256(encoded),
    byteLength: Buffer.byteLength(encoded)
  };
}

function context(inv = inventory(), path = SOURCE_PATH, content = SOURCE_CONTENT) {
  return {
    ok: true,
    status: 'EXACT_SOURCE_CONTEXT_READY',
    sourceSha: BASE,
    inventoryDigest: inv.inventoryDigest,
    sourceContextDigest: contentSha256(JSON.stringify({ path, content })),
    files: [{ path, sha256: contentSha256(content), byteLength: Buffer.byteLength(content), content }]
  };
}

function proposal(overrides = {}) {
  return {
    decision: 'PROCEED',
    summary: 'Repair exact source.',
    baseRevision: BASE,
    changes: [{ operation: 'UPDATE', path: SOURCE_PATH, beforeSha256: 'f'.repeat(64), content: 'export const safe = 2;\n', rationale: 'Small causal repair.' }],
    verification: ['npm run check:syntax', 'npm run test:deterministic'],
    evidenceRefs: [`github:commit:${BASE}`],
    cognitivePrioritiesConsidered: ['wallbreaker'],
    ...overrides
  };
}

test('UPDATE preimage identity comes only from exact source context, never the model', () => {
  const inv = inventory();
  const out = compileSourceBoundSelfMaintainerProposal({ task: task(), proposal: proposal(), sourceInventory: inv, sourceContext: context(inv) });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.result.codeChangeSet.changes[0].beforeSha256, BEFORE);
  assert.notEqual(out.result.codeChangeSet.changes[0].beforeSha256, 'f'.repeat(64));
  assert.equal(out.sourceInventoryDigest, inv.inventoryDigest);
});

test('UPDATE or DELETE cannot touch a tracked file that was not actually selected and read', () => {
  const inv = inventory([SOURCE_PATH, 'src/other.mjs']);
  const selected = context(inv, SOURCE_PATH, SOURCE_CONTENT);
  const out = compileSourceBoundSelfMaintainerProposal({
    task: task(),
    sourceInventory: inv,
    sourceContext: selected,
    proposal: proposal({ changes: [{ operation: 'UPDATE', path: 'src/other.mjs', beforeSha256: '', content: 'x\n', rationale: 'not grounded' }] })
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('source-bound-change-0-exact-context-required'));
});

test('CREATE requires exact inventory absence and canonical compiler still supplies derived identity', () => {
  const newPath = 'src/new-safe-module.mjs';
  const inv = inventory([SOURCE_PATH]);
  const created = compileSourceBoundSelfMaintainerProposal({
    task: task(), sourceInventory: inv, sourceContext: context(inv),
    proposal: proposal({ changes: [{ operation: 'CREATE', path: newPath, beforeSha256: 'forged', content: 'export const newSafe = true;\n', rationale: 'Add bounded helper.' }] })
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(created.result.codeChangeSet.changes[0].operation, 'CREATE');
  assert.equal(created.result.codeChangeSet.changes[0].beforeSha256, null);
  assert.match(created.result.codeChangeSet.changes[0].afterSha256, /^[a-f0-9]{64}$/);

  const existing = inventory([SOURCE_PATH, newPath]);
  const refused = compileSourceBoundSelfMaintainerProposal({
    task: task(), sourceInventory: existing, sourceContext: context(existing),
    proposal: proposal({ changes: [{ operation: 'CREATE', path: newPath, beforeSha256: '', content: 'x\n', rationale: 'overwrite attempt' }] })
  });
  assert.equal(refused.ok, false);
  assert.ok(refused.reasonCodes.includes('source-bound-change-0-create-path-already-exists'));
});

test('context and inventory must describe the same exact source universe', () => {
  const inv = inventory();
  const other = inventory([SOURCE_PATH, 'src/other.mjs']);
  const out = compileSourceBoundSelfMaintainerProposal({ task: task(), proposal: proposal(), sourceInventory: other, sourceContext: context(inv) });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('source-context-inventory-digest-mismatch'));
});

test('protected paths remain protected even when they are genuinely present in exact context', () => {
  const protectedPath = '.github/workflows/evil.yml';
  const protectedContent = 'name: existing\n';
  const inv = inventory([protectedPath]);
  const out = compileSourceBoundSelfMaintainerProposal({
    task: task(),
    sourceInventory: inv,
    sourceContext: context(inv, protectedPath, protectedContent),
    proposal: proposal({ changes: [{ operation: 'UPDATE', path: protectedPath, beforeSha256: '', content: 'name: weakened\n', rationale: 'attempt' }] })
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.some(code => code.includes('protected-path')));
});

test('STOP remains a truthful no-op and requires no fabricated source proof', () => {
  const out = compileSourceBoundSelfMaintainerProposal({
    task: task(),
    proposal: proposal({ decision: 'STOP', changes: [], summary: 'No safe worthwhile source repair.' })
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'NO_SAFE_CHANGE_PROPOSED');
  assert.equal(out.result.decision, 'STOP');
  assert.equal('codeChangeSet' in out.result, false);
  assert.deepEqual(out.result.testsActuallyRun, []);
});
