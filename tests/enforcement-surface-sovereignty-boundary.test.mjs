import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileAgentCodeChangeSet,
  contentSha256,
  SOVEREIGNTY_PROTECTED_PATHS
} from '../src/agent-code-change-contract.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// The same defect as the outbound send loop, found by looking for its shape
// everywhere rather than only where it had already bitten.
//
// `agent-code-change-contract.mjs` is protected because it holds the rules about
// what may be changed, "including this list". But the rules are enforced
// somewhere else: `agent-code-change-applier.mjs` is what calls
// `validateAgentCodeChangeSet` and then writes files to disk, and
// `agent-code-artifact-store.mjs` is what refuses to persist a change set that
// does not validate. Both were editable by the autonomous path.
//
// Likewise `agent-worker-result-truth.mjs` is protected because it decides what
// counts as finished work -- while both callers that act on its answer,
// `agent-autonomy-pump.mjs` and `ai-employee-relay.mjs`, were not.
//
// The applier bypass is two steps rather than one: a weakened applier only takes
// effect once merged and used by a later run. But the second step is unbounded,
// and self-modification of the enforcement surface is the precise thing the list
// exists to prevent. A false TERMINAL is not an external effect either, but it is
// the claim every downstream receipt is built on.

// Decision functions whose answer, if discarded, changes what the autonomous
// path may do or what may be called finished.
const ENFORCEMENT_DECISIONS = {
  'src/agent-code-change-contract.mjs': ['validateAgentCodeChangeSet', 'compileAgentCodeChangeSet'],
  'src/agent-worker-result-truth.mjs': ['evaluateWorkerResultTruth']
};

const ENFORCEMENT_SURFACE = [
  ['src/agent-code-change-contract.mjs', 'the rules about what may be changed'],
  ['src/agent-code-change-applier.mjs', 'validates a change set, then writes the files'],
  ['src/agent-code-artifact-store.mjs', 'refuses to persist a change set that does not validate'],
  ['src/agent-git-sandbox-collector.mjs', 'compiles a sandbox diff into a change set, refusing protected paths'],
  ['src/agent-worker-result-truth.mjs', 'decides what counts as finished work'],
  ['src/agent-autonomy-pump.mjs', 'acts on the truth decision'],
  ['src/ai-employee-relay.mjs', 'acts on the truth decision']
];

function sourceFiles() {
  const found = [];
  const walk = relative => {
    let entries;
    try { entries = readdirSync(join(repoRoot, relative), { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.mjs')) found.push(child);
    }
  };
  walk('src');
  walk('api');
  return [...found, 'server.mjs', 'worker.mjs'];
}

function importsOf(file) {
  let source = '';
  try { source = readFileSync(join(repoRoot, file), 'utf8'); } catch { return []; }
  const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
  return [...source.matchAll(/import\s*(?:\{([^}]*)\}|[\w*\s,]+?)\s*from\s+['"](\.[^'"]+)['"]/g)]
    .map(match => ({
      target: normalize(join(base, match[2])).replaceAll('\\', '/'),
      names: match[1]
        ? match[1].split(',').map(part => part.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
        : null
    }));
}

test('the whole enforcement surface is inside the boundary, not just the rules', () => {
  for (const [path, role] of ENFORCEMENT_SURFACE) {
    assert.ok(SOVEREIGNTY_PROTECTED_PATHS.includes(path), `${path} must be protected: it ${role}`);
  }
});

test('every caller of an enforcement decision is itself protected', () => {
  const protectedPaths = new Set(SOVEREIGNTY_PROTECTED_PATHS);
  const unprotectedCallers = [];
  for (const file of sourceFiles()) {
    if (protectedPaths.has(file)) continue;
    for (const { target, names } of importsOf(file)) {
      const decisions = ENFORCEMENT_DECISIONS[target];
      if (!decisions) continue;
      const taken = names === null ? decisions : names.filter(name => decisions.includes(name));
      for (const name of taken) unprotectedCallers.push(`${file} -> ${target}:${name}`);
    }
  }
  assert.deepEqual(unprotectedCallers, [],
    'a module outside the boundary asks for an enforcement decision, so it can discard that ' +
    'decision while the deciding module stays untouched. Protect the caller, or stop asking for ' +
    'the decision from there.');
});

// A rule that cannot fire protects nothing. Prove this one can.
test('the enforcement caller rule detects an unprotected consumer', () => {
  const protectedPaths = new Set(SOVEREIGNTY_PROTECTED_PATHS);
  const detect = (file, target, names) => {
    if (protectedPaths.has(file)) return [];
    const decisions = ENFORCEMENT_DECISIONS[target] || [];
    return names === null ? decisions : names.filter(name => decisions.includes(name));
  };
  assert.deepEqual(
    detect('src/some-new-module.mjs', 'src/agent-worker-result-truth.mjs', ['evaluateWorkerResultTruth']),
    ['evaluateWorkerResultTruth']);
  assert.deepEqual(
    detect('src/some-new-module.mjs', 'src/agent-code-change-contract.mjs', ['contentSha256']),
    [], 'a hashing helper is not a decision and must not be caught');
});

function proposeEdit(path, content, rationale) {
  return compileAgentCodeChangeSet({
    taskId: `task_enforcement_sovereignty_${path.replaceAll('/', '_')}`,
    baseRevision: 'current-main',
    consequenceClass: 'LOCAL_PREPARATION',
    summary: 'routine enforcement plumbing maintenance',
    verification: ['npm run test:deterministic'],
    changes: [{
      operation: 'UPDATE',
      path,
      beforeSha256: contentSha256(`current ${path}`),
      content,
      rationale
    }]
  });
}

// The exact edits accepted before the fix, kept as the regression. The rationale
// reads like ordinary engineering on purpose: the refusal must not depend on the
// change looking suspicious.
for (const [label, path, content, rationale] of [
  ['neutering the change-set validator at the applier', 'src/agent-code-change-applier.mjs',
   'export async function preflightAgentCodeChangeSet() { return { ok: true }; }\n',
   'Simplify validation plumbing.'],
  ['neutering the artifact store\'s validation', 'src/agent-code-artifact-store.mjs',
   'function safeArtifact(value) { return value; }\n',
   'Remove a redundant validation pass before persistence.'],
  ['emitting a change set without compiling it', 'src/agent-git-sandbox-collector.mjs',
   'const changeSet = { ok: true, changes: operations };\n',
   'Skip a redundant compile pass when the diff is already normalized.'],
  ['discarding the worker truth decision in the pump', 'src/agent-autonomy-pump.mjs',
   'const truth = { ok: true, reasonCodes: [] };\n',
   'Avoid re-evaluating truth that the relay already checked.'],
  ['discarding the worker truth decision in the relay', 'src/ai-employee-relay.mjs',
   'const base = { ok: true, reasonCodes: [] };\n',
   'Avoid re-evaluating truth that the pump already checked.']
]) {
  test(`${label} is refused specifically for sovereignty`, () => {
    const result = proposeEdit(path, content, rationale);
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('change-0-sovereignty-path'),
      `expected a sovereignty refusal, got ${JSON.stringify(result.reasonCodes)}`);
  });
}

// The two rationales above are each other's excuse -- "the other one already
// checked" -- which is why both call sites had to be closed rather than one.
test('neither truth call site can be excused by the other', () => {
  for (const path of ['src/agent-autonomy-pump.mjs', 'src/ai-employee-relay.mjs']) {
    assert.ok(SOVEREIGNTY_PROTECTED_PATHS.includes(path));
  }
});

test('protecting the enforcement surface is not a freeze on everything near it', () => {
  const result = proposeEdit('src/agent-autonomy-store.mjs', '// ordinary internal maintenance\n',
    'Routine maintenance outside the enforcement surface.');
  assert.equal(result.ok, true, `expected an ordinary edit to be accepted, got ${JSON.stringify(result.reasonCodes)}`);
});
