import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  evaluateActivation, WINNR_PROBE_WORKFLOW_FILE, WINNR_PROBE_GATED_FILE, WINNR_PIN_PLACEHOLDER
} from '../scripts/winnr-activation-guard.mjs';

const PIN = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const OTHER = 'c'.repeat(40);
const SCRIPT = fileURLToPath(new URL('../scripts/winnr-activation-guard.mjs', import.meta.url));

function good(overrides = {}) {
  return { head: HEAD, parent: PIN, pin: PIN, workflowFile: WINNR_PROBE_WORKFLOW_FILE, changedFilesHeadVsParent: [WINNR_PROBE_WORKFLOW_FILE], codePathsChangedSincePin: [], ...overrides };
}

// ---- pure decision ---------------------------------------------------------------------------

test('the single activation commit on top of the pin, touching only the workflow pair, is allowed', () => {
  const d = evaluateActivation(good());
  assert.equal(d.ok, true);
  assert.deepEqual(d.reasonCodes, []);
});

test('the activation commit may also remove the gated template', () => {
  const d = evaluateActivation(good({ changedFilesHeadVsParent: [WINNR_PROBE_WORKFLOW_FILE, WINNR_PROBE_GATED_FILE] }));
  assert.equal(d.ok, true);
});

test('the placeholder pin fails closed', () => {
  const d = evaluateActivation(good({ pin: WINNR_PIN_PLACEHOLDER, parent: WINNR_PIN_PLACEHOLDER }));
  assert.equal(d.ok, false);
  assert.ok(d.reasonCodes.includes('PIN_NOT_SET'));
});

test('an empty, short, or uppercase pin is refused', () => {
  for (const pin of ['', 'abc123', 'A'.repeat(40), 'g'.repeat(40)]) {
    const d = evaluateActivation(good({ pin, parent: pin }));
    assert.equal(d.ok, false, `pin ${pin}`);
    assert.ok(d.reasonCodes.includes('PIN_NOT_SET'));
  }
});

test('a parent that is not the pin is refused, so a multi-commit push cannot slip through', () => {
  const d = evaluateActivation(good({ parent: OTHER }));
  assert.ok(d.reasonCodes.includes('PARENT_IS_NOT_PIN'));
});

test('a missing parent (root commit or unreadable history) is refused', () => {
  assert.ok(evaluateActivation(good({ parent: null })).reasonCodes.includes('PARENT_IS_NOT_PIN'));
});

test('HEAD equal to the pin is refused: there is no activation commit', () => {
  const d = evaluateActivation(good({ head: PIN }));
  assert.ok(d.reasonCodes.includes('NO_ACTIVATION_COMMIT'));
});

test('a HEAD that is not a commit identifier is refused', () => {
  assert.ok(evaluateActivation(good({ head: '' })).reasonCodes.includes('HEAD_NOT_A_COMMIT'));
  assert.ok(evaluateActivation(good({ head: 'not-a-sha' })).reasonCodes.includes('HEAD_NOT_A_COMMIT'));
});

test('an activation commit that does not touch the workflow file is refused', () => {
  const d = evaluateActivation(good({ changedFilesHeadVsParent: [] }));
  assert.ok(d.reasonCodes.includes('ACTIVATION_COMMIT_MISSING_WORKFLOW'));
});

test('any extra file in the activation commit is refused', () => {
  for (const extra of ['scripts/winnr-auth-probe-only.mjs', 'src/uberwinnr-adapter.mjs', 'package.json', '.github/workflows/winnr-network-preflight.yml']) {
    const d = evaluateActivation(good({ changedFilesHeadVsParent: [WINNR_PROBE_WORKFLOW_FILE, extra] }));
    assert.ok(d.reasonCodes.includes('UNEXPECTED_CHANGED_FILE'), extra);
    assert.equal(d.ok, false);
  }
});

test('code changed between the pin and HEAD is refused even when the parent check passes', () => {
  const d = evaluateActivation(good({ codePathsChangedSincePin: ['scripts/winnr-auth-probe-only.mjs'] }));
  assert.ok(d.reasonCodes.includes('CODE_CHANGED_SINCE_PIN'));
});

test('an unreadable pin in the clone is reported as a change, so the guard refuses', () => {
  const d = evaluateActivation(good({ codePathsChangedSincePin: ['PIN_NOT_IN_CLONE'] }));
  assert.equal(d.ok, false);
});

test('every refusal is reported together, not only the first', () => {
  const d = evaluateActivation({ head: HEAD, parent: OTHER, pin: PIN, changedFilesHeadVsParent: ['src/x.mjs'], codePathsChangedSincePin: ['scripts/y.mjs'] });
  for (const code of ['PARENT_IS_NOT_PIN', 'ACTIVATION_COMMIT_MISSING_WORKFLOW', 'UNEXPECTED_CHANGED_FILE', 'CODE_CHANGED_SINCE_PIN']) {
    assert.ok(d.reasonCodes.includes(code), code);
  }
});

test('the decision carries commit identifiers and counts only, never file names', () => {
  const d = evaluateActivation(good({ changedFilesHeadVsParent: [WINNR_PROBE_WORKFLOW_FILE, 'secret-note.txt'] }));
  const text = JSON.stringify(d);
  assert.equal(text.includes('secret-note'), false);
  assert.equal(d.changedFileCount, 2);
});

// ---- real git history, through the CLI ---------------------------------------------------------

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winnr-activation-guard-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  git('init', '-q');
  const commit = (files, message) => {
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
      git('add', file);
    }
    git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const run = pin => spawnSync(process.execPath, [SCRIPT, `--pin=${pin}`], { cwd: dir, encoding: 'utf8', timeout: 20000 });
  return { dir, commit, run, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('through real git: pin, then one commit that only adds the workflow, is allowed (exit 0)', () => {
  const repo = makeRepo();
  try {
    const pin = repo.commit({ 'scripts/winnr-auth-probe-only.mjs': 'reviewed\n' }, 'reviewed code');
    repo.commit({ [WINNR_PROBE_WORKFLOW_FILE]: 'name: probe\n' }, 'activate probe');
    const r = repo.run(pin);
    assert.equal(r.status, 0, r.stdout);
    assert.equal(JSON.parse(r.stdout).ok, true);
  } finally { repo.cleanup(); }
});

test('through real git: code changed after the pin is refused (exit 3)', () => {
  const repo = makeRepo();
  try {
    const pin = repo.commit({ 'scripts/winnr-auth-probe-only.mjs': 'reviewed\n' }, 'reviewed code');
    repo.commit({ 'scripts/winnr-auth-probe-only.mjs': 'changed\n' }, 'sneaky change');
    repo.commit({ [WINNR_PROBE_WORKFLOW_FILE]: 'name: probe\n' }, 'activate probe');
    const r = repo.run(pin);
    assert.equal(r.status, 3);
    const reasons = JSON.parse(r.stdout).reasonCodes;
    assert.ok(reasons.includes('PARENT_IS_NOT_PIN'));
    assert.ok(reasons.includes('CODE_CHANGED_SINCE_PIN'));
  } finally { repo.cleanup(); }
});

test('through real git: an activation commit that also edits code is refused (exit 3)', () => {
  const repo = makeRepo();
  try {
    const pin = repo.commit({ 'scripts/winnr-auth-probe-only.mjs': 'reviewed\n' }, 'reviewed code');
    repo.commit({ [WINNR_PROBE_WORKFLOW_FILE]: 'name: probe\n', 'scripts/winnr-auth-probe-only.mjs': 'changed\n' }, 'activate and edit');
    const r = repo.run(pin);
    assert.equal(r.status, 3);
    assert.ok(JSON.parse(r.stdout).reasonCodes.includes('UNEXPECTED_CHANGED_FILE'));
  } finally { repo.cleanup(); }
});

test('through real git: the placeholder pin refuses before any history is compared (exit 3)', () => {
  const repo = makeRepo();
  try {
    repo.commit({ 'scripts/winnr-auth-probe-only.mjs': 'reviewed\n' }, 'reviewed code');
    repo.commit({ [WINNR_PROBE_WORKFLOW_FILE]: 'name: probe\n' }, 'activate probe');
    const r = repo.run(WINNR_PIN_PLACEHOLDER);
    assert.equal(r.status, 3);
    assert.ok(JSON.parse(r.stdout).reasonCodes.includes('PIN_NOT_SET'));
    assert.equal(r.stderr, '');
  } finally { repo.cleanup(); }
});

test('through real git: a pin that is not in the clone is refused (exit 3)', () => {
  const repo = makeRepo();
  try {
    repo.commit({ 'scripts/winnr-auth-probe-only.mjs': 'reviewed\n' }, 'reviewed code');
    repo.commit({ [WINNR_PROBE_WORKFLOW_FILE]: 'name: probe\n' }, 'activate probe');
    const r = repo.run(OTHER);
    assert.equal(r.status, 3);
    assert.equal(JSON.parse(r.stdout).ok, false);
  } finally { repo.cleanup(); }
});
