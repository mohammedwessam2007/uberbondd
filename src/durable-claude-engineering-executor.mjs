import { createClaudeEngineeringExecutor } from './claude-engineering-orchestrator.mjs';
import { saveAgentCodeChangeArtifact } from './agent-code-artifact-store.mjs';
import {
  createSandboxProvisioner,
  SANDBOX_PROVISIONER_EXTERNAL_BLOCK
} from './agent-sandbox-provisioner.mjs';

export const DURABLE_CLAUDE_ENGINEERING_POLICY_VERSION = 'durable-claude-engineering-1.0.0';

function validStore(store) {
  return Boolean(store && typeof store.log === 'function' && typeof store.list === 'function');
}

/**
 * Canonical convenience factory for the autonomous engineering worker.
 *
 * The lower-level orchestrator intentionally accepts an injected persistence
 * hook. This wrapper binds that hook to UberBond's durable audit-backed code
 * artifact store, so a verified patch is not forced through the relay's inline
 * JSON payload and cannot disappear between Claude execution and GPT review.
 *
 * This still grants no production/GitHub authority. The artifact is evidence
 * only. Promotion remains a separately governed operation after review/tests.
 */
export function createDurableClaudeEngineeringExecutor({ store, ...options } = {}) {
  if (!validStore(store)) {
    return async function invalidStoreExecutor() {
      return {
        ok: false,
        policyVersion: DURABLE_CLAUDE_ENGINEERING_POLICY_VERSION,
        outcome: 'CONFIRMED_FAILURE',
        reasonCodes: ['durable-store-log-and-list-required'],
        businessEffectAuthority: 'NONE'
      };
    };
  }

  const persistChangeSet = async changeSet => {
    const receipt = await saveAgentCodeChangeArtifact(store, changeSet);
    if (!receipt.ok) return receipt;
    return {
      ok: true,
      artifactRef: receipt.artifactRef,
      artifactSha256: receipt.artifactSha256,
      auditId: receipt.auditId,
      status: receipt.status
    };
  };

  return createClaudeEngineeringExecutor({
    ...options,
    persistChangeSet
  });
}

/**
 * The engineering executor with a real OS sandbox behind it.
 *
 * The lower layers have always demanded createSandbox / destroySandbox /
 * enterVerificationMode and nobody supplied them, so this whole path failed at
 * `sandbox-factory-required` and stayed archaeology. It is wired now -- and
 * wired in the only honest way: if the host cannot actually isolate, this
 * returns a refusal naming the environment rather than an executor that will
 * run Claude against the real working tree.
 *
 * An explicitly injected sandbox function still wins, so tests keep their
 * seams and an operator can substitute a stronger provisioner later.
 */
export async function createIsolatedClaudeEngineeringExecutor({
  store,
  repoRoot = process.cwd(),
  tmpRoot = undefined,
  ...options
} = {}) {
  const provisioner = await createSandboxProvisioner({ repoRoot, ...(tmpRoot ? { tmpRoot } : {}) });
  if (!provisioner.ok) {
    const blocked = {
      ok: false,
      policyVersion: DURABLE_CLAUDE_ENGINEERING_POLICY_VERSION,
      outcome: 'BLOCKED_EXTERNAL',
      status: SANDBOX_PROVISIONER_EXTERNAL_BLOCK,
      externalBlocker: SANDBOX_PROVISIONER_EXTERNAL_BLOCK,
      reasonCodes: ['os-isolation-unavailable', ...provisioner.reasonCodes],
      businessEffectAuthority: 'NONE'
    };
    const executor = async () => blocked;
    executor.sandboxStatus = SANDBOX_PROVISIONER_EXTERNAL_BLOCK;
    executor.capability = provisioner.capability;
    return executor;
  }

  let activeSandbox = null;
  const executor = createDurableClaudeEngineeringExecutor({
    // Caller options first, then the sandbox wiring: the wiring reads its own
    // overrides out of `options`, so spreading afterwards would let an absent
    // key overwrite the default it just chose.
    ...options,
    store,
    createSandbox: options.createSandbox || (async args => {
      const sandbox = await provisioner.createSandbox(args);
      activeSandbox = sandbox.ok ? sandbox : null;
      return sandbox;
    }),
    destroySandbox: options.destroySandbox || (async args => {
      const receipt = await provisioner.destroySandbox(args);
      activeSandbox = null;
      return receipt;
    }),
    enterVerificationMode: options.enterVerificationMode || provisioner.enterVerificationMode,
    // The verifier runs every command through this, which is where the
    // namespaces are actually applied. Without it the isolation receipt would
    // be a claim about a process that never entered one.
    verifySandbox: options.verifySandbox || (async args => {
      const { runSandboxVerification } = await import('./agent-sandbox-verifier.mjs');
      return runSandboxVerification({
        ...args,
        runCommand: provisioner.runVerificationCommand(activeSandbox || { sandboxRoot: args.sandboxRoot, isolationReceipt: args.isolationReceipt })
      });
    })
  });
  executor.sandboxStatus = 'READY';
  executor.capability = provisioner.capability;
  return executor;
}
