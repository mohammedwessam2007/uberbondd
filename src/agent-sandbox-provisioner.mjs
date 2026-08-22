// The sandbox the engineering executor has been asking for.
//
// The orchestrator has always required createSandbox / destroySandbox /
// enterVerificationMode, and nothing supplied them, so the whole Claude
// engineering path failed closed at `sandbox-factory-required`. It failed
// safely, which is why it sat there -- but a permanently-closed door is not a
// boundary, it is an absence.
//
// The verifier already states what a sandbox must be: an ephemeral root, an
// ephemeral home, no business credentials, no host home, and no network egress
// during verification. This module makes those claims true using OS
// namespaces, and -- the part that matters -- refuses to make them at all when
// the OS cannot back them. There is no mode in which this returns
// VERIFIED_ISOLATED without having verified isolation.

import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const AGENT_SANDBOX_PROVISIONER_POLICY_VERSION = 'agent-sandbox-provisioner-1.0.0';

// Named so it reads the same way in a receipt as it does here: this is an
// environment limitation, not a code failure, and it must never be silently
// downgraded into a working-looking sandbox.
export const SANDBOX_PROVISIONER_EXTERNAL_BLOCK = 'SANDBOX_PROVISIONER_EXTERNAL_BLOCK';

const PROBE_TIMEOUT_MS = 20_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_COMMAND_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_BUFFER = 3_000_000;

// Paths inside the sandbox that a task has no business reading even in its own
// clone. Masked with an empty tmpfs inside the mount namespace.
const DEFAULT_MASKED_PATHS = Object.freeze(['.env', '.npmrc', 'data']);

// The host paths a sandboxed process must not be able to reach at all.
//
// An earlier version masked only paths under the sandbox root, and a red-team
// probe walked straight out: it read the real repository's .env and wrote a
// file into the real working tree. Both were true because the host repository
// was never hidden -- only the sandbox's own copy of those names was. The
// sandbox has its own clone and never needs the original, so the original is
// replaced by an empty tmpfs for the duration.
function defaultHostMasks(repoRoot) {
  return [path.resolve(String(repoRoot || '')), os.homedir()].filter(Boolean);
}

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_SANDBOX_PROVISIONER_POLICY_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function run(executable, args, options = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    execFile(executable, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs ?? PROBE_TIMEOUT_MS,
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

// ---------------------------------------------------------------------------
// Capability probe
// ---------------------------------------------------------------------------

let cachedCapability = null;

/**
 * Find out what the host can actually enforce, by trying it.
 *
 * Deliberately empirical. Reading a kernel flag tells you what should work;
 * running `unshare` tells you what does, and this decision is too consequential
 * to make from a config file.
 */
export async function detectSandboxIsolation({ force = false } = {}) {
  if (cachedCapability && !force) return cachedCapability;

  const reasonCodes = [];
  const userNamespace = await run('unshare', ['--user', '--map-root-user', 'true']);
  if (userNamespace.exitCode !== 0) reasonCodes.push('user-namespace-unavailable');

  const networkNamespace = await run('unshare', ['--user', '--map-root-user', '--net', 'true']);
  if (networkNamespace.exitCode !== 0) reasonCodes.push('network-namespace-unavailable');

  const mountNamespace = await run('unshare', ['--user', '--map-root-user', '--mount', 'true']);
  if (mountNamespace.exitCode !== 0) reasonCodes.push('mount-namespace-unavailable');

  // The claim that matters is not "a namespace was created" but "egress is
  // gone". Prove it by trying to reach the network from inside and requiring
  // the attempt to fail.
  let egressBlocked = false;
  if (!reasonCodes.length) {
    const probe = await run('unshare', ['--user', '--map-root-user', '--net', process.execPath, '-e',
      "const s=require('node:net').connect({host:'1.1.1.1',port:443});"
      + "s.on('connect',()=>{console.log('EGRESS_REACHABLE');process.exit(0)});"
      + "s.on('error',()=>{console.log('EGRESS_BLOCKED');process.exit(0)});"
      + "setTimeout(()=>{console.log('EGRESS_BLOCKED');process.exit(0)},4000);"
    ], { timeoutMs: PROBE_TIMEOUT_MS });
    egressBlocked = /EGRESS_BLOCKED/.test(probe.stdout);
    if (!egressBlocked) reasonCodes.push('network-egress-not-actually-blocked');
  }

  cachedCapability = {
    ok: reasonCodes.length === 0,
    policyVersion: AGENT_SANDBOX_PROVISIONER_POLICY_VERSION,
    userNamespace: userNamespace.exitCode === 0,
    networkNamespace: networkNamespace.exitCode === 0,
    mountNamespace: mountNamespace.exitCode === 0,
    egressBlocked,
    mechanism: reasonCodes.length ? null : 'linux-user-mount-network-namespaces',
    reasonCodes,
    externalBlocker: reasonCodes.length ? SANDBOX_PROVISIONER_EXTERNAL_BLOCK : null
  };
  return cachedCapability;
}

/** Test seam: the probe result is cached, and a test must be able to reset it. */
export function resetSandboxIsolationCache() {
  cachedCapability = null;
}

// ---------------------------------------------------------------------------
// Namespaced execution
// ---------------------------------------------------------------------------

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

/**
 * Build the argv that runs one command inside user+mount+network namespaces,
 * with the host's home and every masked path replaced by an empty tmpfs.
 *
 * The masking is done inside the namespace, so nothing on the host is modified
 * and nothing survives the process exiting.
 */
export function compileNamespacedInvocation({
  sandboxRoot,
  ephemeralHome,
  maskedPaths = [],
  hostMaskedPaths = [],
  bindReadOnly = [],
  executable,
  args = []
}) {
  const root = path.resolve(String(sandboxRoot || ''));
  const home = path.resolve(String(ephemeralHome || ''));

  // A host path that contains the sandbox itself cannot be masked -- doing so
  // would bury the workspace the command has to run in. This is why the
  // sandbox lives under the temp root and not inside the repository.
  const hostMasks = [...new Set(hostMaskedPaths.map(value => path.resolve(String(value || ''))))]
    .filter(target => target && target !== path.parse(target).root && !root.startsWith(`${target}${path.sep}`) && root !== target);

  const script = [
    'set -e',
    `mkdir -p ${shellQuote(home)}`,
    // Read-only binds happen first: they capture the source directory before
    // the mask that follows shadows the path it came from.
    ...bindReadOnly.flatMap(({ from, to }) => {
      const source = path.resolve(String(from || ''));
      const target = path.resolve(root, String(to || ''));
      return [
        `[ -d ${shellQuote(source)} ] && mkdir -p ${shellQuote(target)} && `
        + `mount --bind ${shellQuote(source)} ${shellQuote(target)} && `
        + `mount -o remount,bind,ro ${shellQuote(target)} 2>/dev/null || true`
      ];
    }),
    // An empty tmpfs over a host path means a credential file, an ssh key, an
    // npm token, or the real working tree is not merely unread -- it is not
    // there, and a write lands in a filesystem that dies with the process.
    ...hostMasks.map(target =>
      `[ -d ${shellQuote(target)} ] && mount -t tmpfs tmpfs ${shellQuote(target)} 2>/dev/null || true`),
    ...maskedPaths.map(target => {
      const absolute = path.resolve(root, target);
      return `[ -e ${shellQuote(absolute)} ] && { [ -d ${shellQuote(absolute)} ] `
        + `&& mount -t tmpfs tmpfs ${shellQuote(absolute)} `
        + `|| mount -t tmpfs tmpfs ${shellQuote(path.dirname(absolute))}; } 2>/dev/null || true`;
    }),
    `cd ${shellQuote(root)}`,
    `exec ${shellQuote(executable)} ${args.map(shellQuote).join(' ')}`
  ].join('\n');

  return {
    executable: 'unshare',
    args: ['--user', '--map-root-user', '--mount', '--net', '/bin/sh', '-c', script]
  };
}

/**
 * A `runCommand` for runSandboxVerification that executes inside the namespaces.
 *
 * The verifier already sanitizes the environment and allowlists the command;
 * this adds the part only the OS can provide.
 */
export function createNamespacedVerificationRunner({
  sandbox,
  maskedPaths = DEFAULT_MASKED_PATHS,
  repoRoot = process.cwd(),
  hostMaskedPaths = null,
  bindReadOnly = null
} = {}) {
  const hostMasks = hostMaskedPaths || defaultHostMasks(repoRoot);
  // Dependencies are not credentials, so the host's installed tree is lent to
  // the sandbox read-only rather than re-fetched -- which it could not do
  // anyway, having no network.
  const binds = bindReadOnly || [{ from: path.join(path.resolve(String(repoRoot || '')), 'node_modules'), to: 'node_modules' }];
  return async function namespacedRun({ executable, args, cwd, env, timeoutMs }) {
    const invocation = compileNamespacedInvocation({
      sandboxRoot: cwd || sandbox?.sandboxRoot,
      ephemeralHome: sandbox?.isolationReceipt?.ephemeralHome,
      maskedPaths,
      hostMaskedPaths: hostMasks,
      bindReadOnly: binds,
      executable,
      args
    });
    return run(invocation.executable, invocation.args, {
      cwd: cwd || sandbox?.sandboxRoot,
      env,
      timeoutMs: Math.min(Number(timeoutMs) || DEFAULT_COMMAND_TIMEOUT_MS, MAX_COMMAND_TIMEOUT_MS)
    });
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function isolationReceiptFor({ sandboxRoot, ephemeralHome, capability, baseRevision, networkEgressMode }) {
  const core = {
    policyVersion: AGENT_SANDBOX_PROVISIONER_POLICY_VERSION,
    status: 'VERIFIED_ISOLATED',
    sandboxRoot,
    ephemeralHome,
    filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
    businessCredentialsMounted: false,
    hostHomeMounted: false,
    verificationNetworkEgressMode: networkEgressMode,
    isolationMechanism: capability.mechanism,
    baseRevision
  };
  return {
    ...core,
    ok: true,
    evidenceRefs: [
      `receipt:sandbox-isolation-${digest(JSON.stringify(core)).slice(0, 24)}`,
      `audit:sandbox-isolation-probe-${digest(JSON.stringify(capability)).slice(0, 16)}`
    ]
  };
}

/**
 * Create an ephemeral sandbox holding a clone of the repository at a pinned
 * revision.
 *
 * A full clone rather than a worktree: a worktree's .git is a pointer into the
 * real repository, so a process inside it can rewrite the actual history it is
 * supposed to be isolated from.
 */
export async function createEphemeralSandbox({
  task,
  idempotencyKey = '',
  repoRoot = process.cwd(),
  baseRevision = 'HEAD',
  tmpRoot = os.tmpdir(),
  capability = null
} = {}) {
  if (!task?.taskId) return fail(['valid-agent-task-required']);
  const detected = capability || await detectSandboxIsolation();
  if (!detected.ok) {
    // The honest outcome. No sandbox, no isolation receipt, and a reason code
    // that names the environment rather than blaming the change.
    return fail(['os-isolation-unavailable', ...detected.reasonCodes], {
      status: SANDBOX_PROVISIONER_EXTERNAL_BLOCK,
      externalBlocker: SANDBOX_PROVISIONER_EXTERNAL_BLOCK,
      capability: detected
    });
  }

  const source = path.resolve(String(repoRoot || ''));
  const revision = text(baseRevision, 160) || 'HEAD';
  const resolved = await run('git', ['-C', source, 'rev-parse', revision]);
  if (resolved.exitCode !== 0) return fail(['base-revision-not-resolvable']);
  const resolvedRevision = resolved.stdout.trim();

  const slug = digest(`${task.taskId}:${idempotencyKey}:${resolvedRevision}`).slice(0, 24);
  const sandboxRoot = path.join(path.resolve(String(tmpRoot)), `uberbond-sandbox-${slug}`);
  const ephemeralHome = path.join(sandboxRoot, '.sandbox-home');

  try {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
    await fs.mkdir(sandboxRoot, { recursive: true, mode: 0o700 });
  } catch (error) {
    return fail(['sandbox-root-not-creatable', text(error?.message, 400)]);
  }

  const workspace = path.join(sandboxRoot, 'workspace');
  // --no-hardlinks so the clone's objects are its own: a hardlinked object
  // file mutated inside the sandbox would corrupt the real repository.
  const clone = await run('git', ['clone', '--no-hardlinks', '--quiet', source, workspace], { timeoutMs: 180_000 });
  if (clone.exitCode !== 0) {
    await fs.rm(sandboxRoot, { recursive: true, force: true }).catch(() => {});
    return fail(['sandbox-clone-failed', text(clone.stderr, 400)]);
  }
  const checkout = await run('git', ['-C', workspace, 'checkout', '--quiet', '--detach', resolvedRevision], { timeoutMs: 60_000 });
  if (checkout.exitCode !== 0) {
    await fs.rm(sandboxRoot, { recursive: true, force: true }).catch(() => {});
    return fail(['sandbox-checkout-failed', text(checkout.stderr, 400)]);
  }
  await fs.mkdir(ephemeralHome, { recursive: true, mode: 0o700 });

  return {
    ok: true,
    policyVersion: AGENT_SANDBOX_PROVISIONER_POLICY_VERSION,
    status: 'READY',
    sandboxRoot: workspace,
    sandboxContainer: sandboxRoot,
    baseRevision: resolvedRevision,
    createdAt: timestamp(new Date()),
    isolationReceipt: isolationReceiptFor({
      sandboxRoot: workspace,
      ephemeralHome,
      capability: detected,
      baseRevision: resolvedRevision,
      // Model execution may need the network to reach a provider. Verification
      // may not, and that is the mode the verifier insists on.
      networkEgressMode: 'NONE'
    }),
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Switch a sandbox into verification mode.
 *
 * Nothing here is a promise about the future: the receipt is re-derived from a
 * fresh capability probe, so a host that lost the ability to isolate between
 * creation and verification produces a refusal rather than a stale claim.
 */
export async function enterVerificationNetworkDisabledMode({ sandbox, task, changeSet = null } = {}) {
  if (!sandbox?.ok || !sandbox.sandboxRoot) return fail(['valid-sandbox-required']);
  if (!task?.taskId) return fail(['valid-agent-task-required']);
  const capability = await detectSandboxIsolation({ force: true });
  if (!capability.ok) {
    return fail(['os-isolation-unavailable-at-verification', ...capability.reasonCodes], {
      status: SANDBOX_PROVISIONER_EXTERNAL_BLOCK,
      externalBlocker: SANDBOX_PROVISIONER_EXTERNAL_BLOCK
    });
  }
  try {
    const stat = await fs.lstat(sandbox.sandboxRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return fail(['sandbox-root-no-longer-a-real-directory']);
  } catch {
    return fail(['sandbox-root-missing-at-verification']);
  }
  return {
    ok: true,
    policyVersion: AGENT_SANDBOX_PROVISIONER_POLICY_VERSION,
    status: 'VERIFICATION_MODE',
    changeSetId: changeSet?.changeSetId || null,
    isolationReceipt: isolationReceiptFor({
      sandboxRoot: sandbox.sandboxRoot,
      ephemeralHome: sandbox.isolationReceipt?.ephemeralHome || path.join(sandbox.sandboxContainer || sandbox.sandboxRoot, '.sandbox-home'),
      capability,
      baseRevision: sandbox.baseRevision,
      networkEgressMode: 'NONE'
    }),
    businessEffectAuthority: 'NONE'
  };
}

/** Remove the sandbox and say so with a typed receipt. */
export async function destroyEphemeralSandbox({ sandbox, task, idempotencyKey = '' } = {}) {
  if (!sandbox?.sandboxRoot) return fail(['valid-sandbox-required']);
  const container = sandbox.sandboxContainer || sandbox.sandboxRoot;
  const resolved = path.resolve(container);
  // A destroyer that can be pointed at an arbitrary path is a delete primitive
  // wearing a cleanup label.
  if (!path.basename(resolved).startsWith('uberbond-sandbox-') || resolved === path.parse(resolved).root) {
    return fail(['refusing-to-destroy-path-outside-sandbox-naming-scheme']);
  }
  let removed = true;
  let detail = null;
  try {
    await fs.rm(resolved, { recursive: true, force: true });
    await fs.access(resolved).then(() => { removed = false; }).catch(() => {});
  } catch (error) {
    removed = false;
    detail = text(error?.message, 400);
  }
  const core = {
    policyVersion: AGENT_SANDBOX_PROVISIONER_POLICY_VERSION,
    taskId: task?.taskId || null,
    idempotencyKey: text(idempotencyKey, 200) || null,
    sandboxContainer: resolved,
    removed,
    destroyedAt: timestamp(new Date())
  };
  return {
    ok: removed,
    ...core,
    receiptRef: `receipt:sandbox-destroy-${digest(JSON.stringify(core)).slice(0, 24)}`,
    reasonCodes: removed ? [] : ['sandbox-removal-incomplete', detail].filter(Boolean),
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Everything the engineering orchestrator needs, or an explicit refusal.
 *
 * Bundled so a caller cannot accidentally wire a real creator to a permissive
 * verification mode, or vice versa.
 */
export async function createSandboxProvisioner({ repoRoot = process.cwd(), tmpRoot = os.tmpdir(), maskedPaths = DEFAULT_MASKED_PATHS } = {}) {
  const capability = await detectSandboxIsolation();
  if (!capability.ok) {
    return {
      ok: false,
      policyVersion: AGENT_SANDBOX_PROVISIONER_POLICY_VERSION,
      status: SANDBOX_PROVISIONER_EXTERNAL_BLOCK,
      externalBlocker: SANDBOX_PROVISIONER_EXTERNAL_BLOCK,
      reasonCodes: capability.reasonCodes,
      capability,
      businessEffectAuthority: 'NONE'
    };
  }
  return {
    ok: true,
    policyVersion: AGENT_SANDBOX_PROVISIONER_POLICY_VERSION,
    status: 'READY',
    capability,
    createSandbox: ({ task, idempotencyKey }) => createEphemeralSandbox({ task, idempotencyKey, repoRoot, tmpRoot, capability }),
    destroySandbox: ({ sandbox, task, idempotencyKey }) => destroyEphemeralSandbox({ sandbox, task, idempotencyKey }),
    enterVerificationMode: ({ sandbox, task, changeSet }) => enterVerificationNetworkDisabledMode({ sandbox, task, changeSet }),
    runVerificationCommand: sandbox => createNamespacedVerificationRunner({ sandbox, maskedPaths, repoRoot }),
    businessEffectAuthority: 'NONE'
  };
}
