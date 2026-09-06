import {
  SELF_MAINTAINER_RAW_PROPOSAL_SCHEMA,
  compileSelfMaintainerProposalWorkerResult,
  selfMaintainerProposalTaskReasons
} from './self-maintainer-proposal-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../../../src/effect-ledgers.mjs';

export const SELF_MAINTAINER_PROPOSAL_MODEL_WRAPPER_VERSION = 'self-maintainer-proposal-model-wrapper-1.0.0';

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

function modelTask(task) {
  const schema = JSON.stringify(SELF_MAINTAINER_RAW_PROPOSAL_SCHEMA);
  return {
    ...structuredClone(task),
    objective: [
      text(task.objective, 8000),
      'PROPOSAL STAGE ONLY. Do not claim that tests ran and do not write a canonical AgentCodeChangeSet yourself.',
      'Return the normal bounded worker result plus an additional top-level field named selfMaintenanceProposal.',
      'selfMaintenanceProposal must contain ONLY raw source facts. UberBond will derive policyVersion, changeSetId, afterSha256, totals and authority itself.',
      'For UPDATE or DELETE, beforeSha256 must be the exact SHA-256 of the exact base file you inspected. For CREATE it must be the empty string. For DELETE content must be the empty string.',
      'Never propose edits to .github/workflows, package.json, package-lock.json, .npmrc, sovereignty paths, credentials, secrets, customer/payment truth guards, or verification machinery.',
      'If no safe worthwhile bounded edit can be grounded in exact source, set selfMaintenanceProposal.decision=STOP and changes=[].',
      `Raw proposal JSON schema: ${schema}`
    ].join(' '),
    requiredOutputs: [
      ...new Set([...(Array.isArray(task.requiredOutputs) ? task.requiredOutputs : []).filter(value => value !== 'codeChangeSet'), 'selfMaintenanceProposal'])
    ]
  };
}

/**
 * Wrap any proposal-capable model executor. The provider can reason and return
 * raw edits, but only this protected runtime can turn them into the canonical
 * change set consumed by the self-maintainer.
 */
export function createSelfMaintainerProposalModelWrapper({ modelExecutor } = {}) {
  return async function selfMaintainerProposalModelExecutor(input = {}) {
    if (typeof modelExecutor !== 'function') return failure(['proposal-model-executor-required']);
    const task = input.task;
    const taskReasons = selfMaintainerProposalTaskReasons(task);
    if (taskReasons.length) return failure(taskReasons);

    let providerResult;
    try {
      providerResult = await modelExecutor({ ...input, task: modelTask(task) });
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
    const compiled = compileSelfMaintainerProposalWorkerResult({ task, proposal: rawProposal });
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
      businessEffectAuthority: 'NONE'
    };
  };
}
