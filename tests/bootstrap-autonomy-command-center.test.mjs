import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileAgentCodeChangeSet } from '../src/agent-code-change-contract.mjs';
import { compileCommandCenterAutonomyControlPlane } from '../src/command-center-autonomy-control-plane.mjs';

const workflow = readFileSync(new URL('../.github/workflows/uberbond-self-maintainer.yml', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../.github/workflows/runtime/self-maintainer-pr-verifier.mjs', import.meta.url), 'utf8');
const governor = readFileSync(new URL('../.github/workflows/runtime/self-maintainer-merge-governor.mjs', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/command-center.mjs', import.meta.url), 'utf8');
const client = readFileSync(new URL('../public/command-center.js', import.meta.url), 'utf8');

function section(name, next) {
  const start = workflow.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `${name} job must exist`);
  const end = next ? workflow.indexOf(`  ${next}:`, start + 1) : workflow.length;
  return workflow.slice(start, end < 0 ? workflow.length : end);
}

test('self-maintainer wakes without founder prompts but preserves non-repeating continuation', () => {
  assert.match(workflow, /schedule:\s*\n\s*- cron: '7,37 \* \* \* \*'/);
  assert.match(workflow, /self-maintainer-pulse-preflight\.mjs/);
  assert.match(workflow, /self-maintainer-continuation-receipt\.mjs/);
  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*- main/);
});

test('proposal, verification and merge are isolated jobs with narrowing authority', () => {
  const proposer = section('bounded-maintenance', 'independent-verification');
  const verify = section('independent-verification', 'merge-verified-self-maintainer');
  const merge = section('merge-verified-self-maintainer');

  assert.match(proposer, /contents: write/);
  assert.match(proposer, /id-token: write/);
  assert.match(verify, /contents: read/);
  assert.match(verify, /pull-requests: read/);
  assert.doesNotMatch(verify, /contents: write/);
  assert.doesNotMatch(verify, /pull-requests: write/);
  assert.doesNotMatch(verify, /GITHUB_TOKEN:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(merge, /contents: write/);
  assert.match(merge, /pull-requests: write/);
  assert.doesNotMatch(merge, /ref:\s*\$\{\{ needs\.bounded-maintenance\.outputs\.branch \}\}/);
  assert.match(merge, /ref: main/);
  assert.match(merge, /UBERBOND_VERIFICATION_JOB_RESULT:\s*\$\{\{ needs\.independent-verification\.result \}\}/);
});

test('independent verifier and merger both prohibit evaluator rewriting', () => {
  assert.match(verifier, /autonomous-existing-test-mutation-requires-human-review/);
  assert.match(governor, /autonomous-existing-test-mutation-requires-human-review/);
  assert.match(verifier, /compileAgentCodeChangeSet/);
  assert.match(governor, /compileAgentCodeChangeSet/);
});

test('merge governor is exact-head, exact-base, single-parent and local-preparation only', () => {
  assert.match(governor, /protected-job-chain-verification-required/);
  assert.match(governor, /main-advanced-revalidation-required/);
  assert.match(governor, /exactly-one-self-maintainer-commit-required/);
  assert.match(governor, /single-pr-commit-exact-base-parent-required/);
  assert.match(governor, /LOCAL_PREPARATION/);
  assert.match(governor, /businessEffectAuthority: 'NONE'/);
  assert.match(governor, /externalEffectAuthority: 'NONE'/);
});

test('autonomous patch constitution cannot rewrite the autonomy cage', () => {
  for (const path of [
    '.github/workflows/uberbond-self-maintainer.yml',
    '.github/workflows/runtime/self-maintainer-pr-verifier.mjs',
    '.github/workflows/runtime/self-maintainer-merge-governor.mjs',
    'scripts/uberbond-self-maintainer-tick.mjs',
    'src/agent-code-change-contract.mjs'
  ]) {
    const result = compileAgentCodeChangeSet({
      taskId: `attack_${path.replaceAll('/', '_')}`,
      baseRevision: 'a'.repeat(40),
      changes: [{ operation: 'UPDATE', path, beforeSha256: 'b'.repeat(64), content: 'export const bypass = true;\n', rationale: 'Attempt to widen autonomous authority.' }],
      verification: ['npm run check:syntax'],
      summary: 'Adversarial authority-widening probe.'
    });
    assert.equal(result.ok, false, path);
    assert.ok(result.reasonCodes.some(code => /protected-path|sovereignty-path/.test(code)), `${path} must be constitutionally unreachable`);
  }
});

test('command center reports autonomy configuration without becoming an actuator', () => {
  const status = compileCommandCenterAutonomyControlPlane({
    selfMaintainerReceipt: { state: 'AVAILABLE', freshness: 'FRESH', summary: { status: 'VERIFIED_CHANGESET_PROMOTED_TO_REVIEW' } }
  });
  assert.equal(status.status, 'AUTONOMY_WORK_PRODUCT_AWAITING_INDEPENDENT_VERIFICATION');
  assert.equal(status.businessEffectAuthority, 'NONE');
  assert.equal(status.externalEffectAuthority, 'NONE');
  assert.equal(status.founderPrivateAuthority, 'NONE');
  assert.equal(status.sourceConfiguration.scheduledWake, 'TWICE_HOURLY_NON_REPEATING_PULSE');
  assert.match(api, /compileCommandCenterAutonomyControlPlane/);
  assert.match(api, /String\(req\?\.method \|\| ''\)\.toUpperCase\(\) !== 'GET'/);
  assert.doesNotMatch(api, /mergePullRequest|workflow_dispatch|repository_dispatch/);
  assert.match(client, /Autonomy ·/);
  assert.doesNotMatch(client, /fetch\([^\n]+method:\s*['"]POST['"]/);
});
