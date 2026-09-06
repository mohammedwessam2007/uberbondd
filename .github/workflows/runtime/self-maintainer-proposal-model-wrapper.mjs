import {
  SELF_MAINTAINER_RAW_PROPOSAL_SCHEMA,
  selfMaintainerProposalTaskReasons
} from './self-maintainer-proposal-contract.mjs';
import { compileSourceBoundSelfMaintainerProposal } from './self-maintainer-source-bound-compiler.mjs';
import {
  validateSourceContextEnvelope,
  validateSourceInventoryEnvelope
} from './self-maintainer-source-context.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../../../src/effect-ledgers.mjs';

export const SELF_MAINTAINER_PROPOSAL_MODEL_WRAPPER_VERSION = 'self-maintainer-proposal-model-wrapper-1.2.0';

function text(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function failure(reasonCodes, outcome = 'CONFIRMED_FAILURE', extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_PROPOSAL_MODEL_WRAPPER_VERSION,
    outcome,
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

function modelTask(task, sourceContext) {
  const schema = JSON.stringify(SELF_MAINTAINER_RAW_PROPOSAL_SCHEMA);
  const exactSource = JSON.stringify({
    sourceSha: sourceContext.sourceSha,
    sourceContextDigest: sourceContext.sourceContextDigest || null,
    files: sourceContext.files.map(file => ({
      path: file.path,
      sha256: file.sha256,
      byteLength: file.byteLength,
      content: file.content
    }))
  });
  return {
    ...structuredClone(task),
    objective: [
      text(task.objective, 8000),
      'PROPOSAL STAGE ONLY. Do not claim that tests ran and do not write a canonical AgentCodeChangeSet yourself.',
      'The exact repository source context below was read from the exact Git checkout named by sourceSha. Ground every UPDATE or DELETE only in those exact files. Do not invent unseen source.',
      'Return the normal bounded worker result plus an additional top-level field named selfMaintenanceProposal.',
      'selfMaintenanceProposal must contain ONLY raw source facts. UberBond derives policyVersion, changeSetId, beforeSha256, afterSha256, totals and authority itself.',
      'beforeSha256 is a compatibility placeholder in the raw schema: set it to the empty string for every change. UberBond discards it for UPDATE/DELETE and substitutes the exact locally observed SHA-256 before canonical compilation.',
      'CREATE may name a new safe source path. UberBond independently checks that path against the exact tracked-file inventory and rejects CREATE if the path already existed.',
      'Never propose edits to .github/workflows, package.json, package-lock.json, .npmrc, sovereignty paths, credentials, secrets, customer/payment truth guards, or verification machinery.',
      'If no safe worthwhile bounded edit can be grounded in this exact source, set selfMaintenanceProposal.decision=STOP and changes=[].',
      `Exact source context: ${exactSource}`,
      `Raw proposal JSON schema: ${schema}`
    ].join(' '),
    requiredOutputs: [
      ...new Set([...(Array.isArray(task.requiredOutputs) ? task.requiredOutputs : []).filter(value => value !== 'codeChangeSet'), 'selfMaintenanceProposal'])
    ]
  };
}

/**
 * Wrap any proposal-capable model executor. The provider can reason and return
 * raw edits, but exact local source bytes and inventory are rebound before only
 * the protected UberBond compiler can create the canonical change set.
 */
export function createSelfMaintainerProposalModelWrapper({ modelExecutor } = {}) {
  return async function selfMaintainerProposalModelExecutor(input = {}) {
    if (typeof modelExecutor !== 'function') return failure(['proposal-model-executor-required']);
    const task = input.task;
    const taskReasons = selfMaintainerProposalTaskReasons(task);
    if (taskReasons.length) return failure(taskReasons);

    const baseRevision = exactTaskBase(task);
    const validatedInventory = validateSourceInventoryEnvelope(input.sourceInventory, baseRevision);
    if (!validatedInventory.ok) {
      return failure(['proposal-exact-source-inventory-required', ...(validatedInventory.reasonCodes || [])]);
    }
    const validatedSource = validateSourceContextEnvelope(input.sourceContext, baseRevision);
    if (!validatedSource.ok) {
      return failure(['proposal-exact-source-context-required', ...(validatedSource.reasonCodes || [])]);
    }
    if (!validatedSource.inventoryDigest || validatedSource.inventoryDigest !== validatedInventory.inventoryDigest) {
      return failure(['proposal-source-context-inventory-mismatch']);
    }

    let providerResult;
    try {
      providerResult = await modelExecutor({ ...input, task: modelTask(task, validatedSource) });
    } catch (error) {
      return failure(['proposal-model-executor-threw', 'provider-compute-outcome-uncertain'], 'UNCERTAIN', {
        uncertain: true,
        detail: text(error?.message, 500)
      });
    }

    if (!providerResult?.ok) {
      return {
        ...providerResult,
        policyVersion: SELF_MAINTAINER_PROPOSAL_MODEL_WRAPPER_VERSION,
        businessEffectAuthority: 'NONE'
      };
    }

    const rawProposal = providerResult?.result?.selfMaintenanceProposal;
    const compiled = compileSourceBoundSelfMaintainerProposal({
      task,
      proposal: rawProposal,
      sourceContext: validatedSource,
      sourceInventory: validatedInventory
    });
    if (!compiled.ok) {
      return failure(['provider-proposal-rejected', ...(compiled.reasonCodes || [])], 'CONFIRMED_FAILURE', {
        providerRequestId: providerResult.providerRequestId || null,
        model: providerResult.model || providerResult.observedModel || null,
        usage: providerResult.usage || null,
        pricingEvidence: providerResult.pricingEvidence || null
      });
    }

    return {
      ...providerResult,
      ok: true,
      outcome: 'COMPLETED',
      policyVersion: SELF_MAINTAINER_PROPOSAL_MODEL_WRAPPER_VERSION,
      result: compiled.result,
      canonicalProposalStatus: compiled.status,
      sourceInventoryDigest: compiled.sourceInventoryDigest || validatedInventory.inventoryDigest,
      sourceContextDigest: compiled.sourceContextDigest || validatedSource.sourceContextDigest || null,
      businessEffectAuthority: 'NONE'
    };
  };
}
