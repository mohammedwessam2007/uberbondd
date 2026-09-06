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

export const SELF_MAINTAINER_PROPOSAL_WORKER_VERSION = 'self-maintainer-proposal-worker-1.0.0';

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_PROPOSAL_WORKER_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function exactBase(task) {
  const match = /^main:([a-f0-9]{40})$/i.exec(text(task?.parentTask, 100));
  return match ? match[1].toLowerCase() : null;
}

function failureResult(reasonCodes) {
  return {
    outcome: `Self-maintainer proposal generation failed: ${reasonCodes.join(', ')}`,
    changedArtifacts: [],
    testsActuallyRun: [],
    truthTable: [{ claim: 'A trustworthy canonical self-maintainer proposal was produced.', status: 'UNRESOLVED', evidenceRefs: [] }],
    externalEffectLedger: zeroEffects(),
    decision: 'STOP',
    coordination: {
      action: 'BLOCKED_EXTERNAL',
      objective: '',
      summary: 'Proposal generation did not produce an admissible canonical change set.',
      evidenceRefs: [],
      contextRefs: [],
      acceptanceTests: [],
      requiredOutputs: [],
      constraints: [],
      tokenBudget: 1,
      confidence: 1
    },
    evidenceRefs: []
  };
}

/**
 * Process at most one exact self-maintainer proposal task.
 *
 * This stage has no repository-write, PR, merge, deploy, customer, payment,
 * DNS, credential-change or production authority. Its only non-compute side
 * effect is the canonical GitHub Issues relay bookkeeping required to claim and
 * submit the result. The downstream self-maintainer separately revalidates and
 * executes the change set in a zero-network sandbox before any review PR can
 * exist.
 */
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

    const claim = await claimGithubRelayTask({
      client,
      owner,
      repo,
      issueNumber: candidate.issueNumber,
      workerId: worker,
      date
    });
    if (!claim?.ok) continue;

    const task = claim.task;
    const taskReasons = selfMaintainerProposalTaskReasons(task);
    if (taskReasons.length) {
      // A task changed shape between poll and claim or the poll transport did
      // not include the full packet. Never execute it merely because it carried
      // the right label.
      return fail(['claimed-task-not-self-maintainer', ...taskReasons], 'TASK_REJECTED', {
        issueNumber: candidate.issueNumber,
        taskId: task?.taskId || null
      });
    }
    sawSelfMaintainerTask = true;

    const heartbeat = await heartbeatGithubRelayTask({
      client,
      owner,
      repo,
      issueNumber: candidate.issueNumber,
      workerId: worker,
      date
    });
    if (!heartbeat?.ok) {
      return fail(['proposal-relay-heartbeat-failed', ...(heartbeat?.reasonCodes || [])], 'LEASE_LOST', {
        issueNumber: candidate.issueNumber,
        taskId: task.taskId
      });
    }

    const wrappedExecutor = createSelfMaintainerProposalModelWrapper({ modelExecutor });
    const provider = await wrappedExecutor({
      task,
      maxTokens: Number(task?.budget?.maxTokens || 1),
      costCeilingCents: Number(task?.budget?.maxCostCents || 0),
      idempotencyKey: `self-maintainer-proposal:${task.taskId}`
    });

    if (!provider?.ok) {
      if (String(provider?.outcome || '').toUpperCase() === 'UNCERTAIN' || provider?.uncertain === true) {
        // Uncertain compute is deliberately not submitted as a final answer.
        // The lease can expire and the normal relay recovery path can decide
        // what to do next without two contradictory terminal results.
        return fail(['proposal-provider-outcome-uncertain', ...(provider?.reasonCodes || [])], 'PROVIDER_OUTCOME_UNCERTAIN', {
          issueNumber: candidate.issueNumber,
          taskId: task.taskId,
          providerRequestId: provider?.providerRequestId || null
        });
      }

      const reasons = ['proposal-provider-confirmed-failure', ...(provider?.reasonCodes || [])];
      const result = failureResult(reasons);
      const submittedFailure = await submitGithubRelayResult({
        client,
        owner,
        repo,
        issueNumber: candidate.issueNumber,
        workerId: worker,
        taskId: task.taskId,
        status: 'FAILED',
        result,
        sourceCommit: exactBase(task),
        confidence: 1,
        limitations: reasons,
        cost: provider?.usage?.costCents == null ? null : { cents: provider.usage.costCents },
        date
      });
      return {
        ok: Boolean(submittedFailure?.ok),
        policyVersion: SELF_MAINTAINER_PROPOSAL_WORKER_VERSION,
        status: submittedFailure?.ok ? 'CONFIRMED_FAILURE_SUBMITTED' : 'FAILURE_SUBMISSION_BLOCKED',
        issueNumber: candidate.issueNumber,
        taskId: task.taskId,
        reasonCodes: reasons,
        businessEffectAuthority: 'NONE',
        externalEffectLedger: zeroEffects()
      };
    }

    const resultErrors = validResult(provider.result);
    if (resultErrors.length) {
      return fail(['compiled-proposal-result-invalid', ...resultErrors], 'RESULT_REJECTED', {
        issueNumber: candidate.issueNumber,
        taskId: task.taskId
      });
    }

    const submitted = await submitGithubRelayResult({
      client,
      owner,
      repo,
      issueNumber: candidate.issueNumber,
      workerId: worker,
      taskId: task.taskId,
      status: 'COMPLETED',
      result: provider.result,
      sourceCommit: exactBase(task),
      confidence: provider.result?.coordination?.confidence ?? 0.9,
      tests: provider.result.testsActuallyRun,
      artifacts: provider.result.changedArtifacts,
      findings: provider.result.evidenceRefs,
      limitations: provider.result.decision === 'STOP' ? ['no-safe-worthwhile-change-proposed'] : ['proposal-stage-only-verification-pending'],
      cost: provider?.usage?.costCents == null ? null : { cents: provider.usage.costCents },
      date
    });
    if (!submitted?.ok) {
      return fail(['proposal-result-submit-failed', ...(submitted?.reasonCodes || [])], 'SUBMISSION_BLOCKED', {
        issueNumber: candidate.issueNumber,
        taskId: task.taskId
      });
    }

    return {
      ok: true,
      policyVersion: SELF_MAINTAINER_PROPOSAL_WORKER_VERSION,
      status: provider.result.decision === 'STOP' ? 'NO_SAFE_CHANGE_SUBMITTED' : 'CANONICAL_PROPOSAL_SUBMITTED',
      issueNumber: candidate.issueNumber,
      taskId: task.taskId,
      changeSetId: provider.result?.codeChangeSet?.changeSetId || null,
      providerRequestId: provider.providerRequestId || null,
      model: provider.model || provider.observedModel || null,
      usage: provider.usage || null,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }

  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_PROPOSAL_WORKER_VERSION,
    status: sawSelfMaintainerTask ? 'SELF_MAINTAINER_TASK_BUSY_OR_UNCLAIMABLE' : 'IDLE_NO_SELF_MAINTAINER_TASK',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
