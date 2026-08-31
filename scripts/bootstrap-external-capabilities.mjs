#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');

const steps = [
  {
    id: 'claude-mem',
    description: 'Install Claude-Mem into the current Claude Code host',
    command: 'npx',
    args: ['claude-mem', 'install'],
    hostMutation: true,
    externalProviderCallExpected: false
  },
  {
    id: 'headroom',
    description: 'Install Headroom CLI/runtime in an isolated uv tool environment',
    command: 'uv',
    args: ['tool', 'install', '--python', '3.13', 'headroom-ai[all]'],
    hostMutation: true,
    externalProviderCallExpected: false
  },
  {
    id: 'omniroute',
    description: 'Install OmniRoute CLI; do not start it or connect providers',
    command: 'npm',
    args: ['install', '-g', 'omniroute'],
    hostMutation: true,
    externalProviderCallExpected: false
  },
  {
    id: 'strix',
    description: 'Install Strix CLI; do not configure an LLM or start a scan',
    command: 'pipx',
    args: ['install', 'strix-agent'],
    hostMutation: true,
    externalProviderCallExpected: false
  },
  {
    id: 'agent-reach-package',
    description: 'Install Agent Reach package from its canonical GitHub archive',
    command: 'pipx',
    args: ['install', 'https://github.com/Panniantong/agent-reach/archive/main.zip'],
    hostMutation: true,
    externalProviderCallExpected: false
  },
  {
    id: 'agent-reach-safe-check',
    description: 'Run Agent Reach default check-only installer; no --system and no private/login channels',
    command: 'agent-reach',
    args: ['install', '--env=auto'],
    hostMutation: false,
    externalProviderCallExpected: false,
    dependsOn: 'agent-reach-package'
  }
];

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
    businessEffectAuthority: 'NONE'
  }, null, 2)}\n`);
  process.exit(0);
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
  externalEffectLedger: {
    customerContacts: 0,
    messages: 0,
    providerModelExecutions: 0,
    purchases: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    moneyMovement: 0,
    customerSystemMutations: 0,
    productionMutations: 0,
    spendCents: 0
  }
};
process.stdout.write(`\n${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
