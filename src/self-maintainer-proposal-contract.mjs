import { compileAgentCodeChangeSet, validateAgentCodeChangeSet } from './agent-code-change-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SELF_MAINTAINER_PROPOSAL_POLICY_VERSION = 'self-maintainer-proposal-1.0.0';
export const SELF_MAINTAINER_PROPOSAL_PROFILE = 'SELF_MAINTAINER_PROPOSAL';

const EXACT_SHA = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_CONTEXT_ITEMS = 30;

function text(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function unique(values, limit = 50) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 1000)).filter(Boolean))].slice(0, limit);
}

function fail(reasonCodes, status = 'PROPOSAL_REJECTED', extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_PROPOSAL_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function exactTaskBase(task) {
  const parent = /^main:([a-f0-9]{40})$/i.exec(text(task?.parentTask, 100));
  const constraints = Array.isArray(task?.constraints) ? task.constraints : [];
  const exactConstraints = constraints
    .map(value => /^exact-base-revision:([a-f0-9]{40})$/i.exec(text(value, 160)))
    .filter(Boolean)
    .map(match => match[1].toLowerCase());
  if (!parent || exactConstraints.length !== 1 || parent[1].toLowerCase() !== exactConstraints[0]) return null;
  return exactConstraints[0];
}

export function selfMaintainerProposalTaskReasons(task) {
  const reasons = [];
  const taskId = text(task?.taskId, 160);
  const baseRevision = exactTaskBase(task);
  if (!/^uberbond_self_maintain_[a-f0-9]{24}$/i.test(taskId)) reasons.push('self-maintainer-task-identity-required');
  if (text(task?.originAgent, 120) !== 'uberbond-max-council-controller') reasons.push('self-maintainer-origin-required');
  if (text(task?.targetAgent, 80).toLowerCase() !== 'claude-code') reasons.push('self-maintainer-target-agent-required');
  if (String(task?.consequenceClass || '').toUpperCase() !== 'LOCAL_PREPARATION') reasons.push('self-maintainer-local-preparation-only');
  if (!baseRevision) reasons.push('self-maintainer-exact-base-binding-required');
  const requiredOutputs = new Set(Array.isArray(task?.requiredOutputs) ? task.requiredOutputs.map(value => text(value, 120)) : []);
  if (!requiredOutputs.has('codeChangeSet')) reasons.push('self-maintainer-code-change-set-output-required');
  const acceptance = new Set(Array.isArray(task?.acceptanceTests) ? task.acceptanceTests.map(value => text(value, 500)) : []);
  for (const command of ['npm run check:syntax', 'npm run test:deterministic']) {
    if (!acceptance.has(command)) reasons.push(`self-maintainer-required-verification-missing:${command}`);
  }
  return reasons;
}

export function isSelfMaintainerProposalTask(task) {
  return selfMaintainerProposalTaskReasons(task).length === 0;
}

// The model proposes only source facts needed by the canonical compiler.
// Derived identifiers, hashes, policy versions and authority fields are never
// model-authored. Every property is required so strict structured-output
// providers cannot silently omit a field and let a caller guess its meaning.
export const SELF_MAINTAINER_RAW_PROPOSAL_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['PROCEED', 'STOP'] },
    summary: { type: 'string' },
    baseRevision: { type: 'string', pattern: '^[a-fA-F0-9]{40}$' },
    changes: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          operation: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE'] },
          path: { type: 'string' },
          beforeSha256: { type: 'string' },
          content: { type: 'string' },
          rationale: { type: 'string' }
        },
        required: ['operation', 'path', 'beforeSha256', 'content', 'rationale']
      }
    },
    verification: { type: 'array', maxItems: 20, items: { type: 'string' } },
    evidenceRefs: { type: 'array', maxItems: 50, items: { type: 'string' } },
    cognitivePrioritiesConsidered: { type: 'array', maxItems: MAX_CONTEXT_ITEMS, items: { type: 'string' } }
  },
  required: [
    'decision', 'summary', 'baseRevision', 'changes', 'verification',
    'evidenceRefs', 'cognitivePrioritiesConsidered'
  ]
});

function normalizeModelChange(change = {}) {
  const operation = text(change.operation, 20).toUpperCase();
  const before = text(change.beforeSha256, 80);
  const content = String(change.content ?? '');
  return {
    operation,
    path: text(change.path, 500),
    beforeSha256: operation === 'CREATE' ? null : before,
    content: operation === 'DELETE' ? null : content,
    rationale: text(change.rationale, 1000)
  };
}

function stopResult(task, proposal, baseRevision) {
  if ((proposal?.changes || []).length) return fail(['stop-proposal-must-not-carry-changes']);
  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_PROPOSAL_POLICY_VERSION,
    status: 'NO_SAFE_CHANGE_PROPOSED',
    result: {
      outcome: text(proposal?.summary, 4000) || 'No safe worthwhile source change was proposed for this exact base revision.',
      changedArtifacts: [],
      testsActuallyRun: [],
      truthTable: [
        {
          claim: `Proposal generation was bound to exact source ${baseRevision}.`,
          status: 'INFERRED',
          evidenceRefs: [`github:commit:${baseRevision}`]
        }
      ],
      externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
      decision: 'STOP',
      coordination: {
        action: 'DONE',
        objective: '',
        summary: text(proposal?.summary, 2000) || 'No bounded change set admitted.',
        evidenceRefs: unique(proposal?.evidenceRefs),
        contextRefs: unique(task?.contextRefs),
        acceptanceTests: unique(task?.acceptanceTests, 20),
        requiredOutputs: unique(task?.requiredOutputs, 20),
        constraints: unique(task?.constraints, 30),
        tokenBudget: Math.max(1, Number(task?.budget?.maxTokens || 1)),
        confidence: 0.8
      },
      evidenceRefs: unique([`github:commit:${baseRevision}`, ...(proposal?.evidenceRefs || [])]),
      cognitivePrioritiesConsidered: unique(proposal?.cognitivePrioritiesConsidered, MAX_CONTEXT_ITEMS)
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}

/**
 * Convert untrusted model-authored edits into the canonical AgentCodeChangeSet.
 * The model cannot supply policyVersion, changeSetId, afterSha256, totals or
 * authority. Those are computed here from the exact task and source hashes.
 */
export function compileSelfMaintainerProposalWorkerResult({ task, proposal } = {}) {
  const taskReasons = selfMaintainerProposalTaskReasons(task);
  if (taskReasons.length) return fail(taskReasons, 'TASK_REJECTED');
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return fail(['proposal-object-required']);

  const baseRevision = exactTaskBase(task);
  const proposalBase = text(proposal.baseRevision, 80).toLowerCase();
  if (!EXACT_SHA.test(proposalBase) || proposalBase !== baseRevision) return fail(['proposal-base-revision-mismatch']);
  const decision = text(proposal.decision, 40).toUpperCase();
  if (!['PROCEED', 'STOP'].includes(decision)) return fail(['proposal-decision-invalid']);
  if (decision === 'STOP') return stopResult(task, proposal, baseRevision);

  if (!Array.isArray(proposal.changes) || !proposal.changes.length) return fail(['proceed-proposal-requires-changes']);
  for (const [index, change] of proposal.changes.entries()) {
    const operation = text(change?.operation, 20).toUpperCase();
    const before = text(change?.beforeSha256, 80);
    if (operation === 'CREATE' && before) return fail([`proposal-change-${index}-create-before-hash-must-be-empty`]);
    if (['UPDATE', 'DELETE'].includes(operation) && !SHA256.test(before)) return fail([`proposal-change-${index}-before-hash-required`]);
    if (operation === 'DELETE' && String(change?.content ?? '') !== '') return fail([`proposal-change-${index}-delete-content-must-be-empty`]);
  }

  const requiredVerification = unique(task.acceptanceTests, 20);
  const proposedVerification = unique(proposal.verification, 20);
  for (const command of requiredVerification) {
    if (!proposedVerification.includes(command)) return fail([`proposal-required-verification-missing:${command}`]);
  }

  const changeSet = compileAgentCodeChangeSet({
    taskId: task.taskId,
    baseRevision,
    changes: proposal.changes.map(normalizeModelChange),
    verification: proposedVerification,
    summary: text(proposal.summary, 2000),
    consequenceClass: 'LOCAL_PREPARATION'
  });
  if (!changeSet.ok) return fail(['proposal-canonical-compilation-failed', ...(changeSet.reasonCodes || [])]);
  const validated = validateAgentCodeChangeSet(changeSet);
  if (!validated.ok) return fail(['proposal-canonical-validation-failed', ...(validated.reasonCodes || [])]);

  const evidenceRefs = unique([`github:commit:${baseRevision}`, ...(proposal.evidenceRefs || [])]);
  const result = {
    outcome: `Canonical bounded change set ${changeSet.changeSetId} compiled for isolated verification. No source write or test execution occurred in the proposal stage.`,
    changedArtifacts: changeSet.changes.map(change => change.path),
    testsActuallyRun: [],
    truthTable: [
      {
        claim: 'Model-authored edits were compiled by UberBond through the canonical AgentCodeChangeSet contract.',
        status: 'VERIFIED',
        evidenceRefs: [`receipt:${changeSet.changeSetId}`]
      },
      {
        claim: 'The proposed edits have passed isolated deterministic verification.',
        status: 'UNRESOLVED',
        evidenceRefs: []
      }
    ],
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    decision: 'PROCEED',
    coordination: {
      action: 'ENGINEERING_REQUIRED',
      objective: 'Apply this exact canonical change set only inside the zero-network self-maintainer sandbox, verify it, bind the tested fingerprint, then create a review PR only if every gate passes.',
      summary: text(proposal.summary, 2000),
      evidenceRefs,
      contextRefs: unique(task.contextRefs),
      acceptanceTests: requiredVerification,
      requiredOutputs: unique(task.requiredOutputs, 20),
      constraints: unique(task.constraints, 30),
      tokenBudget: Math.max(1, Number(task?.budget?.maxTokens || 1)),
      confidence: 0.9
    },
    evidenceRefs,
    codeChangeSet: changeSet,
    cognitivePrioritiesConsidered: unique(proposal.cognitivePrioritiesConsidered, MAX_CONTEXT_ITEMS)
  };

  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_PROPOSAL_POLICY_VERSION,
    status: 'CANONICAL_CHANGESET_PROPOSED',
    result,
    codeChangeSet: changeSet,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}
