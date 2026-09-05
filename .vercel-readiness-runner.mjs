#!/usr/bin/env node
// TEMP execution-only runner. Root placement is intentional: canon freshness treats src/scripts/config/migrations as source and this file must not contaminate that source tree.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';

const inputPath = 'config/system-readiness-input.json';
const canonicalHead = '219edaf5038e98ba3f3115b7095004308f2ad056';
const canonicalBranch = 'gpt/frontier-council-max-clean-closure-20260905';
const canonicalEnv = {
  ...process.env,
  UBERBOND_CANONICAL_HEAD: canonicalHead,
  UBERBOND_CANONICAL_BRANCH: canonicalBranch
};
const deterministicEnv = { ...process.env };
for (const key of [
  'AI_GATEWAY_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY'
]) delete deterministicEnv[key];
const zeroNetworkEnv = {
  ...deterministicEnv,
  UBERBOND_POSTGRES_MODE: 'off'
};

function git(args, options = {}) {
  return execFileSync('git', args, { stdio: 'inherit', ...options });
}

function run(command, args, { env = process.env, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env,
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  if (!allowFailure && status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${status}`);
  }
  return {
    status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: `${result.stdout || ''}\n${result.stderr || ''}`
  };
}

function parseNodeTestSummary(output) {
  const clean = String(output).replace(/\u001b\[[0-9;]*m/g, '');
  const read = label => {
    const match = clean.match(new RegExp(`^\\s*(?:ℹ\\s*)?${label}\\s+(\\d+)\\s*$`, 'mi'));
    return match ? Number(match[1]) : null;
  };
  const summary = {
    tests: read('tests'),
    pass: read('pass'),
    fail: read('fail'),
    skipped: read('skipped')
  };
  if (Object.values(summary).some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`unable to parse deterministic summary: ${JSON.stringify(summary)}`);
  }
  if (summary.pass + summary.fail + summary.skipped !== summary.tests) {
    throw new Error(`deterministic summary arithmetic mismatch: ${JSON.stringify(summary)}`);
  }
  return summary;
}

function parseMutationWarSummary(output) {
  const clean = String(output).replace(/\u001b\[[0-9;]*m/g, '');
  const match = clean.match(/mutation-war\s+[—-]\s+(\d+)\s+mutations,\s+(\d+)\s+killed,\s+(\d+)\s+not killed,\s+(\d+)\s+skipped/i);
  if (!match) throw new Error('unable to parse mutation-war summary');
  return {
    mutations: Number(match[1]),
    killed: Number(match[2]),
    notKilled: Number(match[3]),
    skipped: Number(match[4])
  };
}

function runReadiness() {
  run('npm', ['run', 'readiness'], { env: canonicalEnv });
}

function runDeterministic(label) {
  console.log(`READINESS_CLOSURE_DETERMINISTIC_BEGIN ${label}`);
  const result = run('npm', ['run', 'test:deterministic'], {
    env: deterministicEnv,
    allowFailure: true
  });
  const summary = parseNodeTestSummary(result.output);
  console.log(`READINESS_CLOSURE_DETERMINISTIC_SUMMARY ${label} ${JSON.stringify(summary)}`);
  if (result.status !== 0 || summary.fail !== 0) {
    throw new Error(`deterministic ${label} is red: exit=${result.status} summary=${JSON.stringify(summary)}`);
  }
  return summary;
}

function runMutationWar() {
  console.log('READINESS_CLOSURE_MUTATION_WAR_BEGIN');
  const result = run('npm', ['run', 'test:mutation-war'], {
    env: zeroNetworkEnv,
    allowFailure: true
  });
  const summary = parseMutationWarSummary(result.output);
  console.log(`READINESS_CLOSURE_MUTATION_WAR_SUMMARY ${JSON.stringify(summary)}`);
  if (result.status !== 0 || summary.notKilled !== 0 || summary.skipped !== 0 || summary.killed !== summary.mutations) {
    throw new Error(`mutation war is not fully green: exit=${result.status} summary=${JSON.stringify(summary)}`);
  }
  return summary;
}

function runAudit() {
  console.log('READINESS_CLOSURE_DEPENDENCY_AUDIT_BEGIN');
  const result = run('npm', ['audit', '--omit=dev', '--json'], {
    env: zeroNetworkEnv,
    allowFailure: true
  });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`dependency audit did not emit parseable JSON: exit=${result.status}`);
  }
  const vulnerabilities = Number(report?.metadata?.vulnerabilities?.total);
  if (result.status !== 0 || !Number.isSafeInteger(vulnerabilities) || vulnerabilities !== 0) {
    throw new Error(`dependency audit is not green: exit=${result.status} vulnerabilities=${vulnerabilities}`);
  }
  console.log(`READINESS_CLOSURE_DEPENDENCY_AUDIT_PASS ${JSON.stringify({ vulnerabilities })}`);
  return { vulnerabilities };
}

function runHostileGate(label, command, args) {
  console.log(`READINESS_CLOSURE_HOSTILE_GATE_BEGIN ${label}`);
  const result = run(command, args, { env: zeroNetworkEnv, allowFailure: true });
  if (result.status !== 0) {
    throw new Error(`hostile gate ${label} is red: ${command} ${args.join(' ')} exited ${result.status}`);
  }
  console.log(`READINESS_CLOSURE_HOSTILE_GATE_PASS ${label}`);
  return { label, command: `${command} ${args.join(' ')}`, exit: result.status };
}

function commitLocal(paths, message) {
  git(['add', ...paths]);
  const status = spawnSync('git', ['diff', '--cached', '--quiet'], { encoding: 'utf8' });
  if (status.status === 0) return;
  if (status.status !== 1) throw new Error(`git diff --cached --quiet exited ${status.status}`);
  git(['-c', 'user.name=UberBond Canon Runner', '-c', 'user.email=canon@invalid.local', 'commit', '-m', message]);
}

const input = JSON.parse(readFileSync(inputPath, 'utf8'));
input.measurements['check:syntax'] = {
  ...input.measurements['check:syntax'],
  command: 'npm run check:syntax',
  filesParsed: 871,
  ranAt: '2026-09-05T12:00:33Z'
};
input.measurements.reachability = {
  ...input.measurements.reachability,
  command: 'node --test tests/reachability-ratchet.test.mjs',
  srcModules: 342,
  reachableFromProduction: 143,
  reachableFromOperatorScriptsOnly: 62,
  noEntryPointAtAll: 137,
  allClassified: true,
  ranAt: '2026-09-05T12:08:06Z',
  note: 'Frontier Cognitive Fabric makes the previously classified frontier-context-spine operator-reachable. Exact graph: 342 src modules = 143 production + 62 operator-only + 137 gated/unreachable.'
};
writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);

commitLocal([inputPath], 'TEMP local pre-readiness measured inputs');
runReadiness();

const firstDeterministic = runDeterministic('POST_FIRST_REGEN');
const mutationWar = runMutationWar();
const dependencyAudit = runAudit();
const measuredAt = new Date().toISOString();
const measuredInput = JSON.parse(readFileSync(inputPath, 'utf8'));
measuredInput.measurements['test:deterministic'] = {
  ...measuredInput.measurements['test:deterministic'],
  command: 'npm run test:deterministic',
  tests: firstDeterministic.tests,
  pass: firstDeterministic.pass,
  fail: firstDeterministic.fail,
  skipped: firstDeterministic.skipped,
  ranAt: measuredAt,
  note: `Measured on the real Vercel checkout after first canonical readiness regeneration for source candidate ${canonicalHead}; final second regeneration and verification rerun required before certification.`
};
measuredInput.measurements['test:mutation-war'] = {
  ...measuredInput.measurements['test:mutation-war'],
  command: 'npm run test:mutation-war',
  result: `${mutationWar.mutations} mutations, ${mutationWar.killed} killed, ${mutationWar.notKilled} not killed, ${mutationWar.skipped} skipped`,
  note: `Fresh exact-candidate Mutation War on the closure runner; every registered mutation killed and none skipped for source candidate ${canonicalHead}.`,
  ranAt: measuredAt
};
measuredInput.measurements['npm audit'] = {
  ...measuredInput.measurements['npm audit'],
  command: 'npm audit --omit=dev',
  status: 'PASS_EXACT_CANDIDATE',
  vulnerabilities: dependencyAudit.vulnerabilities,
  note: `Fresh production-dependency npm audit on the closure runner for source candidate ${canonicalHead}.`,
  ranAt: measuredAt
};
writeFileSync(inputPath, `${JSON.stringify(measuredInput, null, 2)}\n`);

commitLocal(
  [inputPath, 'docs/CURRENT_SYSTEM_STATE.md', 'artifacts/system-readiness.json'],
  'TEMP local bind exact closure measurements'
);
runReadiness();

const finalDeterministic = runDeterministic('POST_SECOND_REGEN');
for (const key of ['tests', 'pass', 'fail', 'skipped']) {
  if (finalDeterministic[key] !== firstDeterministic[key]) {
    throw new Error(`deterministic result drift after second readiness regeneration: ${key} ${firstDeterministic[key]} -> ${finalDeterministic[key]}`);
  }
}

const hostileGates = [
  runHostileGate(
    'ZERO_NETWORK_COUNCIL_STANDARD_AND_DEGRADED',
    'node',
    ['--test', '--test-concurrency=1', 'tests/avengers-frontier-execution-guard.test.mjs']
  ),
  runHostileGate(
    'FRONTIER_PROVENANCE_AND_RAW_COMPILER_BYPASS',
    'node',
    [
      '--test',
      '--test-concurrency=1',
      'tests/frontier-cognitive-evidence-provenance-bypass.test.mjs',
      'tests/frontier-cognitive-raw-compiler-bypass.test.mjs',
      'tests/frontier-producer-origin.test.mjs'
    ]
  )
];

const files = ['config/system-readiness-input.json', 'docs/CURRENT_SYSTEM_STATE.md', 'artifacts/system-readiness.json'];
for (const path of files) {
  const encoded = Buffer.from(readFileSync(path, 'utf8'), 'utf8').toString('base64');
  const chunkSize = 1800;
  const chunks = Math.ceil(encoded.length / chunkSize);
  console.log(`READINESS_ARTIFACT_BEGIN ${path} ${chunks}`);
  for (let i = 0; i < chunks; i += 1) {
    console.log(`READINESS_ARTIFACT_CHUNK ${path} ${i + 1}/${chunks} ${encoded.slice(i * chunkSize, (i + 1) * chunkSize)}`);
  }
  console.log(`READINESS_ARTIFACT_END ${path}`);
}
console.log(`READINESS_CLOSURE_PHASE_COMPLETE ${JSON.stringify({ canonicalHead, firstDeterministic, mutationWar, dependencyAudit, finalDeterministic, hostileGates })}`);
