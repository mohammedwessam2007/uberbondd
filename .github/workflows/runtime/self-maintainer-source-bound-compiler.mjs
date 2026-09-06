import { compileSelfMaintainerProposalWorkerResult } from './self-maintainer-proposal-contract.mjs';
import {
  normalizeSourcePath,
  validateSourceContextEnvelope,
  validateSourceInventoryEnvelope
} from './self-maintainer-source-context.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../../../src/effect-ledgers.mjs';

export const SELF_MAINTAINER_SOURCE_BOUND_COMPILER_VERSION = 'self-maintainer-source-bound-compiler-1.1.0';

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function failure(reasonCodes, status = 'SOURCE_BOUND_PROPOSAL_REJECTED', extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_SOURCE_BOUND_COMPILER_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function exactTaskBase(task) {
  const match = /^main:([a-f0-9]{40})$/i.exec(text(task?.parentTask, 100));
  return match ? match[1].toLowerCase() : null;
}

/**
 * Bind model-authored edits to exact locally-read source bytes before they are
 * admitted to the canonical AgentCodeChangeSet compiler. UPDATE/DELETE hashes
 * come only from exact local context. CREATE is admitted only when the exact
 * tracked-file inventory proves the path was absent at the same source SHA.
 */
export function compileSourceBoundSelfMaintainerProposal({
  task,
  proposal,
  sourceContext,
  sourceInventory
} = {}) {
  const baseRevision = exactTaskBase(task);
  if (!baseRevision) return failure(['exact-self-maintainer-base-required']);

  if (String(proposal?.decision || '').trim().toUpperCase() === 'STOP') {
    return compileSelfMaintainerProposalWorkerResult({ task, proposal });
  }

  const inventory = validateSourceInventoryEnvelope(sourceInventory, baseRevision);
  if (!inventory.ok) {
    return failure(['exact-source-inventory-required', ...(inventory.reasonCodes || [])]);
  }

  const validated = validateSourceContextEnvelope(sourceContext, baseRevision);
  if (!validated.ok) {
    return failure(['exact-source-context-required', ...(validated.reasonCodes || [])]);
  }
  if (!validated.inventoryDigest || validated.inventoryDigest !== inventory.inventoryDigest) {
    return failure(['source-context-inventory-digest-mismatch']);
  }

  const inventoryPaths = new Set(inventory.paths);
  const contextByPath = new Map();
  for (const file of validated.files) {
    if (!inventoryPaths.has(file.path)) return failure([`source-context-file-not-in-exact-inventory:${file.path}`]);
    contextByPath.set(file.path, file);
  }

  const changes = Array.isArray(proposal?.changes) ? proposal.changes : [];
  const rebound = [];
  const reasons = [];

  for (const [index, change] of changes.entries()) {
    const operation = text(change?.operation, 20).toUpperCase();
    const sourcePath = normalizeSourcePath(change?.path);
    if (!sourcePath) {
      reasons.push(`source-bound-change-${index}-path-invalid`);
      continue;
    }

    if (operation === 'UPDATE' || operation === 'DELETE') {
      const exact = contextByPath.get(sourcePath);
      if (!exact) {
        reasons.push(`source-bound-change-${index}-exact-context-required`);
        continue;
      }
      rebound.push({
        ...structuredClone(change),
        path: sourcePath,
        beforeSha256: exact.sha256
      });
      continue;
    }

    if (operation === 'CREATE') {
      if (inventoryPaths.has(sourcePath)) {
        reasons.push(`source-bound-change-${index}-create-path-already-exists`);
        continue;
      }
      rebound.push({
        ...structuredClone(change),
        path: sourcePath,
        beforeSha256: ''
      });
      continue;
    }

    rebound.push({ ...structuredClone(change), path: sourcePath || change?.path });
  }

  if (reasons.length) return failure(reasons);

  const compiled = compileSelfMaintainerProposalWorkerResult({
    task,
    proposal: {
      ...structuredClone(proposal),
      changes: rebound
    }
  });
  if (!compiled.ok) {
    return failure(['source-bound-canonical-compilation-failed', ...(compiled.reasonCodes || [])]);
  }

  return {
    ...compiled,
    policyVersion: SELF_MAINTAINER_SOURCE_BOUND_COMPILER_VERSION,
    sourceInventoryDigest: inventory.inventoryDigest,
    sourceContextDigest: validated.sourceContextDigest || null,
    sourceContextFiles: validated.files.map(file => ({ path: file.path, sha256: file.sha256, byteLength: file.byteLength })),
    businessEffectAuthority: 'NONE'
  };
}
