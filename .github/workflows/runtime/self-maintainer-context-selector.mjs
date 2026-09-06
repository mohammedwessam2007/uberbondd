import { ZERO_EXTERNAL_EFFECTS } from '../../../src/effect-ledgers.mjs';
import { selfMaintainerProposalTaskReasons } from './self-maintainer-proposal-contract.mjs';
import { normalizeSourcePath } from './self-maintainer-source-context.mjs';

export const SELF_MAINTAINER_CONTEXT_SELECTOR_VERSION = 'self-maintainer-context-selector-1.0.0';

const MAX_PATHS = 5000;
const MAX_INVENTORY_BYTES = 160_000;
const MAX_SELECTED = 12;

function text(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function failure(reasonCodes, outcome = 'CONFIRMED_FAILURE', extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_CONTEXT_SELECTOR_VERSION,
    outcome,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function validatedInventory(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_PATHS) return null;
  const normalized = [];
  for (const raw of paths) {
    const sourcePath = normalizeSourcePath(raw);
    if (!sourcePath) return null;
    if (!normalized.includes(sourcePath)) normalized.push(sourcePath);
  }
  const encoded = JSON.stringify(normalized);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_INVENTORY_BYTES) return null;
  return normalized;
}

function selectionTask(task, inventory) {
  const inventoryJson = JSON.stringify(inventory);
  return {
    ...structuredClone(task),
    objective: [
      text(task.objective, 8000),
      'CONTEXT SELECTION STAGE ONLY. Do not propose code yet and do not claim tests ran.',
      `Choose between 1 and ${MAX_SELECTED} repository files whose exact contents you need to inspect before you can propose the highest-value safe bounded repair.`,
      'Prefer the minimum sufficient context bundle: likely causal implementation file(s), directly relevant tests, and only necessary callers/config/docs. You may inspect sovereignty/protected files for understanding but they remain uneditable.',
      'Return the normal bounded worker result plus selfMaintenanceContextRequest with exactly one field: paths. paths must contain only exact strings from the inventory below. Do not invent paths.',
      `Exact tracked source path inventory: ${inventoryJson}`
    ].join(' '),
    requiredOutputs: [
      ...new Set([...(Array.isArray(task.requiredOutputs) ? task.requiredOutputs : []).filter(value => value !== 'codeChangeSet'), 'selfMaintenanceContextRequest'])
    ]
  };
}

function parseSelection(providerResult, inventory) {
  const request = providerResult?.result?.selfMaintenanceContextRequest;
  if (!request || typeof request !== 'object' || Array.isArray(request)) return failure(['provider-context-request-required']);
  const keys = Object.keys(request);
  if (keys.length !== 1 || keys[0] !== 'paths') return failure(['provider-context-request-closed-schema-required']);
  if (!Array.isArray(request.paths) || request.paths.length < 1 || request.paths.length > MAX_SELECTED) return failure(['provider-context-path-count-invalid']);
  const allowed = new Set(inventory);
  const paths = [];
  for (const [index, raw] of request.paths.entries()) {
    if (typeof raw !== 'string') return failure([`provider-context-path-${index}-string-required`]);
    const sourcePath = normalizeSourcePath(raw);
    if (!sourcePath || !allowed.has(sourcePath)) return failure([`provider-context-path-${index}-not-in-inventory`]);
    if (!paths.includes(sourcePath)) paths.push(sourcePath);
  }
  if (!paths.length) return failure(['provider-context-selection-empty']);
  return { ok: true, paths };
}

/**
 * Ask one already-authorized provider for the minimum exact-source context it
 * needs. This phase never sees file contents and can never return a patch.
 */
export function createSelfMaintainerContextSelector({ modelExecutor } = {}) {
  return async function selfMaintainerContextSelector(input = {}) {
    if (typeof modelExecutor !== 'function') return failure(['context-selector-model-executor-required']);
    const task = input.task;
    const taskReasons = selfMaintainerProposalTaskReasons(task);
    if (taskReasons.length) return failure(taskReasons);
    const inventory = validatedInventory(input.sourceInventory);
    if (!inventory) return failure(['valid-bounded-source-inventory-required']);

    let providerResult;
    try {
      providerResult = await modelExecutor({
        ...input,
        task: selectionTask(task, inventory),
        maxTokens: Math.max(1, Math.min(Number(input.maxTokens || 6000), 6000))
      });
    } catch (error) {
      return failure(['context-selector-model-executor-threw', 'provider-compute-outcome-uncertain'], 'UNCERTAIN', {
        uncertain: true,
        detail: text(error?.message, 500)
      });
    }
    if (!providerResult?.ok) {
      return {
        ...providerResult,
        policyVersion: SELF_MAINTAINER_CONTEXT_SELECTOR_VERSION,
        businessEffectAuthority: 'NONE'
      };
    }
    const selection = parseSelection(providerResult, inventory);
    if (!selection.ok) {
      return failure(['provider-context-selection-rejected', ...(selection.reasonCodes || [])], 'CONFIRMED_FAILURE', {
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
      policyVersion: SELF_MAINTAINER_CONTEXT_SELECTOR_VERSION,
      contextPaths: selection.paths,
      result: {
        outcome: 'Minimum exact-source context selected; no code proposal or test claim was produced.',
        changedArtifacts: [],
        testsActuallyRun: [],
        truthTable: [],
        externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
        decision: 'PROCEED',
        coordination: providerResult?.result?.coordination || null,
        evidenceRefs: providerResult?.result?.evidenceRefs || [],
        selfMaintenanceContextRequest: { paths: selection.paths }
      },
      businessEffectAuthority: 'NONE'
    };
  };
}
