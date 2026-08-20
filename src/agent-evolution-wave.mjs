// One bounded self-upgrade -> worker -> independent-review composition.
//
// This module reuses the canonical self-upgrade, AgentTask, relay-client, and
// audit contracts. It creates no task registry, scheduler, provider client, or
// production authority. A caller must inject the already configured relay
// client. One invocation can enqueue at most one LOCAL_PREPARATION task and
// can perform only the relay client's bounded result poll.

import crypto from 'node:crypto';
import {
  compileEngineeringMissionPacket,
  evaluateUpgradeGate
} from './self-upgrade.mjs';
import { compileAgentTask, compileDisputePacket } from './agent-relay.mjs';
import { ZERO_EFFECTS, hasSecret, validResult } from './cloud-agent-relay.mjs';

export const AGENT_EVOLUTION_WAVE_POLICY_VERSION = 'agent-evolution-wave-1.0.0';

const MAX_REFS = 100;
const MAX_ITEMS = 40;
const MAX_TASK_TOKENS = 200_000;

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value, max = 600) {
  return String(value ?? '').trim().slice(0, max);
}

function strings(values, max = MAX_ITEMS) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 500)).filter(Boolean))].slice(0, max);
}

function failure(reasonCodes, date, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_EVOLUTION_WAVE_POLICY_VERSION,
    status,
    timestamp: timestamp(date),
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

function canonicalPath(value) {
  const path = text(value, 500).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!path || path.startsWith('/') || path.split('/').includes('..')) return '';
  return path;
}

function pathInScope(path, scopes) {
  return scopes.some(scope => {
    const normalized = canonicalPath(scope).replace(/\/$/, '');
    return normalized && (path === normalized || path.startsWith(`${normalized}/`));
  });
}

function isPassingTest(entry) {
  const label = String(entry?.result ?? entry?.status ?? '').trim().toUpperCase();
  const failed = Number(entry?.failed ?? entry?.failures ?? 0);
  return ['PASS', 'PASSED', 'PASS_LOCAL', 'SUCCESS'].includes(label)
    && Number.isFinite(failed) && failed === 0;
}

function summarizeTests(entries, reasonCodes) {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let reportedTotal = 0;
  for (const entry of entries) {
    const explicitTotal = Number(entry?.tests ?? entry?.total);
    const explicitPassed = Number(entry?.passed);
    const explicitFailed = Number(entry?.failed ?? entry?.failures);
    if (Number.isSafeInteger(explicitTotal) && explicitTotal >= 0
      && Number.isSafeInteger(explicitPassed) && explicitPassed >= 0
      && Number.isSafeInteger(explicitFailed) && explicitFailed >= 0) {
      const explicitSkipped = Number(entry?.skipped);
      const inferredSkipped = Math.max(0, explicitTotal - explicitPassed - explicitFailed);
      reportedTotal += explicitTotal;
      skipped += Number.isSafeInteger(explicitSkipped) && explicitSkipped >= 0 ? explicitSkipped : inferredSkipped;
      // evaluateUpgradeGate's total is the number of non-skipped assertions.
      // Preserve the original total separately so skipped infrastructure tests
      // cannot be mistaken for either failures or passes.
      total += explicitPassed + explicitFailed;
      passed += explicitPassed;
      failed += explicitFailed;
    } else {
      total += 1;
      reportedTotal += 1;
      if (isPassingTest(entry)) passed += 1;
      else failed += 1;
    }
  }
  return {
    total,
    reportedTotal,
    passed,
    failed,
    skipped,
    criticalFailures: reasonCodes.filter(code => code.startsWith('test-') || code.startsWith('required-test-'))
  };
}

// Task 1: bridge the existing review-required proposal and engineering packet
// into the existing AgentTask contract. The mission and task IDs are content
// derived, so replaying the same input reaches the relay's existing dedupe key.
export function compileAgentEvolutionMission({
  proposal,
  repositoryScope = ['src/', 'tests/', 'docs/'],
  forbiddenActions = [],
  requiredTests = [],
  acceptanceGate = [],
  rollbackPlan,
  budget = { maxTokens: 50_000, maxCostCents: 0 },
  deadline,
  economicObjective = 'lawful risk-adjusted recurring contribution profit per founder minute',
  date = new Date()
} = {}) {
  const at = timestamp(date);
  const maxTokens = Number(budget?.maxTokens);
  const maxCostCents = Number(budget?.maxCostCents);
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_TASK_TOKENS) {
    return failure(['bounded-token-budget-required'], at);
  }
  if (!Number.isSafeInteger(maxCostCents) || maxCostCents !== 0) {
    return failure(['zero-cost-ceiling-required'], at);
  }

  const mission = compileEngineeringMissionPacket({
    proposal,
    repositoryScope,
    forbiddenActions,
    requiredTests,
    acceptanceGate,
    rollbackPlan,
    targetAgent: 'CLAUDE_CODE',
    date: at
  });
  if (!mission.ok) return failure(mission.reasonCodes || ['engineering-mission-invalid'], at);

  const task = compileAgentTask({
    taskId: `agent_${mission.missionId}`,
    objective: mission.objective,
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    parentTask: mission.proposalId,
    contextRefs: [`proposal:${mission.proposalId}`, `mission:${mission.missionId}`],
    evidenceRefs: [
      ...mission.evidenceRefs,
      `proposal:${mission.proposalId}`,
      `mission:${mission.missionId}`
    ].slice(0, MAX_REFS),
    constraints: [
      ...mission.repositoryScope.map(path => `repository-scope:${path}`),
      ...mission.acceptanceGate.map(gate => `acceptance-gate:${gate}`),
      `rollback:${mission.rollbackPlan}`
    ],
    forbiddenActions: mission.forbiddenActions,
    requiredOutputs: [
      'outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable',
      'externalEffectLedger', 'decision'
    ],
    acceptanceTests: mission.requiredTests,
    budget: { maxTokens, maxCostCents: 0 },
    deadline,
    economicObjective,
    consequenceClass: 'LOCAL_PREPARATION',
    date: at
  });
  if (!task.ok) return failure(task.reasonCodes || ['agent-task-invalid'], at);

  const identity = {
    proposalId: proposal.proposalId,
    missionId: mission.missionId,
    taskId: task.taskId,
    scope: mission.repositoryScope,
    tests: mission.requiredTests,
    budget: task.budget
  };
  return {
    ok: true,
    policyVersion: AGENT_EVOLUTION_WAVE_POLICY_VERSION,
    waveId: `evolution_${digest(identity).slice(0, 24)}`,
    status: 'READY_FOR_RELAY',
    createdAt: at,
    proposal,
    mission,
    task,
    authority: 'LOCAL_PREPARATION',
    promotion: 'BLOCKED',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

// Task 2: review a worker result independently. A worker's PROCEED is only a
// claim. Scope, required test commands, result identity, decision, and the
// zero-effect ledger are checked again. Unsupported PROCEED creates the
// canonical bounded DisputePacket; it never silently chooses the worker.
export function reviewAgentEvolutionResult({
  bundle,
  relayReceipt,
  baseline,
  candidate,
  ownerRepairCountBaseline,
  ownerRepairCountCandidate,
  date = new Date()
} = {}) {
  const at = timestamp(date);
  if (!bundle?.ok || !bundle?.proposal?.proposalId || !bundle?.mission?.missionId || !bundle?.task?.taskId) {
    return failure(['valid-evolution-bundle-required'], at);
  }
  if (!relayReceipt?.ok || relayReceipt.status !== 'RESULT_RECEIVED') {
    return failure(['completed-relay-receipt-required'], at);
  }
  if (relayReceipt.task?.taskId !== bundle.task.taskId) {
    return failure(['relay-task-identity-mismatch'], at);
  }
  const result = relayReceipt.result;
  const validationErrors = validResult(result);
  if (validationErrors.length) return failure(validationErrors.map(code => `worker-${code}`), at);
  if (hasSecret(result)) return failure(['secret-like-worker-result-rejected'], at);

  const reasons = [];
  if (String(relayReceipt.resultStatus || '').toUpperCase() !== 'COMPLETED') reasons.push('worker-result-not-completed');
  const workerDecision = String(result.decision || '').toUpperCase();
  if (!['PROCEED', 'REPAIR', 'STOP'].includes(workerDecision)) reasons.push('worker-decision-invalid');

  const scopes = bundle.mission.repositoryScope;
  const artifacts = strings(result.changedArtifacts, 200);
  for (const suppliedPath of artifacts) {
    const path = canonicalPath(suppliedPath);
    if (!path) reasons.push('changed-artifact-path-invalid');
    else if (/^lite(?:\/|$)/i.test(path)) reasons.push('protected-lite-path-reported');
    else if (!pathInScope(path, scopes)) reasons.push('changed-artifact-outside-mission-scope');
  }

  const tests = Array.isArray(result.testsActuallyRun) ? result.testsActuallyRun.slice(0, 100) : [];
  if (!tests.length) reasons.push('tests-actually-run-required');
  for (const required of bundle.mission.requiredTests) {
    const observed = tests.find(entry => text(entry?.command, 1000) === required);
    if (!observed) reasons.push(`required-test-missing:${required}`);
    else if (!isPassingTest(observed)) reasons.push(`required-test-not-passing:${required}`);
  }
  if (tests.some(entry => !isPassingTest(entry))) reasons.push('test-receipt-reports-failure');

  if (workerDecision !== 'PROCEED') reasons.push(`worker-requested-${workerDecision.toLowerCase()}`);
  const testResults = summarizeTests(tests, reasons);
  const gate = evaluateUpgradeGate({
    proposal: bundle.proposal,
    testResults,
    baseline,
    candidate,
    ownerRepairCountBaseline,
    ownerRepairCountCandidate,
    externalProof: false,
    date: at
  });
  if (gate.status !== 'SHADOW_READY') reasons.push(...(gate.reasonCodes || []));

  const reasonCodes = [...new Set(reasons)];
  const accepted = reasonCodes.length === 0 && gate.status === 'SHADOW_READY';
  const evidenceRefs = [
    `proposal:${bundle.proposal.proposalId}`,
    `mission:${bundle.mission.missionId}`,
    `task:${bundle.task.taskId}`,
    `receipt:${bundle.waveId}`
  ];
  const dispute = !accepted && workerDecision === 'PROCEED'
    ? compileDisputePacket({
      task: bundle.task,
      disagreements: [
        {
          agent: 'claude-code',
          position: 'PROCEED',
          reasonCodes: ['worker-reported-proceed'],
          evidenceRefs
        },
        {
          agent: 'chatgpt-reviewer',
          position: 'REPAIR',
          reasonCodes,
          evidenceRefs
        }
      ],
      evidenceRefs,
      maxRounds: 2,
      date: at
    })
    : null;

  const reviewIdentity = {
    waveId: bundle.waveId,
    taskId: bundle.task.taskId,
    resultStatus: relayReceipt.resultStatus,
    workerDecision,
    reasonCodes,
    testResults,
    artifacts
  };
  return {
    ok: true,
    policyVersion: AGENT_EVOLUTION_WAVE_POLICY_VERSION,
    reviewId: `review_${digest(reviewIdentity).slice(0, 24)}`,
    waveId: bundle.waveId,
    proposalId: bundle.proposal.proposalId,
    missionId: bundle.mission.missionId,
    taskId: bundle.task.taskId,
    status: accepted ? 'SHADOW_READY' : 'REPAIR_REQUIRED',
    reasonCodes,
    changedArtifacts: artifacts,
    testSummary: testResults,
    workerDecision,
    gate,
    dispute,
    promotion: {
      status: 'PROMOTION_BLOCKED',
      authority: 'OWNER_REQUIRED',
      economicProof: 'NOT_INFERRED'
    },
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export async function logAgentEvolutionReceipt(store, detail) {
  if (!store || typeof store.log !== 'function' || !detail?.policyVersion) return null;
  return store.log('agent_evolution_wave', {
    policyVersion: detail.policyVersion,
    waveId: detail.waveId || null,
    proposalId: detail.proposalId || detail.proposal?.proposalId || null,
    missionId: detail.missionId || detail.mission?.missionId || null,
    taskId: detail.taskId || detail.task?.taskId || null,
    reviewId: detail.reviewId || detail.review?.reviewId || null,
    status: detail.status,
    reasonCodes: detail.reasonCodes || [],
    issueNumber: detail.issueNumber || null,
    promotion: detail.promotion || detail.review?.promotion || 'BLOCKED',
    externalEffectLedger: { ...ZERO_EFFECTS },
    timestamp: detail.timestamp || detail.completedAt || detail.createdAt || null
  });
}

// Task 3: execute one and only one bounded relay cycle. No retry loop exists
// here; network and polling limits remain owned by the hardened relay client.
// A non-READY health result prevents task creation.
export async function runBoundedAgentEvolutionWave({
  proposal,
  mission = {},
  relayClient,
  store = null,
  poll = {},
  review = {},
  date = new Date()
} = {}) {
  const at = timestamp(date);
  if (!relayClient || typeof relayClient.health !== 'function'
    || typeof relayClient.createTask !== 'function'
    || typeof relayClient.waitForResult !== 'function') {
    return failure(['configured-relay-client-required'], at);
  }
  const bundle = compileAgentEvolutionMission({ proposal, ...mission, date: at });
  if (!bundle.ok) return bundle;

  const health = await relayClient.health();
  if (!health?.ok || String(health.status || '').toUpperCase() !== 'READY') {
    const blocked = failure(
      ['relay-not-ready', ...(Array.isArray(health?.reasonCodes) ? health.reasonCodes : [])],
      at,
      'BLOCKED',
      { waveId: bundle.waveId, proposalId: bundle.proposal.proposalId, missionId: bundle.mission.missionId, taskId: bundle.task.taskId }
    );
    await logAgentEvolutionReceipt(store, blocked);
    return blocked;
  }

  const queued = await relayClient.createTask(bundle.task, at);
  if (!queued?.ok || !Number.isSafeInteger(Number(queued.issueNumber))) {
    const blocked = failure(
      ['relay-task-not-queued', ...(Array.isArray(queued?.reasonCodes) ? queued.reasonCodes : [])],
      at,
      'BLOCKED',
      { waveId: bundle.waveId, proposalId: bundle.proposal.proposalId, missionId: bundle.mission.missionId, taskId: bundle.task.taskId }
    );
    await logAgentEvolutionReceipt(store, blocked);
    return blocked;
  }

  const receipt = await relayClient.waitForResult({
    issueNumber: Number(queued.issueNumber),
    expectedTaskId: bundle.task.taskId,
    maxPolls: poll.maxPolls,
    pollIntervalMs: poll.pollIntervalMs
  });
  if (!receipt?.ok || receipt.status !== 'RESULT_RECEIVED') {
    const pendingOrBlocked = {
      ...failure(
        Array.isArray(receipt?.reasonCodes) ? receipt.reasonCodes : ['worker-result-not-received'],
        at,
        receipt?.status === 'PENDING' ? 'PENDING' : 'BLOCKED'
      ),
      waveId: bundle.waveId,
      proposalId: bundle.proposal.proposalId,
      missionId: bundle.mission.missionId,
      taskId: bundle.task.taskId,
      issueNumber: Number(queued.issueNumber),
      polls: Number(receipt?.polls || 0)
    };
    await logAgentEvolutionReceipt(store, pendingOrBlocked);
    return pendingOrBlocked;
  }

  const reviewed = reviewAgentEvolutionResult({ bundle, relayReceipt: receipt, ...review, date: at });
  const completed = {
    ok: reviewed.ok,
    policyVersion: AGENT_EVOLUTION_WAVE_POLICY_VERSION,
    waveId: bundle.waveId,
    proposalId: bundle.proposal.proposalId,
    missionId: bundle.mission.missionId,
    taskId: bundle.task.taskId,
    issueNumber: Number(queued.issueNumber),
    status: reviewed.status,
    completedAt: at,
    reasonCodes: reviewed.reasonCodes || [],
    review: reviewed,
    promotion: reviewed.promotion,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  await logAgentEvolutionReceipt(store, completed);
  return completed;
}
