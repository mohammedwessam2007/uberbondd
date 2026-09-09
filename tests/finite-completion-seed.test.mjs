import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  compileFiniteCompletionDirective,
  compileFiniteCompletionTask,
  runFiniteCompletionSeed
} from '../scripts/uberbond-finite-completion-seed.mjs';
import { parseTaskIssueBody, TASK_LABEL } from '../src/github-relay.mjs';

const BASE = 'a'.repeat(40);
const cleanGraph = () => ({
  ok: true,
  status: 'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED',
  sourceCommit: BASE,
  counts: { requirements: 10, leaves: 12, orphanRequirements: 0, floatingLeaves: 0, dependencyCycles: 0 }
});
const closedTerminal = () => ({
  ok: true,
  status: 'FINITE_REALIZATION_TRIBUNAL_PASSED_WITH_SEPARATE_REALITY_BOUNDARIES',
  sourceCommit: BASE,
  finiteOpenRequirements: [],
  separatedStatus: { FINITE_ENGINEERING_CLOSURE: '100_PERCENT_OF_DECLARED_FINITE_ENGINEERING_SCOPE' }
});
const openTerminal = () => ({
  ok: false,
  status: 'FINITE_CLOSURE_TRIBUNAL_REFUSED',
  sourceCommit: BASE,
  finiteOpenRequirements: ['finite:zeta', 'finite:alpha'],
  reasonCodes: ['finite-behavior-requirements-not-source-closed'],
  separatedStatus: { FINITE_ENGINEERING_CLOSURE: 'INCOMPLETE' }
});

async function fixture({ terminal, graph } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uberbond-finite-seed-'));
  for (const [relative, value] of [
    ['artifacts/sovereign/terminal-realization.json', terminal],
    ['artifacts/sovereign/canonical-execution-leaf-graph.json', graph]
  ]) {
    if (value === undefined) continue;
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(value)}\n`, 'utf8');
  }
  return root;
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); }
  };
}

test('exact canonical finite closure emits no task', () => {
  const directive = compileFiniteCompletionDirective({ baseRevision: BASE, terminalRealization: closedTerminal(), executionGraph: cleanGraph() });
  assert.equal(directive.ok, true);
  assert.equal(directive.status, 'FINITE_ENGINEERING_ALREADY_CLOSED');
  assert.equal(directive.taskRequired, false);
  assert.equal(directive.finiteOpenRequirementCount, 0);
});

test('open finite requirements are selected deterministically and not replaced with general improvement', () => {
  const directive = compileFiniteCompletionDirective({ baseRevision: BASE, terminalRealization: openTerminal(), executionGraph: cleanGraph() });
  assert.equal(directive.status, 'FINITE_REQUIREMENT_TARGET_READY');
  assert.equal(directive.targetRequirementId, 'finite:alpha');
  assert.equal(directive.finiteOpenRequirementCount, 2);
  const task = compileFiniteCompletionTask({ directive, date: new Date('2026-09-09T18:30:00Z') });
  assert.equal(task.ok, true);
  assert.equal(task.taskId, `uberbond_self_maintain_${BASE.slice(0, 24)}`);
  assert.match(task.objective, /close the single canonical finite engineering requirement finite:alpha/i);
  assert.match(task.objective, /not general improvement/i);
  assert.ok(task.constraints.includes('finite-completion-mode'));
  assert.ok(task.constraints.includes('finite-completion-target:finite:alpha'));
  assert.equal(task.consequenceClass, 'LOCAL_PREPARATION');
  assert.equal(task.externalEffectLedger.spendCents, 0);
});

test('stale or missing exact-current terminal truth targets the tribunal rather than inventing a requirement', () => {
  const stale = openTerminal();
  stale.sourceCommit = 'b'.repeat(40);
  const directive = compileFiniteCompletionDirective({ baseRevision: BASE, terminalRealization: stale, executionGraph: cleanGraph() });
  assert.equal(directive.status, 'EXACT_CURRENT_TERMINAL_REPAIR_REQUIRED');
  assert.equal(directive.targetRequirementId, null);
  assert.equal(directive.repairMode, 'TERMINAL_TRUTH_REGENERATION');
  const task = compileFiniteCompletionTask({ directive });
  assert.match(task.objective, /terminal realization tribunal/i);
  assert.match(task.objective, /not general improvement/i);
});

test('closed runtime never creates a GitHub task issue', async () => {
  const root = await fixture({ terminal: closedTerminal(), graph: cleanGraph() });
  let calls = 0;
  try {
    const out = await runFiniteCompletionSeed({
      repoRoot: root,
      env: { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'test-token', GITHUB_SHA: BASE },
      fetchImpl: async () => { calls += 1; throw new Error('network-should-not-run'); }
    });
    assert.equal(out.ok, true);
    assert.equal(out.status, 'FINITE_ENGINEERING_ALREADY_CLOSED');
    assert.equal(out.repositoryIssueEffects, 0);
    assert.equal(calls, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('open runtime creates one bounded canonical relay task and labels it', async () => {
  const root = await fixture({ terminal: openTerminal(), graph: cleanGraph() });
  const calls = [];
  try {
    const out = await runFiniteCompletionSeed({
      repoRoot: root,
      date: new Date('2026-09-09T18:30:00Z'),
      env: { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'test-token', GITHUB_SHA: BASE },
      fetchImpl: async (url, init = {}) => {
        calls.push({ url, init });
        if (String(url).includes('/issues?')) return response([]);
        if (String(url).endsWith('/issues') && init.method === 'POST') return response({ number: 77 });
        return response({}, 404);
      }
    });
    assert.equal(out.ok, true);
    assert.equal(out.status, 'FINITE_COMPLETION_TASK_QUEUED');
    assert.equal(out.issueNumber, 77);
    assert.equal(out.repositoryIssueEffects, 1);
    const create = calls.find(call => call.init?.method === 'POST');
    assert.ok(create);
    const body = JSON.parse(create.init.body);
    assert.deepEqual(body.labels, [TASK_LABEL]);
    const task = parseTaskIssueBody(body.body);
    assert.ok(task.constraints.includes('finite-completion-mode'));
    assert.ok(task.constraints.includes('finite-completion-target:finite:alpha'));
    assert.match(task.objective, /finite:alpha/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
