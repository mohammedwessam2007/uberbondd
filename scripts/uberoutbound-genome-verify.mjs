import { spawnSync } from 'node:child_process';

const commands = [
  ['--check', 'src/uberoutbound-genome.mjs'],
  ['--check', 'src/uberoutbound-policy-registry.mjs'],
  ['--check', 'src/uberoutbound-research-import.mjs'],
  ['--check', 'src/uberoutbound-promotion-gate.mjs'],
  ['--check', 'src/uberreach-control-plane.mjs'],
  ['--check', 'scripts/uberoutbound-genome-doctor.mjs'],
  ['--check', 'scripts/uberoutbound-genome-completion-doctor.mjs'],
  ['--test',
    'tests/uberoutbound-genome.test.mjs',
    'tests/uberoutbound-genotype.test.mjs',
    'tests/uberoutbound-policy-registry.test.mjs',
    'tests/uberoutbound-research-import.test.mjs',
    'tests/uberoutbound-promotion-gate.test.mjs',
    'tests/uberreach-control-plane.test.mjs',
    'tests/uberreach-scale-frontier.test.mjs'
  ],
  ['scripts/uberoutbound-genome-doctor.mjs'],
  ['scripts/uberoutbound-genome-completion-doctor.mjs']
];

const receipts = [];
let failed = false;
for (const args of commands) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, UBEROUTBOUND_VERIFY_MODE: '1' }
  });
  const receipt = {
    command: [process.execPath, ...args].join(' '),
    startedAt,
    status: result.status,
    signal: result.signal || null,
    stdout: String(result.stdout || '').slice(-12000),
    stderr: String(result.stderr || '').slice(-12000)
  };
  receipts.push(receipt);
  if (result.status !== 0) {
    failed = true;
    break;
  }
}

const report = {
  verifier: 'uberoutbound-genome-verify',
  state: failed ? 'FAILED' : 'PASSED',
  commandsAttempted: receipts.length,
  receipts,
  externalEffectAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  truthBoundary: 'PASSED proves only that the declared source syntax, focused tests and genome doctors executed successfully on the host that ran this script against the exact checked-out source. It does not prove live deliverability, legal eligibility for real recipients, causal treatment lift, customers, revenue or 100000/day capacity.'
};

console.log(JSON.stringify(report, null, 2));
if (failed) process.exitCode = 1;
