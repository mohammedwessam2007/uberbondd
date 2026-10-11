#!/usr/bin/env node
// Independent, compute-provider-neutral orchestration around UberBond's existing tests.
// No GitHub runner, production access, credential, deployment, or GitHub status mutation.
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UBERCI_VERSION = 'uberbond.uberci.local-attested.v1';
export const REQUIRED_JOBS = Object.freeze(['deterministic', 'browser', 'postgres']);
const COMMANDS = Object.freeze({
  deterministic: Object.freeze(['npm', 'run', 'check']),
  browser: Object.freeze(['npm', 'run', 'test:browser']),
  postgres: Object.freeze(['npm', 'run', 'test:postgres-real'])
});
const DEFAULT_TIMEOUT_MS = 45 * 60_000;
const MAX_LOG_BYTES = 100_000_000;
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function verifySha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}
export function resolveJobs(requested) {
  const jobs = requested == null ? [...REQUIRED_JOBS] : String(requested).split(',');
  if (!jobs.length || jobs.some(v => !REQUIRED_JOBS.includes(v)) || new Set(jobs).size !== jobs.length) {
    throw new Error('unknown-or-duplicate-job');
  }
  return jobs;
}
export function compileUberCiPlan({ expectedSha, jobs } = {}) {
  if (!verifySha(expectedSha)) throw new Error('full-40-character-source-sha-required');
  const selected = resolveJobs(jobs);
  return {
    version: UBERCI_VERSION,
    expectedSha,
    selectedJobs: selected,
    requiredJobs: [...REQUIRED_JOBS],
    prerequisite: { executable: 'npm', args: ['ci', '--ignore-scripts'], effectAuthority: 'NONE' },
    commands: selected.map(name => ({ name, executable: COMMANDS[name][0], args: COMMANDS[name].slice(1) })),
    completeJobSet: selected.length === REQUIRED_JOBS.length,
    executionStatus: 'NOT_EXECUTED',
    effectAuthority: 'NONE',
    productionWriteAuthority: false,
    githubStatusWriteAuthority: false
  };
}
export function extractTapEvidence(log) {
  const matches = [...String(log).matchAll(/^# (tests|pass|fail|skipped) (\d+)\s*$/gm)];
  const counters = { tests: 0, pass: 0, fail: 0, skipped: 0, footerSegments: 0 };
  for (const match of matches) {
    counters[match[1]] += Number(match[2]);
    if (match[1] === 'tests') counters.footerSegments++;
  }
  counters.nonVacuous = counters.tests > 0 && counters.pass > 0 && counters.fail === 0;
  return counters;
}
async function capture(executable, args, { cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, logFile, spawnCommand = spawn }) {
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  const handle = await fs.open(logFile, 'w', 0o600);
  const hash = createHash('sha256');
  const lines = [];
  let pending = '', bytes = 0, exceeded = false, timedOut = false, spawnError = null;
  const started = new Date().toISOString();
  let code = null, signal = null;
  try {
    const result = await new Promise(resolve => {
      let child;
      try {
        child = spawnCommand(executable, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) { spawnError = String(err); resolve({ code: null, signal: null }); return; }
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
      let writeQueue = Promise.resolve();
      function ingest(chunk) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > MAX_LOG_BYTES) { exceeded = true; child.kill('SIGKILL'); return; }
        hash.update(buffer);
        writeQueue = writeQueue.then(() => handle.write(buffer)).catch(err => { spawnError = String(err); child.kill('SIGKILL'); });
        pending += buffer.toString('utf8');
        const chunks = pending.split(/\r?\n/); pending = chunks.pop() || '';
        for (const line of chunks) if (/^# (?:tests|pass|fail|skipped) \d+$/.test(line.trim())) lines.push(line.trim());
      }
      child.stdout?.on('data', ingest);
      child.stderr?.on('data', ingest);
      child.on('error', err => { spawnError = String(err); });
      child.on('close', (c, sig) => { clearTimeout(timer); writeQueue.finally(() => resolve({ code: c, signal: sig })); });
    });
    code = result.code;
    signal = result.signal;
  } finally { await handle.close(); }
  const evidence = extractTapEvidence(lines.join('\n'));
  const ok = code === 0 && !timedOut && !exceeded && !spawnError;
  return {
    command: [executable, ...args],
    logFile,
    logSha256: hash.digest('hex'),
    bytes,
    exitCode: code,
    signal,
    duration: { started, finished: new Date().toISOString() },
    timedOut,
    exceededLogLimit: exceeded,
    error: spawnError,
    evidence,
    status: !ok ? 'FAILED' : (executable === 'npm' && args[0] === 'ci') ? 'DEPENDENCIES_INSTALLED' : evidence.nonVacuous ? 'PASSED_WITH_TAP_EVIDENCE' : 'INCONCLUSIVE_ZERO_TEST_EVIDENCE'
  };
}
function safeEnv(env = process.env) {
  // No inherited provider secrets, production database URL, API credentials or sender keys.
  const clean = { CI: 'true', NODE_ENV: 'test', UBERBOND_EFFECTS_DISABLED: '1', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', npm_config_ignore_scripts: 'true' };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SYSTEMROOT', 'SystemRoot', 'LANG']) {
    if (env[key]) clean[key] = env[key];
  }
  return clean;
}
function commandOutput(program, args, cwd) {
  return new Promise((resolve, reject) => execFile(program, args, { cwd, timeout: 15000, maxBuffer: 256000 }, (e, stdout) => e ? reject(e) : resolve(String(stdout).trim())));
}
async function atomicJson(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = \`\${file}.partial-\${process.pid}\`;
  await fs.writeFile(tmp, JSON.stringify(content, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, file);
}
export async function executeUberCi({ cwd = SOURCE_ROOT, expectedSha, jobs, outDir, env = process.env, captureCommand = capture, inspectGit = commandOutput } = {}) {
  const plan = compileUberCiPlan({ expectedSha, jobs });
  const root = path.resolve(cwd);
  const observed = await inspectGit('git', ['rev-parse', 'HEAD'], root);
  if (observed !== expectedSha) throw new Error(\`sha-mismatch:\${observed}\`);
  const dirt = await inspectGit('git', ['status', '--porcelain', '--untracked-files=normal'], root);
  if (dirt.trim()) throw new Error('source-worktree-must-be-clean');
  const target = path.resolve(outDir || path.join(root, '.cache/uberci', expectedSha));
  if (target === root || target === path.parse(target).root) throw new Error('unsafe-receipt-root');
  const environment = safeEnv(env);
  const receipt = {
    version: UBERCI_VERSION,
    sourceSha: observed,
    dirty: false,
    requiredJobs: [...REQUIRED_JOBS],
    selectedJobs: plan.selectedJobs,
    compilePlan: plan,
    status: 'IN_PROGRESS',
    claimedTestsRun: false,
    effectAuthority: 'NONE',
    githubStatusWriteAuthority: false,
    deploymentAuthority: false,
    jobs: {},
    dependency: null
  };
  await atomicJson(path.join(target, 'receipt.json'), receipt);
  receipt.dependency = await captureCommand('npm', ['ci', '--ignore-scripts'], { cwd: root, env: environment, logFile: path.join(target, 'dependencies.log') });
  if (receipt.dependency.status !== 'DEPENDENCIES_INSTALLED') {
    receipt.status = 'DEPENDENCY_FAILURE';
  } else {
    for (const name of plan.selectedJobs) {
      const [exe, ...args] = COMMANDS[name];
      receipt.jobs[name] = await captureCommand(exe, args, { cwd: root, env: environment, logFile: path.join(target, \`\${name}.log\`) });
      receipt.claimedTestsRun = true;
      await atomicJson(path.join(target, 'receipt.json'), receipt);
    }
    receipt.status = plan.completeJobSet && REQUIRED_JOBS.every(name => receipt.jobs[name]?.status === 'PASSED_WITH_TAP_EVIDENCE') ? 'INDEPENDENT_TEST_GATES_PASS_SOURCE_BOUND' : 'INCOMPLETE_OR_FAILED_VERIFICATION';
  }
  receipt.completedAt = new Date().toISOString();
  receipt.truthBoundary = 'Independent local source-bound verification only. GitHub Actions, protected checks, production deployment and paid transactions are NOT verified.';
  await atomicJson(path.join(target, 'receipt.json'), receipt);
  return receipt;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const get = prefix => args.find(a => a.startsWith(prefix))?.slice(prefix.length);
  const sha = get('--sha=');
  const jobs = get('--jobs=');
  const outDir = get('--out=');
  const doExecute = args.includes('--execute');
  if (!sha || args.some(a => !a.startsWith('--sha=') && !a.startsWith('--jobs=') && !a.startsWith('--out=') && a !== '--execute')) {
    process.stderr.write('Usage: node scripts/uberci-runner.mjs --sha=<exact-40-hex-commit> [--jobs=deterministic,browser,postgres] [--out=<logdir>] [--execute]\n');
    process.exit(2);
  }
  try {
    if (!doExecute) {
      process.stdout.write(JSON.stringify(compileUberCiPlan({ expectedSha: sha, jobs }), null, 2) + '\n');
    } else {
      const r = await executeUberCi({ expectedSha: sha, jobs, outDir });
      process.stdout.write(JSON.stringify({ status: r.status, sourceSha: r.sourceSha, jobStatuses: Object.fromEntries(Object.entries(r.jobs).map(([key, value]) => [key, value.status])), receipt: path.resolve(outDir || path.join(SOURCE_ROOT, '.cache/uberci', sha, 'receipt.json')) }, null, 2) + '\n');
      process.exitCode = r.status === 'INDEPENDENT_TEST_GATES_PASS_SOURCE_BOUND' ? 0 : 1;
    }
  } catch (e) { process.stderr.write(String(e.message || e) + '\n'); process.exitCode = 2; }
}
