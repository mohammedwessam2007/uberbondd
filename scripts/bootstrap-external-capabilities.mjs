#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { BOOTSTRAP_STEPS, auditBootstrapPlan } from '../src/external-capability-bootstrap-plan.mjs';

const APPLY = process.argv.includes('--apply');

const steps = BOOTSTRAP_STEPS;

function runStep(step) {
  const startedAt = new Date().toISOString();
  const run = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: false,
    env: process.env
  });
  return {
    id: step.id,
    command: [step.command, ...step.args],
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: Number.isInteger(run.status) ? run.status : null,
    signal: run.signal || null,
    error: run.error ? String(run.error.message || run.error) : null,
    ok: run.status === 0
  };
}

if (!APPLY) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    status: 'PLAN_ONLY',
    applyFlag: '--apply',
    warning: 'The apply mode mutates the Claude/host tool environment. It installs packages only. It does not configure credentials, connect providers, start OmniRoute, run Strix scans, enable Agent Reach private/login channels, spend money, or contact anyone.',
    steps,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  }, null, 2)}\n`);
  process.exit(0);
}

// Checked before the first spawn, not after. A plan that has grown a
// credential-configuring or service-starting step must not reach the host.
const planAudit = auditBootstrapPlan(steps);
if (!planAudit.ok) {
  process.stdout.write(`${JSON.stringify({ ok: false, status: planAudit.status, findings: planAudit.findings, businessEffectAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } }, null, 2)}\n`);
  process.exit(1);
}

const receipts = [];
const succeeded = new Set();
for (const step of steps) {
  if (step.dependsOn && !succeeded.has(step.dependsOn)) {
    receipts.push({ id: step.id, ok: false, skipped: true, reason: `dependency-failed:${step.dependsOn}` });
    continue;
  }
  const receipt = runStep(step);
  receipts.push(receipt);
  if (receipt.ok) succeeded.add(step.id);
}

const failed = receipts.filter(item => item.ok !== true);
const result = {
  ok: failed.length === 0,
  status: failed.length === 0 ? 'HOST_PACKAGE_INSTALLS_COMPLETED__RUNTIME_CONFIGURATION_UNPROVEN' : 'HOST_PACKAGE_INSTALLS_PARTIAL',
  receipts,
  importantBoundary: [
    'Package installation is not provider configuration.',
    'No LLM/provider credentials were configured by this script.',
    'No OmniRoute service was started.',
    'No Strix target was scanned.',
    'Agent Reach --system and private/login-backed channels were not enabled.',
    'Run npm run capabilities:doctor after installation and leave an exact host receipt.'
  ],
  businessEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
};
process.stdout.write(`\n${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
