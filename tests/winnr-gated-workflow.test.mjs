import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WINNR_PIN_PLACEHOLDER, WINNR_PROBE_WORKFLOW_FILE } from '../scripts/winnr-activation-guard.mjs';

// No YAML parser is a dependency of this repository, so these checks read the template as text. Each assertion is a
// security property of the activation package, not a style check.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATED = path.join(REPO_ROOT, 'winnr/gated/winnr-auth-probe.github-workflow.yml');
const text = fs.readFileSync(GATED, 'utf8');
const lines = text.split('\n');

function jobBlock(name) {
  const start = lines.findIndex(l => l === `  ${name}:`);
  assert.notEqual(start, -1, `job ${name} exists`);
  const next = lines.findIndex((l, i) => i > start && /^  [a-z-]+:\s*$/.test(l));
  return lines.slice(start, next === -1 ? lines.length : next).join('\n');
}

const preflight = jobBlock('preflight');
const probe = jobBlock('probe');

test('the gated template is inactive: it is outside .github/workflows and no active probe workflow exists', () => {
  assert.equal(fs.existsSync(path.join(REPO_ROOT, WINNR_PROBE_WORKFLOW_FILE)), false, 'the activation commit, not this change, creates the active file');
  assert.match(GATED, /winnr\/gated\//);
  assert.equal(text.startsWith('# GATED'), true);
});

test('the trigger is exactly the Winnr fleet branch and exactly the probe workflow path', () => {
  assert.match(text, /on:\n  push:\n    branches:\n      - claude\/winnr-fleet-integration-2026-10-13\n    paths:\n      - '\.github\/workflows\/winnr-auth-probe\.yml'\n/);
  assert.equal((text.match(/branches:/g) || []).length, 1, 'one branch filter');
  assert.equal(text.includes('workflow_dispatch'), false, 'no manual trigger');
  assert.equal(text.includes('pull_request'), false, 'no pull request trigger');
});

test('the top-level token is read-only and no job widens it', () => {
  assert.match(text, /\npermissions:\n  contents: read\n/);
  for (const scope of ['contents: write', 'actions: write', 'id-token: write', 'pull-requests: write', 'packages: write', 'write-all']) {
    assert.equal(text.includes(scope), false, scope);
  }
});

test('concurrency is serial and never cancels a probe mid-run', () => {
  assert.match(text, /concurrency:\n  group: winnr-auth-probe\n  cancel-in-progress: false/);
});

test('the preflight job has no environment, no secret, and no write access', () => {
  assert.equal(preflight.includes('environment:'), false);
  assert.equal(preflight.includes('secrets.'), false);
  assert.equal(preflight.includes('needs:'), false, 'preflight is the first job');
  assert.match(preflight, /winnr-network-preflight\.mjs --require-auth-ports/);
});

test('the probe waits for preflight and refuses a re-run, so one approval cannot re-expose credentials', () => {
  assert.match(probe, /needs: preflight/);
  assert.match(probe, /if: \$\{\{ github\.run_attempt == 1 \}\}/);
  assert.match(probe, /environment: winnr-probe/);
  assert.match(probe, /timeout-minutes: \d+/);
});

test('the reviewed-commit pin is a placeholder that fails closed in the template', () => {
  assert.match(probe, new RegExp(`WINNR_REVIEWED_CODE_SHA: '${WINNR_PIN_PLACEHOLDER}'`));
});

test('the reviewed-commit guard runs before dependencies install and before any secret is referenced', () => {
  const guard = probe.indexOf('scripts/winnr-activation-guard.mjs --pin=');
  const install = probe.indexOf('npm ci --ignore-scripts');
  const firstSecret = probe.indexOf('secrets.');
  assert.ok(guard > 0, 'guard step present');
  assert.ok(install > guard, 'install after guard');
  assert.ok(firstSecret > install, 'first secret reference after install');
});

test('the checkout keeps full history so the pinned commit and HEAD^ are both readable', () => {
  assert.match(probe, /uses: actions\/checkout@v4\n\s+with:\n\s+fetch-depth: 0/);
});

test('every secret reference is a step-level env entry, never a job-level value or a run line', () => {
  const secretLines = lines.filter(l => l.includes('secrets.'));
  assert.equal(secretLines.length, 3, 'token once, inventory twice (export and probe)');
  for (const l of secretLines) {
    assert.match(l, /^ {10}WINNR_(API_TOKEN|EXPECTED_INVENTORY_JSON): \$\{\{ secrets\.WINNR_(API_TOKEN|EXPECTED_INVENTORY_JSON) \}\}$/, l);
  }
  assert.equal(secretLines.filter(l => /WINNR_API_TOKEN/.test(l)).length, 1, 'the token is released to one step only');
});

test('no step prints, echoes or dumps a secret, the environment, or the detail file', () => {
  for (const l of lines) {
    if (/^\s+(run:|-)?\s*(echo|printf|cat|printenv|env$|set -x)\b/.test(l) || /^\s*env\s*$/.test(l)) {
      assert.equal(/WINNR_|TOKEN|INVENTORY|secrets\./.test(l), false, `no secret in print line: ${l.trim()}`);
    }
  }
  assert.equal(text.includes('cat '), false, 'no cat of any file');
  assert.equal(text.includes('set -x'), false, 'no shell tracing');
  assert.equal(text.includes('--exclude-domain'), false, 'the pilot is excluded by the inventory, not a hard-coded domain');
});

test('the probe passes the inventory and the owner reference, and writes the receipt and detail outside the repo', () => {
  assert.match(probe, /node scripts\/winnr-auth-probe-only\.mjs/);
  assert.match(probe, /--owner-ref="github-environment-approval:winnr-probe:run-\$\{\{ github\.run_id \}\}"/);
  assert.match(probe, /--receipt-out="\$RUNNER_TEMP\/public\/winnr-auth-probe-receipt\.json"/);
  assert.match(probe, /--detail-out="\$RUNNER_TEMP\/winnr-auth-probe-detail\.json"/);
  assert.match(probe, /--shred/);
});

test('cleanup runs always, and removes the CSV, the workspace and the detail file', () => {
  const cleanupStart = probe.indexOf('Destroy credential material');
  assert.ok(cleanupStart > 0);
  const cleanup = probe.slice(cleanupStart);
  assert.match(cleanup, /if: always\(\)/);
  assert.match(cleanup, /creds-export\.csv/);
  assert.match(cleanup, /rm -rf "\$RUNNER_TEMP\/winnr-probe" "\$RUNNER_TEMP\/winnr-auth-probe-detail\.json"/);
});

test('only public artifacts are uploaded: the aggregate preflight and the public receipt, each always-run where it matters', () => {
  const uploads = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.includes('uses: actions/upload-artifact@v4'));
  assert.equal(uploads.length, 2);
  assert.equal(text.includes('winnr-auth-probe-detail.json'), true, 'detail appears only in the cleanup step');
  const probeUpload = probe.slice(probe.indexOf('Upload only the public receipt'));
  assert.match(probeUpload, /if: always\(\)/);
  assert.match(probeUpload, /path: \$\{\{ runner\.temp \}\}\/public\/winnr-auth-probe-receipt\.json/);
  assert.equal(probeUpload.includes('detail'), false, 'the probe upload never names the detail file');
  const preflightUpload = preflight.slice(preflight.indexOf('Upload the aggregate preflight result'));
  assert.match(preflightUpload, /path: \$\{\{ runner\.temp \}\}\/winnr-network-preflight\.json/);
});

test('the export step runs read and export only, with the bearer token from the environment', () => {
  assert.match(probe, /--auth-mode=bearer --phases=read,export/);
  assert.equal(probe.includes('--phases=probe'), false);
  assert.equal(probe.includes('--phases=import'), false, 'no encrypted store is written from GitHub');
});

test('npm installs with lifecycle scripts disabled and no network write is requested', () => {
  assert.match(probe, /npm ci --ignore-scripts/);
});
