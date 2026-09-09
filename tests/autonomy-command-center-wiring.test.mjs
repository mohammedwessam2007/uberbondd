import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wake = readFileSync(new URL('../.github/workflows/uberbond-autonomy-wake.yml', import.meta.url), 'utf8');
const governorWorkflow = readFileSync(new URL('../.github/workflows/uberbond-self-maintainer-merge-governor.yml', import.meta.url), 'utf8');
const governor = readFileSync(new URL('../.github/workflows/runtime/self-maintainer-merge-governor.mjs', import.meta.url), 'utf8');
const commandCenter = readFileSync(new URL('../api/command-center.mjs', import.meta.url), 'utf8');

test('autonomy wake is a bounded pulse rather than schedule truth', () => {
  assert.match(wake, /cron:\s*['"]\*\/15 \* \* \* \*['"]/);
  assert.match(wake, /status == "queued" or \.status == "in_progress"/);
  assert.match(wake, /uberbond-self-maintainer\.yml\/dispatches/);
  assert.match(wake, /-f ref='main'/);
  assert.doesNotMatch(wake, /GITHUB_TOKEN:\s*\$\{\{\s*secrets\./);
  assert.doesNotMatch(wake, /contents:\s*write/);
});

test('merge governor never executes candidate code with write authority', () => {
  assert.match(governorWorkflow, /pull_request_target:/);
  assert.match(governorWorkflow, /startsWith\(github\.event\.pull_request\.head\.ref, 'uberbond\/self-maintain\/'\)/);
  assert.match(governorWorkflow, /ref:\s*\$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(governorWorkflow, /ref:\s*\$\{\{ needs\.admission\.outputs\.head_sha \}\}/);
  assert.match(governorWorkflow, /verify:[\s\S]*?permissions:\s*\n\s*contents:\s*read/);
  assert.match(governorWorkflow, /npm run check:syntax/);
  assert.match(governorWorkflow, /npm run test:deterministic/);
  assert.match(governorWorkflow, /needs\.verify\.result == 'success'/);
  assert.match(governorWorkflow, /UBERBOND_VERIFIED_HEAD_SHA:\s*\$\{\{ needs\.admission\.outputs\.head_sha \}\}/);
});

test('trusted merge governor has no deployment or provider mutation surface', () => {
  assert.match(governor, /deploymentAuthority:\s*'NONE'/);
  assert.match(governor, /businessEffectAuthority:\s*'NONE'/);
  assert.match(governor, /externalEffectAuthority:\s*'NONE'/);
  assert.doesNotMatch(governor, /vercel\.com\/api\/v\d\/deployments/i);
  assert.doesNotMatch(governor, /paypal/i);
  assert.doesNotMatch(governor, /sendMail|gmail|smtp/i);
  assert.match(governor, /candidate-commit-parent-must-equal-admitted-base/);
  assert.match(governor, /existing-test-modification-refused/);
  assert.match(governor, /governor-high-consequence-surface/);
});

test('authenticated command center composes autonomy as evidence only', () => {
  assert.match(commandCenter, /buildAutonomyCommandCenterStatus/);
  assert.match(commandCenter, /status\.autonomy = autonomy/);
  assert.match(commandCenter, /Bootstrap autonomy \/ self-completion/);
  assert.match(commandCenter, /businessEffectAuthority:\s*'NONE'/);
  assert.match(commandCenter, /String\(req\?\.method \|\| ''\)\.toUpperCase\(\) !== 'GET'/);
  assert.match(commandCenter, /command-center-admin-auth-not-configured/);
  assert.match(commandCenter, /equalBearer/);
});
