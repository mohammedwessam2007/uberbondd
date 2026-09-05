import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { runSandboxVerification } from './agent-sandbox-verifier.mjs';

export const LINUX_SELF_MAINTAINER_SANDBOX_POLICY_VERSION = 'linux-self-maintainer-sandbox-1.0.0';

const MAX_BUFFER = 4_000_000;
const SAFE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/;
const liveSandboxes = new WeakMap();
const READONLY_SYSTEM_PREFIXES = Object.freeze(['/usr', '/bin', '/lib', '/lib64', '/opt']);

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: LINUX_SELF_MAINTAINER_SANDBOX_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function runFile(executable, args, { cwd, env, timeoutMs = 30_000, maxBuffer = MAX_BUFFER } = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    execFile(executable, args, { cwd, env, timeout: timeoutMs, maxBuffer, windowsHide: true }, (error, stdout, stderr) => {
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

function safeHostEnv(source = process.env) {
  const env = {};
  for (const name of ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP']) {
    if (source?.[name] != null) env[name] = String(source[name]);
  }
  return env;
}

async function realDirectory(value) {
  try {
    const resolved = await fs.realpath(value);
    const stat = await fs.lstat(resolved);
    return stat.isDirectory() && !stat.isSymbolicLink() ? resolved : null;
  } catch {
    return null;
  }
}

async function resolveRevision(repoRoot, revision, runProcess) {
  if (!SAFE_REVISION.test(text(revision, 160))) return null;
  const result = await runProcess('git', ['rev-parse', '--verify', `${revision}^{commit}`], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH || '' },
    timeoutMs: 30_000
  });
  const sha = text(result.stdout, 160);
  return result.exitCode === 0 && /^[a-f0-9]{40}$/i.test(sha) ? sha : null;
}

function nodeRuntimeBin() {
  const executable = path.resolve(process.execPath);
  const allowed = READONLY_SYSTEM_PREFIXES.some(prefix => executable === prefix || executable.startsWith(`${prefix}/`));
  return allowed ? path.dirname(executable) : null;
}

async function probeKernelIsolation({ unshareExecutable, runProcess, env }) {
  const script = [
    "const fs=require('node:fs');",
    "const v4=fs.existsSync('/proc/net/route')?fs.readFileSync('/proc/net/route','utf8').trim():'';",
    "const v6=fs.existsSync('/proc/net/ipv6_route')?fs.readFileSync('/proc/net/ipv6_route','utf8').trim():'';",
    "if(v4||v6)process.exit(17);"
  ].join('');
  const result = await runProcess(unshareExecutable, ['-Urn', '--', process.execPath, '-e', script], {
    env: safeHostEnv(env),
    timeoutMs: 10_000
  });
  if (result.exitCode !== 0) return fail(['linux-user-network-namespace-unavailable'], 'ISOLATION_UNAVAILABLE', {
    exitCode: result.exitCode,
    stderrSha256: digest(result.stderr)
  });
  return {
    ok: true,
    policyVersion: LINUX_SELF_MAINTAINER_SANDBOX_POLICY_VERSION,
    status: 'KERNEL_ISOLATION_PROBE_PASS',
    evidenceRef: `test:linux-unshare-zero-route:${digest(`${process.platform}:${process.arch}:${process.version}:${process.execPath}`).slice(0, 24)}`
  };
}

const CHROOT_SCRIPT = String.raw`
set -eu
R="$1"; W="$2"; D="$3"; NODEBIN="$4"; EXE="$5"; shift 5
mount --make-rprivate /
mount -t tmpfs tmpfs "$R"
for d in usr bin lib lib64 opt; do
  mkdir -p "$R/$d"
  if [ -e "/$d" ]; then
    mount --rbind "/$d" "$R/$d"
    mount -o remount,ro,bind "$R/$d"
  fi
done
mkdir -p "$R/workspace/node_modules" "$R/tmp" "$R/dev"
mount --bind "$W" "$R/workspace"
mount --bind "$D" "$R/workspace/node_modules"
mount -o remount,ro,bind "$R/workspace/node_modules"
mount -t tmpfs tmpfs "$R/tmp"
for dev in null urandom random; do
  touch "$R/dev/$dev"
  mount --bind "/dev/$dev" "$R/dev/$dev"
done
/usr/sbin/chroot "$R" /usr/bin/env -i \
  PATH="$NODEBIN:/usr/local/bin:/usr/bin:/bin" \
  HOME=/tmp USERPROFILE=/tmp XDG_CONFIG_HOME=/tmp/.config \
  npm_config_audit=false npm_config_fund=false \
  "$EXE" "$@"
`;

/**
 * Create a real local Git sandbox and execute verification commands in a Linux
 * user+mount+network namespace. Candidate code sees only read-only system
 * binaries/libraries, an ephemeral tmpfs, a writable /workspace checkout and a
 * read-only bind of already-installed dependencies. No host home, /proc, /sys,
 * provider credential or network route is exposed to candidate execution.
 */
export function createLinuxSelfMaintainerSandboxHost({
  repoRoot,
  tmpRoot = os.tmpdir(),
  unshareExecutable = '/usr/bin/unshare',
  shellExecutable = '/bin/bash',
  runProcess = runFile,
  env = process.env
} = {}) {
  const records = new Map();
  const runtimeBin = nodeRuntimeBin();

  async function createSandbox({ baseRevision } = {}) {
    if (process.platform !== 'linux') return fail(['linux-host-required'], 'ISOLATION_UNAVAILABLE');
    if (!runtimeBin) return fail(['node-runtime-outside-readonly-system-mounts'], 'ISOLATION_UNAVAILABLE');
    if (typeof runProcess !== 'function') return fail(['process-runner-required']);
    const origin = await realDirectory(repoRoot);
    const dependencies = origin ? await realDirectory(path.join(origin, 'node_modules')) : null;
    if (!origin) return fail(['real-origin-repository-required']);
    if (!dependencies) return fail(['prepared-node-modules-required']);

    const base = await resolveRevision(origin, baseRevision, runProcess);
    if (!base) return fail(['exact-base-revision-required']);
    const probe = await probeKernelIsolation({ unshareExecutable, runProcess, env });
    if (!probe.ok) return probe;

    const workspace = await fs.mkdtemp(path.join(tmpRoot, 'uberbond-self-maint-'));
    const sandboxRoot = path.join(workspace, 'repo');
    const home = path.join(workspace, 'home');
    await fs.mkdir(home, { recursive: true, mode: 0o700 });

    const clone = await runProcess('git', ['clone', '--no-hardlinks', '--quiet', origin, sandboxRoot], {
      env: { PATH: env.PATH || '' },
      timeoutMs: 120_000
    });
    if (clone.exitCode !== 0) {
      await fs.rm(workspace, { recursive: true, force: true });
      return fail(['local-git-clone-failed'], 'SANDBOX_CREATION_FAILED', { stderrSha256: digest(clone.stderr) });
    }
    const checkout = await runProcess('git', ['checkout', '--detach', '--quiet', base], {
      cwd: sandboxRoot,
      env: { PATH: env.PATH || '' },
      timeoutMs: 30_000
    });
    if (checkout.exitCode !== 0) {
      await fs.rm(workspace, { recursive: true, force: true });
      return fail(['exact-base-checkout-failed'], 'SANDBOX_CREATION_FAILED');
    }
    await fs.mkdir(path.join(sandboxRoot, 'node_modules'), { recursive: true });

    const receipt = Object.freeze({
      policyVersion: LINUX_SELF_MAINTAINER_SANDBOX_POLICY_VERSION,
      status: 'VERIFIED_ISOLATED',
      sandboxRoot,
      baseRevision: base,
      filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
      businessCredentialsMounted: false,
      hostHomeMounted: false,
      productionNetworkReachability: false,
      networkEgressMode: 'NONE',
      verificationNetworkEgressMode: 'NONE',
      providerCredentialScope: 'NONE',
      ephemeralHome: home,
      evidenceRefs: Object.freeze([probe.evidenceRef, `test:git-no-hardlinks:${base}`, 'audit:chroot-readonly-host-zero-network-candidate-execution'])
    });
    const sandbox = Object.freeze({
      ok: true,
      policyVersion: LINUX_SELF_MAINTAINER_SANDBOX_POLICY_VERSION,
      status: 'SANDBOX_READY',
      sandboxRoot,
      baseRevision: base,
      isolationReceipt: receipt,
      businessEffectAuthority: 'NONE'
    });
    const record = Object.freeze({ workspace, sandboxRoot, dependencies, receipt, baseRevision: base, runtimeBin });
    records.set(sandboxRoot, record);
    liveSandboxes.set(sandbox, record);
    return sandbox;
  }

  async function isolatedRun(record, { executable, args, timeoutMs }) {
    const mountRoot = await fs.mkdtemp(path.join(record.workspace, 'rootfs-'));
    const started = Date.now();
    try {
      const command = text(executable, 1000);
      if (!command) return { exitCode: 127, signal: null, timedOut: false, stdout: '', stderr: 'missing executable', durationMs: 0 };
      const result = await runProcess(unshareExecutable, [
        '-Urnm', shellExecutable, '-c', CHROOT_SCRIPT, '_',
        mountRoot, record.sandboxRoot, record.dependencies, record.runtimeBin, command,
        ...(Array.isArray(args) ? args.map(value => String(value)) : [])
      ], {
        env: safeHostEnv(env),
        timeoutMs,
        maxBuffer: MAX_BUFFER
      });
      return { ...result, durationMs: Math.max(0, Date.now() - started) };
    } finally {
      await fs.rm(mountRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function verifySandbox(input = {}) {
    const resolvedRoot = path.resolve(String(input.sandboxRoot || ''));
    const record = records.get(resolvedRoot);
    if (!record) return fail(['process-local-sandbox-origin-required']);
    if (input.isolationReceipt?.sandboxRoot !== record.sandboxRoot) return fail(['sandbox-receipt-origin-mismatch']);
    return runSandboxVerification({
      ...input,
      isolationReceipt: {
        ...input.isolationReceipt,
        status: 'VERIFIED_ISOLATED',
        verificationNetworkEgressMode: 'NONE',
        businessCredentialsMounted: false,
        hostHomeMounted: false
      },
      env: {},
      runCommand: command => isolatedRun(record, command)
    });
  }

  async function destroySandbox({ sandbox } = {}) {
    const record = sandbox && typeof sandbox === 'object' ? liveSandboxes.get(sandbox) : null;
    if (!record) return fail(['process-local-sandbox-origin-required'], 'CLEANUP_BLOCKED');
    records.delete(record.sandboxRoot);
    liveSandboxes.delete(sandbox);
    try {
      await fs.rm(record.workspace, { recursive: true, force: true });
      return {
        ok: true,
        policyVersion: LINUX_SELF_MAINTAINER_SANDBOX_POLICY_VERSION,
        status: 'SANDBOX_DESTROYED',
        receiptRef: `receipt:linux-self-maintainer-sandbox-destroy:${digest(record.workspace).slice(0, 24)}`,
        businessEffectAuthority: 'NONE'
      };
    } catch (error) {
      return fail(['sandbox-destroy-failed'], 'CLEANUP_FAILED', { detail: text(error?.message, 500) });
    }
  }

  return Object.freeze({ createSandbox, verifySandbox, destroySandbox });
}
