import { createClaudeEngineeringExecutor } from './claude-engineering-orchestrator.mjs';
import { saveAgentCodeChangeArtifact } from './agent-code-artifact-store.mjs';

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
