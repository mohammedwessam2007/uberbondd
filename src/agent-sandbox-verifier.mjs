import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { redactSecrets } from './secret-patterns.mjs';

export const AGENT_SANDBOX_VERIFIER_POLICY_VERSION = 'agent-sandbox-verifier-1.0.0';

const MAX_COMMANDS = 12;
const MAX_BUFFER = 3_000_000;
const MAX_EXCERPT = 2_000;
const MAX_TIMEOUT_MS = 15 * 60 * 1000;



function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_SANDBOX_VERIFIER_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function redact(value) {
  return redactSecrets(value);
}

function excerpt(value) {
  return redact(value).slice(0, MAX_EXCERPT);
}

function safeRelative(value) {
  const raw = text(value, 500).replaceAll('\\', '/');
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) return null;
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return null;
  return normalized;
}

function compileCommand(command) {
  const source = text(command, 800);
  const npm = new Map([
    ['npm run check', { executable: 'npm', args: ['run', 'check'] }],
    ['npm run test:deterministic', { executable: 'npm', args: ['run', 'test:deterministic'] }],
    ['npm run test:syntax', { executable: 'npm', args: ['run', 'test:syntax'] }]
  ]);
  if (npm.has(source)) return { ok: true, source, ...npm.get(source) };

  const nodeCheck = source.match(/^node --check ([A-Za-z0-9._/-]+)$/);
  if (nodeCheck) {
    const file = safeRelative(nodeCheck[1]);
    if (!file || !/\.(?:mjs|cjs|js)$/i.test(file)) return { ok: false, reasonCodes: ['node-check-path-invalid'] };
    return { ok: true, source, executable: process.execPath, args: ['--check', file] };
  }

  const nodeTest = source.match(/^node --test ([A-Za-z0-9._/-]+)$/);
  if (nodeTest) {
    const file = safeRelative(nodeTest[1]);
    if (!file || !/\.(?:mjs|cjs|js)$/i.test(file) || !/(^|\/)(?:tests?|test)(\/|$)/i.test(file)) {
      return { ok: false, reasonCodes: ['node-test-path-invalid'] };
    }
    return { ok: true, source, executable: process.execPath, args: ['--test', file] };
  }

  return { ok: false, reasonCodes: ['verification-command-not-allowlisted'] };
}

function isolationReasons(receipt, sandboxRoot) {
  const reasons = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['verifier-isolation-receipt-required'];
  if (String(receipt.status || '').toUpperCase() !== 'VERIFIED_ISOLATED') reasons.push('verifier-os-isolation-not-verified');
  if (text(receipt.sandboxRoot, 1000) !== text(sandboxRoot, 1000)) reasons.push('verifier-sandbox-root-mismatch');
  if (String(receipt.filesystemScope || '').toUpperCase() !== 'EPHEMERAL_SANDBOX_ONLY') reasons.push('verifier-ephemeral-filesystem-required');
  if (receipt.businessCredentialsMounted !== false) reasons.push('verifier-business-credentials-must-not-be-mounted');
  if (receipt.hostHomeMounted !== false) reasons.push('verifier-host-home-must-not-be-mounted');
  if (String(receipt.verificationNetworkEgressMode || '').toUpperCase() !== 'NONE') reasons.push('verifier-network-egress-must-be-none');
  const home = text(receipt.ephemeralHome, 1000);
  if (!home || !path.isAbsolute(home) || path.resolve(home) === path.parse(path.resolve(home)).root) reasons.push('verifier-ephemeral-home-required');
  const refs = Array.isArray(receipt.evidenceRefs) ? receipt.evidenceRefs : [];
  if (!refs.length || refs.some(value => !/^(receipt|test|audit|github|doc|provider):/i.test(String(value || '')))) reasons.push('typed-verifier-isolation-evidence-required');
  return reasons;
}

function sanitizedEnv(source = process.env, isolationReceipt = {}) {
  const env = {};
  for (const name of ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP']) {
    if (source?.[name] != null) env[name] = String(source[name]);
  }
  const home = path.resolve(String(isolationReceipt.ephemeralHome || ''));
  env.HOME = home;
  env.USERPROFILE = home;
  env.XDG_CONFIG_HOME = path.join(home, '.config');
  env.npm_config_audit = 'false';
  env.npm_config_fund = 'false';
  return env;
}

function defaultRun({ executable, args, cwd, env, timeoutMs }) {
  return new Promise(resolve => {
    const started = Date.now();
    execFile(executable, args, {
      cwd,
      env,
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER,
      windowsHide: true
    }, (error, stdout, stderr) => {
      resolve({
        exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
        signal: error?.signal || null,
        timedOut: Boolean(error?.killed && error?.signal),
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        durationMs: Math.max(0, Date.now() - started)
      });
    });
  });
}

export async function compileSandboxVerificationPlan({ sandboxRoot, isolationReceipt, commands = [], timeoutMs = 300_000 } = {}) {
  const reasons = isolationReasons(isolationReceipt, sandboxRoot);
  const timeout = Number(timeoutMs);
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > MAX_TIMEOUT_MS) reasons.push('verification-timeout-invalid');
  if (!Array.isArray(commands) || !commands.length) reasons.push('verification-commands-required');
  if (Array.isArray(commands) && commands.length > MAX_COMMANDS) reasons.push('verification-command-count-limit');

  const compiled = [];
  for (let index = 0; index < (Array.isArray(commands) ? commands.length : 0); index += 1) {
    const item = compileCommand(commands[index]);
    if (!item.ok) reasons.push(...item.reasonCodes.map(code => `${code}:${index}`));
    else compiled.push(item);
  }

  const root = path.resolve(String(sandboxRoot || ''));
  try {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || root === path.parse(root).root) reasons.push('safe-real-sandbox-root-required');
  } catch {
    reasons.push('safe-real-sandbox-root-required');
  }

  if (reasons.length) return fail(reasons);
  return {
    ok: true,
    policyVersion: AGENT_SANDBOX_VERIFIER_POLICY_VERSION,
    status: 'READY',
    sandboxRoot: root,
    timeoutMs: timeout,
    commands: compiled,
    businessEffectAuthority: 'NONE'
  };
}

export async function runSandboxVerification({
  sandboxRoot,
  isolationReceipt,
  commands = [],
  timeoutMs = 300_000,
  env = process.env,
  runCommand = defaultRun,
  date = new Date()
} = {}) {
  if (typeof runCommand !== 'function') return fail(['verification-runner-required']);
  const plan = await compileSandboxVerificationPlan({ sandboxRoot, isolationReceipt, commands, timeoutMs });
  if (!plan.ok) return plan;

  const receipts = [];
  for (const command of plan.commands) {
    let result;
    try {
      result = await runCommand({
        executable: command.executable,
        args: [...command.args],
        cwd: plan.sandboxRoot,
        env: sanitizedEnv(env, isolationReceipt),
        timeoutMs: plan.timeoutMs
      });
    } catch (error) {
      result = { exitCode: 1, signal: null, timedOut: false, stdout: '', stderr: text(error?.message, 4000), durationMs: 0 };
    }
    const stdout = String(result?.stdout || '');
    const stderr = String(result?.stderr || '');
    const exitCode = Number.isSafeInteger(Number(result?.exitCode)) ? Number(result.exitCode) : 1;
    const status = exitCode === 0 && result?.timedOut !== true ? 'PASS' : 'FAIL';
    const core = {
      command: command.source,
      executable: path.basename(command.executable),
      args: command.args,
      status,
      exitCode,
      signal: result?.signal || null,
      timedOut: result?.timedOut === true,
      durationMs: Math.max(0, Number(result?.durationMs || 0)),
      stdoutSha256: digest(stdout),
      stderrSha256: digest(stderr),
      stdoutExcerpt: excerpt(stdout),
      stderrExcerpt: excerpt(stderr)
    };
    receipts.push({
      ...core,
      receiptId: `verify_cmd_${digest(JSON.stringify(core)).slice(0, 24)}`
    });
    if (status !== 'PASS') break;
  }

  const passed = receipts.length === plan.commands.length && receipts.every(item => item.status === 'PASS');
  const receiptCore = {
    policyVersion: AGENT_SANDBOX_VERIFIER_POLICY_VERSION,
    status: passed ? 'PASS' : 'FAIL',
    requested: plan.commands.map(command => command.source),
    executed: receipts,
    verifiedAt: timestamp(date),
    networkEgressMode: 'NONE',
    businessEffectAuthority: 'NONE'
  };
  return {
    ok: passed,
    ...receiptCore,
    verificationReceiptId: `sandbox_verify_${digest(JSON.stringify(receiptCore)).slice(0, 24)}`
  };
}
