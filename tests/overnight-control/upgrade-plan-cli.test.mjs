import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/overnight-upgrade-plan.mjs', ...args], {
      cwd: new URL('../..', import.meta.url),
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('overnight CLI emits a plan-only packet and never needs a provider credential', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'uberbond-overnight-plan-'));
  const input = join(directory, 'capabilities.json');
  await writeFile(input, JSON.stringify({ date: '2026-08-26T03:00:00.000Z', capabilities: [{
    id: 'cli-capability', family: 'distribution', primitive: 'cli-capability',
    label: 'CLI capability', marketAnalogues: ['market analogue'],
    existingModules: [{ path: 'src/outreach-automation.mjs', coverage: 'DIRECT' }],
    reuseState: 'REUSE_READY', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    economics: {
      expectedRevenueCents: 10000, deliveryCostCents: 1000, conversionProbability: 0.2,
      recurringProbability: 0.3, founderMinutes: 10, buildMinutes: 5, runCostCents: 0,
      riskPenaltyCents: 0, evidenceConfidence: 0.8
    }
  }] }), 'utf8');
  try {
    const result = await runCli(['--input', input, '--source-commit', '2a76f3947a700a89d91d31977c4c6f8703b02f6d', '--budget-cents', '1000', '--founder-minutes', '100']);
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.tournament.status, 'TOURNAMENT_COMPLETE');
    assert.equal(output.taskPlan.status, 'PLAN_ONLY_OWNER_REVIEW');
    assert.equal(output.taskPlan.execution.status, 'NOT_RUN');
    assert.equal(output.taskPlan.externalEffectLedger.spendCents, 0);
    assert.equal(output.taskPlan.tasks.length, 6);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('overnight CLI help is local and bounded', async () => {
  const result = await runCli(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /emits JSON to stdout and performs no external effect/);
  assert.equal(result.stderr, '');
});
