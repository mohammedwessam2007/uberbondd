// The missing half of the autonomous engineering path.
//
// createClaudeEngineeringExecutor has always required createSandbox,
// destroySandbox and enterVerificationMode to be injected, and outside tests
// nothing ever supplied them -- so the whole Claude engineering route was
// unreachable in production and had been for long enough that PR #88 recorded
// it as a blocker rather than a bug.
//
// WHAT THIS HONESTLY PROVIDES
// A real ephemeral filesystem sandbox: a fresh temp directory, a local clone of
// a bounded repository root pinned to a base revision, a child environment with
// every credential-shaped variable removed, bounded time and output, diff
// capture through the existing collector, and destruction that leaves nothing
// behind. The clone is made with --no-hardlinks so the sandbox's .git is a
// copy: writing to it, or corrupting it, cannot reach the real repository.
//
// WHAT IT CANNOT PROVIDE, AND DOES NOT PRETEND TO
// Network isolation. A Node process cannot make the production network
// unreachable to its own children, and claiming otherwise in a receipt would
// be the exact kind of self-attestation this codebase exists to refuse. The
// executor's isolation contract requires productionNetworkReachability: false
// and ANTHROPIC_ONLY egress, and those facts can only come from whatever
// actually enforces them -- a container runtime, a network namespace, a
// firewalled runner -- attested in a file this process reads and does not
// write.
//
// So without that external attestation the provisioner still does all its real
// work and then hands back a receipt marked EXTERNAL_ATTESTATION_REQUIRED,
// which validateIsolation rejects. The engineering path fails closed with
// SANDBOX_PROVISIONER_EXTERNAL_BLOCK rather than running against a sandbox
// nobody has vouched for.

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const CLAUDE_CODE_SANDBOX_PROVISIONER_POLICY_VERSION = 'claude-code-sandbox-provisioner-1.0.0';

export const SANDBOX_EXTERNAL_BLOCK = 'SANDBOX_PROVISIONER_EXTERNAL_BLOCK';

const MAX_BUFFER = 4_000_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const SAFE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/;

// Only these git subcommands are ever run inside a sandbox. There is no shell,
// so there is nothing to chain onto the end of one.
const ALLOWED_GIT_SUBCOMMANDS = new Set(['clone', 'rev-parse', 'status', 'diff', 'show', 'config']);

// Anything matching these is stripped from the child environment. The sandbox
// gets PATH, HOME and a locale, and nothing that could spend money or reach a
// business system.
const CREDENTIAL_KEY = /token|secret|password|passwd|credential|api[_-]?key|private[_-]?key|authorization|session|cookie|dsn|database_url|connection_string|_url$|webhook/i;
const ENV_ALLOWLIST = new Set(['PATH', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'NODE_OPTIONS_DISABLED']);

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: CLAUDE_CODE_SANDBOX_PROVISIONER_POLICY_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

/**
 * The environment a sandboxed child is allowed to see.
 *
 * Exported because the interesting property -- that no credential survives --
 * is worth testing directly rather than only through a spawned process.
 */
export function sandboxChildEnv(env = process.env, { home } = {}) {
  const child = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (!ENV_ALLOWLIST.has(key)) continue;
    if (CREDENTIAL_KEY.test(key)) continue;
    child[key] = String(value ?? '');
  }
  child.PATH = String(env?.PATH || '/usr/bin:/bin');
  if (home) child.HOME = home;
  // Git must not read the operator's global config or credential helpers.
  child.GIT_CONFIG_NOSYSTEM = '1';
  child.GIT_TERMINAL_PROMPT = '0';
  child.GIT_ASKPASS = '';
  return child;
}

function runGitIn({ cwd, args, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, home }) {
  const subcommand = String(args?.[0] || '');
  if (!ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
    return Promise.reject(new Error(`git-subcommand-not-allowed:${subcommand}`));
  }
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER,
      env: sandboxChildEnv(process.env, { home })
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error([stderr, stdout, error.message].filter(Boolean).join('\n').slice(0, 4000)));
        return;
      }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

/**
 * Everything the filesystem side of isolation can honestly assert about itself,
 * plus the network and credential-scope facts taken from an external
 * attestation. Where the attestation is absent, so are those fields -- they are
 * never defaulted to the safe-looking value.
 */
function isolationReceipt({ sandboxRoot, ephemeralHome, attestation, createdAt }) {
  const attested = attestation && typeof attestation === 'object' && !Array.isArray(attestation) ? attestation : null;
  const observed = {
    provisioner: CLAUDE_CODE_SANDBOX_PROVISIONER_POLICY_VERSION,
    sandboxRoot,
    ephemeralHome,
    filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
    businessCredentialsMounted: false,
    hostHomeMounted: false,
    createdAt
  };
  if (!attested) {
    return {
      ...observed,
      status: 'EXTERNAL_ATTESTATION_REQUIRED',
      classification: SANDBOX_EXTERNAL_BLOCK,
      // Deliberately absent rather than false: this process did not verify them
      // and must not be read as having done so.
      productionNetworkReachability: null,
      networkEgressMode: null,
      providerCredentialScope: null,
      evidenceRefs: [],
      unverifiedDimensions: ['productionNetworkReachability', 'networkEgressMode', 'providerCredentialScope']
    };
  }
  return {
    ...observed,
    status: text(attested.status, 80).toUpperCase() || 'UNVERIFIED',
    classification: 'EXTERNALLY_ATTESTED',
    productionNetworkReachability: attested.productionNetworkReachability,
    networkEgressMode: attested.networkEgressMode,
    providerCredentialScope: attested.providerCredentialScope,
    evidenceRefs: Array.isArray(attested.evidenceRefs) ? attested.evidenceRefs.slice(0, 50) : [],
    unverifiedDimensions: []
  };
}

/**
 * @returns a sandbox packet shaped for createClaudeEngineeringExecutor. `ok`
 * is true only when an external attestation was supplied AND the filesystem
 * work succeeded; the executor's own validateIsolation still has the last word.
 */
export async function createEphemeralGitSandbox({
  repoRoot,
  baseRevision = 'HEAD',
  isolationAttestation = null,
  tmpDir = os.tmpdir(),
  date = new Date()
} = {}) {
  const root = text(repoRoot, 1000);
  const revision = text(baseRevision, 160);
  if (!root || !path.isAbsolute(root)) return fail(['absolute-repository-root-required']);
  if (!SAFE_REVISION.test(revision)) return fail(['safe-base-revision-required']);

  try {
    const stat = await fs.stat(path.join(root, '.git'));
    if (!stat.isDirectory() && !stat.isFile()) return fail(['repository-root-must-be-a-git-repository']);
  } catch {
    return fail(['repository-root-must-be-a-git-repository']);
  }

  const workspace = await fs.mkdtemp(path.join(tmpDir, 'uberbond-sandbox-'));
  // Recorded before anything else can fail, so every path that tears down a
  // partially built sandbox is allowed to remove the one it just made.
  provisionedWorkspaces.add(path.resolve(workspace));
  const sandboxRoot = path.join(workspace, 'repo');
  // Outside the git sandbox on purpose: the executor's isolation contract
  // rejects an ephemeral home nested inside the tree the model can edit.
  const ephemeralHome = path.join(workspace, 'home');

  try {
    await fs.mkdir(ephemeralHome, { recursive: true });
    // --no-hardlinks makes the sandbox's object store a copy. Without it the
    // sandbox shares objects with the real repository, and "ephemeral" stops
    // being true the moment anything writes.
    await runGitIn({
      cwd: workspace,
      args: ['clone', '--no-hardlinks', '--quiet', root, sandboxRoot],
      home: ephemeralHome
    });
    await runGitIn({ cwd: sandboxRoot, args: ['config', 'user.email', 'sandbox@invalid'], home: ephemeralHome });
    await runGitIn({ cwd: sandboxRoot, args: ['config', 'user.name', 'uberbond-sandbox'], home: ephemeralHome });
    const resolved = await runGitIn({ cwd: sandboxRoot, args: ['rev-parse', revision], home: ephemeralHome });
    const resolvedRevision = text(resolved.stdout, 160);
    if (!/^[a-f0-9]{40}$/i.test(resolvedRevision)) {
      await destroyEphemeralGitSandbox({ sandbox: { workspace } });
      return fail(['base-revision-could-not-be-resolved']);
    }

    const createdAt = (date instanceof Date ? date : new Date(date || Date.now())).toISOString();
    const receipt = isolationReceipt({ sandboxRoot, ephemeralHome, attestation: isolationAttestation, createdAt });
    const sandboxId = `sandbox_${crypto.createHash('sha256').update(`${sandboxRoot}:${resolvedRevision}`).digest('hex').slice(0, 24)}`;

    if (receipt.classification === SANDBOX_EXTERNAL_BLOCK) {
      // The workspace is real and usable, but nothing has vouched for the
      // network boundary. Tear it down rather than leave a sandbox lying about
      // that a caller might be tempted to use anyway.
      await destroyEphemeralGitSandbox({ sandbox: { workspace } });
      return fail(['sandbox-network-isolation-attestation-required'], {
        classification: SANDBOX_EXTERNAL_BLOCK,
        isolationReceipt: receipt,
        filesystemIsolation: 'PROVISIONED_AND_DESTROYED',
        nextAction: 'Supply CLAUDE_CODE_SANDBOX_ISOLATION_FILE from whatever enforces the network boundary.'
      });
    }

    return {
      ok: true,
      policyVersion: CLAUDE_CODE_SANDBOX_PROVISIONER_POLICY_VERSION,
      status: 'PROVISIONED',
      sandboxId,
      sandboxRoot,
      workspace,
      ephemeralHome,
      baseRevision: resolvedRevision,
      isolationReceipt: receipt,
      businessEffectAuthority: 'NONE'
    };
  } catch (error) {
    await destroyEphemeralGitSandbox({ sandbox: { workspace } });
    return fail(['sandbox-provisioning-failed', text(error?.message, 500)]);
  }
}

// Workspaces this process actually created. A name is not ownership: the
// original check required only that the basename start with
// `uberbond-sandbox-`, which made any directory anywhere with that name
// destroyable -- including one inside a working tree. A recursive delete
// guarded by a string prefix is a delete primitive wearing a cleanup label.
//
// Membership here is the authority to delete. It is deliberately in-process
// and therefore lost on restart: a sandbox this process did not create is one
// it will not remove, and a leaked temp directory is a far smaller problem
// than a recursive delete pointed at the wrong path.
const provisionedWorkspaces = new Set();

export async function destroyEphemeralGitSandbox({ sandbox } = {}) {
  const workspace = text(sandbox?.workspace, 1000);
  const refuse = reason => ({
    ok: false,
    policyVersion: CLAUDE_CODE_SANDBOX_PROVISIONER_POLICY_VERSION,
    reasonCodes: [reason],
    receiptRef: null
  });
  if (!workspace || !path.isAbsolute(workspace) || !path.basename(workspace).startsWith('uberbond-sandbox-')) {
    return refuse('refusing-to-remove-a-path-this-provisioner-did-not-create');
  }
  if (!provisionedWorkspaces.has(path.resolve(workspace))) {
    return refuse('refusing-to-remove-a-workspace-this-process-did-not-provision');
  }
  try {
    await fs.rm(workspace, { recursive: true, force: true });
    provisionedWorkspaces.delete(path.resolve(workspace));
  } catch (error) {
    return {
      ok: false,
      policyVersion: CLAUDE_CODE_SANDBOX_PROVISIONER_POLICY_VERSION,
      reasonCodes: ['sandbox-destroy-failed', text(error?.message, 300)],
      receiptRef: null
    };
  }
  return {
    ok: true,
    policyVersion: CLAUDE_CODE_SANDBOX_PROVISIONER_POLICY_VERSION,
    status: 'DESTROYED',
    receiptRef: `receipt:sandbox-destroy:${crypto.createHash('sha256').update(workspace).digest('hex').slice(0, 24)}`,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Verification mode is a narrowing, not a new sandbox: the model is finished,
 * and from here only the verifier runs. The receipt records that the model
 * executor is no longer attached, which is the property the orchestrator needs
 * before it will trust a verification result.
 */
export async function enterEphemeralVerificationMode({ sandbox } = {}) {
  const sandboxRoot = text(sandbox?.sandboxRoot, 1000);
  if (!sandboxRoot || !path.isAbsolute(sandboxRoot)) {
    return { ok: false, policyVersion: CLAUDE_CODE_SANDBOX_PROVISIONER_POLICY_VERSION, reasonCodes: ['sandbox-root-required'] };
  }
  const previous = sandbox?.isolationReceipt;
  if (!previous || previous.classification === SANDBOX_EXTERNAL_BLOCK) {
    return {
      ok: false,
      policyVersion: CLAUDE_CODE_SANDBOX_PROVISIONER_POLICY_VERSION,
      reasonCodes: ['verification-mode-requires-an-attested-sandbox'],
      classification: SANDBOX_EXTERNAL_BLOCK
    };
  }
  return {
    ok: true,
    policyVersion: CLAUDE_CODE_SANDBOX_PROVISIONER_POLICY_VERSION,
    status: 'VERIFICATION_MODE',
    isolationReceipt: { ...previous, modelExecutorAttached: false, phase: 'VERIFICATION' },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Convenience wiring for callers that just want the three functions the
 * engineering executor asks for.
 */
export function createSandboxProvisioner({ repoRoot, isolationAttestation = null, baseRevision = 'HEAD' } = {}) {
  return {
    createSandbox: () => createEphemeralGitSandbox({ repoRoot, baseRevision, isolationAttestation }),
    destroySandbox: ({ sandbox }) => destroyEphemeralGitSandbox({ sandbox }),
    enterVerificationMode: ({ sandbox }) => enterEphemeralVerificationMode({ sandbox })
  };
}
