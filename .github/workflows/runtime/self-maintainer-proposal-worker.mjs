import {
  claimGithubRelayTask,
  heartbeatGithubRelayTask,
  pollGithubRelayTasks,
  submitGithubRelayResult
} from '../../../src/github-relay.mjs';
import { validResult } from '../../../src/cloud-agent-relay.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../../../src/effect-ledgers.mjs';
import { selfMaintainerProposalTaskReasons } from './self-maintainer-proposal-contract.mjs';
import { createSelfMaintainerProposalModelWrapper } from './self-maintainer-proposal-model-wrapper.mjs';

export const SELF_MAINTAINER_PROPOSAL_WORKER_VERSION = 'self-maintainer-proposal-worker-1.1.0';

function text(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return { ok: false, policyVersion: SELF_MAINTAINER_PROPOSAL_WORKER_VERSION, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra };
}
function exactBase(task) {
  const match = /^main:([a-f0-9]{40})$/i.exec(text(task?.parentTask, 100));
  return match ? match[1].toLowerCase() : null;
}
function relayCost(usage) {
  if (!usage || !Number.isSafeInteger(Number(usage.costCents)) || Number(usage.costCents) < 0) return null;
  const tokens = Number.isSafeInteger(Number(usage.totalTokens)) && Number(usage.totalTokens) >= 0 ? Number(usage.totalTokens) : null;
  return { usdCents: Number(usage.costCents), tokens };
}
function nonTerminalProviderBlocker(reasonCodes = []) {
  const reasons = reasonCodes.map(code => String(code || '').toLowerCase());
  if (reasons.some(code => code.includes('estimated-cost-exceeds-reserved-ceiling'))) return 'COMPUTE_BUDGET_NOT_AUTHORIZED';
  if (reasons.some(code => code.includes('actual-cost-exceeds-reserved-ceiling'))) return 'COMPUTE_BUDGET_NOT_AUTHORIZED';
  if (reasons.some(code => code.includes('credential') || code.includes('api-key-required'))) return 'PROVIDER_CREDENTIAL_REQUIRED';
  if (reasons.some(code => code.includes('pricing') || code.includes('price-evidence'))) return 'PROVIDER_PRICING_EVIDENCE_REQUIRED';
  if (reasons.some(code => code.includes('executor-disabled') || code.includes('runtime-disabled') || code.includes('explicitly-disabled'))) return 'PROVIDER_NOT_ACTIVATED';
  if (reasons.some(code => code.includes('quota') || code.includes('rate-limit'))) return 'PROVIDER_CAPACITY_BLOCKED';
  return null;
}
function failureResult(reasonCodes) {
  return {
    outcome: `Self-maintainer proposal generation failed: ${reasonCodes.join(', ')}`,
    changedArtifacts: [],
    testsActuallyRun: [],
    truthTable: [{ claim: 'A trustworthy canonical self-maintainer proposal was produced.', status: 'UNRESOLVED', evidenceRefs: [] }],
    externalEffectLedger: zeroEffects(),
    decision: 'STOP',
    coordination: { action: 'BLOCKED_EXTERNAL', objective: '', summary: 'Proposal generation did not produce an admissible canonical change set.', evidenceRefs: [], contextRefs: [], acceptanceTests: [], requiredOutputs: [], constraints: [], tokenBudget: 1, confidence: 1 },
    evidenceRefs: []
  };
}

export async function runSelfMaintainerProposalWorker({
  client,
  owner,
  repo,
  modelExecutor,
  workerId = 'uberbond-self-maintainer-proposal',
  targetAgent = 'claude-code',
  date = new Date(),
  pollLimit = 20
} = {}) {
  if (!client) return fail(['github-relay-client-required']);
  if (!text(owner, 120) || !text(repo, 120)) return fail(['github-repository-required']);
  if (typeof modelExecutor !== 'function') return fail(['proposal-model-executor-required']);
  const worker = text(workerId, 120);
  if (!worker) return fail(['worker-id-required']);

  const polled = await pollGithubRelayTasks({ client, owner, repo, targetAgent, limit: pollLimit });
  if (!polled?.ok) return fail(polled?.reasonCodes || ['proposal-relay-poll-failed'], 'RELAY_UNAVAILABLE');

  const candidates = Array.isArray(polled.tasks) ? polled.tasks : [];
  let sawSelfMaintainerTask = false;
  for (const candidate of candidates) {
    const preliminaryTask = candidate?.task || null;
    if (preliminaryTask && selfMaintainerProposalTaskReasons(preliminaryTask).length) continue;
    if (preliminaryTask) sawSelfMaintainerTask = true;

    const claim = await claimGithubRelayTask({ client, owner, repo, issueNumber: candidate.issueNumber, workerId: worker, now: date });
    if (!claim?.ok) continue;

    const task = claim.task;
    const taskReasons = selfMaintainerProposalTaskReasons(task);
    if (taskReasons.length) return fail(['claimed-task-not-self-maintainer', ...taskReasons], 'TASK_REJECTED', { issueNumber: candidate.issueNumber, taskId: task?.taskId || null });
    sawSelfMaintainerTask = true;

    const heartbeat = await heartbeatGithubRelayTask({ client, owner, repo, issueNumber: candidate.issueNumber, workerId: worker, now: date });
    if (!heartbeat?.ok) return fail(['proposal-relay-heartbeat-failed', ...(heartbeat?.reasonCodes || [])], 'LEASE_LOST', { issueNumber: candidate.issueNumber, taskId: task.taskId });

    const wrappedExecutor = createSelfMaintainerProposalModelWrapper({ modelExecutor });
    const provider = await wrappedExecutor({ task, maxTokens: Number(task?.budget?.maxTokens || 1), costCeilingCents: Number(task?.budget?.maxCostCents || 0), idempotencyKey: `self-maintainer-proposal:${task.taskId}` });

    if (!provider?.ok) {
      if (String(provider?.outcome || '').toUpperCase() === 'UNCERTAIN' || provider?.uncertain === true) {
        return fail(['proposal-provider-outcome-uncertain', ...(provider?.reasonCodes || [])], 'PROVIDER_OUTCOME_UNCERTAIN', { issueNumber: candidate.issueNumber, taskId: task.taskId, providerRequestId: provider?.providerRequestId || null });
      }

      const activationBlocker = nonTerminalProviderBlocker(provider?.reasonCodes || []);
      if (activationBlocker) {
        return fail([activationBlocker, ...(provider?.reasonCodes || [])], activationBlocker, {
          issueNumber: candidate.issueNumber,
          taskId: task.taskId,
          providerRequestId: provider?.providerRequestId || null,
          taskRemainsRecoverable: true
        });
      }

      const reasons = ['proposal-provider-confirmed-failure', ...(provider?.reasonCodes || [])];
      const result = failureResult(reasons);
      const submittedFailure = await submitGithubRelayResult({
        client, owner, repo, issueNumber: candidate.issueNumber, workerId: worker, taskId: task.taskId,
        status: 'FAILED', result, sourceCommit: exactBase(task), confidence: 'HIGH', limitations: reasons,
        cost: relayCost(provider?.usage), now: date
      });
      return { ok: Boolean(submittedFailure?.ok), policyVersion: SELF_MAINTAINER_PROPOSAL_WORKER_VERSION, status: submittedFailure?.ok ? 'CONFIRMED_FAILURE_SUBMITTED' : 'FAILURE_SUBMISSION_BLOCKED', issueNumber: candidate.issueNumber, taskId: task.taskId, reasonCodes: reasons, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
    }

    const resultErrors = validResult(provider.result);
    if (resultErrors.length) return fail(['compiled-proposal-result-invalid', ...resultErrors], 'RESULT_REJECTED', { issueNumber: candidate.issueNumber, taskId: task.taskId });

    const submitted = await submitGithubRelayResult({
      client, owner, repo, issueNumber: candidate.issueNumber, workerId: worker, taskId: task.taskId,
      status: 'COMPLETED', result: provider.result, sourceCommit: exactBase(task), confidence: 'HIGH',
      tests: provider.result.testsActuallyRun, artifacts: provider.result.changedArtifacts, findings: provider.result.evidenceRefs,
      limitations: provider.result.decision === 'STOP' ? ['no-safe-worthwhile-change-proposed'] : ['proposal-stage-only-verification-pending'],
      cost: relayCost(provider?.usage), now: date
    });
    if (!submitted?.ok) return fail(['proposal-result-submit-failed', ...(submitted?.reasonCodes || [])], 'SUBMISSION_BLOCKED', { issueNumber: candidate.issueNumber, taskId: task.taskId });

    return { ok: true, policyVersion: SELF_MAINTAINER_PROPOSAL_WORKER_VERSION, status: provider.result.decision === 'STOP' ? 'NO_SAFE_CHANGE_SUBMITTED' : 'CANONICAL_PROPOSAL_SUBMITTED', issueNumber: candidate.issueNumber, taskId: task.taskId, changeSetId: provider.result?.codeChangeSet?.changeSetId || null, providerRequestId: provider.providerRequestId || null, model: provider.model || provider.observedModel || null, usage: provider.usage || null, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  }

  return { ok: true, policyVersion: SELF_MAINTAINER_PROPOSAL_WORKER_VERSION, status: sawSelfMaintainerTask ? 'SELF_MAINTAINER_TASK_BUSY_OR_UNCLAIMABLE' : 'IDLE_NO_SELF_MAINTAINER_TASK', businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
}
