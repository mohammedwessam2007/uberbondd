import crypto from 'node:crypto';

export const AGENT_AUTONOMY_POLICY_VERSION = 'agent-autonomy-loop-1.0.0';

const DEFAULT_AGENTS = Object.freeze(['chatgpt', 'claude-code']);
const MAX_ROUNDS = 32;
const MAX_TASKS = 64;
const MAX_TOTAL_TOKENS = 10_000_000;
const MAX_REFS = 100;
const MAX_HISTORY = 256;
const EXTERNAL_EFFECT_ZERO = Object.freeze({
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  businessSpendCents: 0
});

export const AUTONOMY_ACTIONS = Object.freeze([
  'DONE',
  'RESEARCH_REQUIRED',
  'ENGINEERING_REQUIRED',
  'REVIEW_REQUIRED',
  'REPAIR_REQUIRED',
  'DISPUTE_REQUIRED',
  'SHADOW_REQUIRED',
  'CANARY_REQUIRED',
  'ECONOMIC_TEST_REQUIRED',
  'OWNER_REVIEW_REQUIRED',
  'BLOCKED_EXTERNAL'
]);

const SAFE_AUTO_ACTIONS = new Set(['RESEARCH_REQUIRED', 'ENGINEERING_REQUIRED', 'REVIEW_REQUIRED', 'REPAIR_REQUIRED']);
const OWNER_BOUNDARY_ACTIONS = new Set(['SHADOW_REQUIRED', 'CANARY_REQUIRED', 'ECONOMIC_TEST_REQUIRED', 'OWNER_REVIEW_REQUIRED', 'BLOCKED_EXTERNAL']);
const ROUTES = Object.freeze({
  RESEARCH_REQUIRED: 'chatgpt',
  ENGINEERING_REQUIRED: 'claude-code',
  REVIEW_REQUIRED: 'chatgpt',
  REPAIR_REQUIRED: 'claude-code'
});

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function strings(values, max = MAX_REFS) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 500)).filter(Boolean))].slice(0, max);
}
function canonicalEvidenceRefs(values) {
  const refs = strings(values, MAX_REFS);
  const valid = refs.filter(value => /^(evidence|audit|test|doc|outcome|signal|task|proposal|mission|receipt):/i.test(value));
  return { refs, valid, ok: refs.length === valid.length };
}
function int(value, min, max, fallback = null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}
function normalizeAgent(value) {
  const agent = text(value, 80).toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(agent) ? agent : '';
}
function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_AUTONOMY_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectLedger: { ...EXTERNAL_EFFECT_ZERO },
    ...extra
  };
}
function zeroBusinessLedger(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(EXTERNAL_EFFECT_ZERO).every(([key, zero]) => Number(value[key] || 0) === zero);
}
function cloneSession(session) {
  return {
    ...session,
    allowedAgents: [...session.allowedAgents],
    history: [...session.history],
    seenFollowups: [...session.seenFollowups]
  };
}
function validSession(session) {
  return Boolean(session?.ok && session.policyVersion === AGENT_AUTONOMY_POLICY_VERSION && session.sessionId);
}

export function compileAutonomySession({
  objective,
  allowedAgents = DEFAULT_AGENTS,
  startAgent = 'chatgpt',
  maxRounds = 12,
  maxTasks = 24,
  maxTotalTokens = 1_000_000,
  founderActionBudget = 3,
  economicObjective = 'lawful durable risk-adjusted recurring contribution profit per founder minute',
  date = new Date()
} = {}) {
  const cleanObjective = text(objective, 1600);
  const agents = [...new Set((Array.isArray(allowedAgents) ? allowedAgents : []).map(normalizeAgent).filter(Boolean))].slice(0, 16);
  const start = normalizeAgent(startAgent);
  const rounds = int(maxRounds, 1, MAX_ROUNDS);
  const tasks = int(maxTasks, 1, MAX_TASKS);
  const tokens = int(maxTotalTokens, 1, MAX_TOTAL_TOKENS);
  const founderBudget = int(founderActionBudget, 0, 3);
  const reasons = [];
  if (!cleanObjective) reasons.push('objective-required');
  if (agents.length < 2) reasons.push('at-least-two-agents-required');
  if (!start || !agents.includes(start)) reasons.push('start-agent-must-be-allowed');
  if (rounds == null) reasons.push('bounded-round-count-required');
  if (tasks == null) reasons.push('bounded-task-count-required');
  if (tokens == null) reasons.push('bounded-token-budget-required');
  if (founderBudget == null) reasons.push('founder-action-budget-0-to-3-required');
  if (reasons.length) return fail(reasons);

  const identity = { cleanObjective, agents, start, rounds, tasks, tokens, founderBudget, economicObjective: text(economicObjective, 600) };
  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_POLICY_VERSION,
    sessionId: `mesh_${hash(identity).slice(0, 24)}`,
    status: 'READY',
    objective: cleanObjective,
    economicObjective: identity.economicObjective,
    allowedAgents: agents,
    startAgent: start,
    maxRounds: rounds,
    maxTasks: tasks,
    maxTotalTokens: tokens,
    founderActionBudget: founderBudget,
    roundsCompleted: 0,
    tasksCreated: 0,
    reservedTokens: 0,
    founderActionsUsed: 0,
    createdAt: timestamp(date),
    updatedAt: timestamp(date),
    currentTaskId: null,
    history: [],
    seenFollowups: [],
    businessEffectLedger: { ...EXTERNAL_EFFECT_ZERO }
  };
}

export function compileTaskIntent({
  session,
  originAgent = 'uberbond',
  targetAgent,
  kind = 'GENERAL',
  objective,
  parentTaskId = null,
  contextRefs = [],
  evidenceRefs = [],
  acceptanceTests = [],
  requiredOutputs = [],
  constraints = [],
  tokenBudget = 50_000,
  date = new Date()
} = {}) {
  if (!validSession(session)) return fail(['valid-autonomy-session-required']);
  const origin = normalizeAgent(originAgent);
  const target = normalizeAgent(targetAgent);
  const cleanObjective = text(objective, 1600);
  const tokens = int(tokenBudget, 1, Math.min(500_000, session.maxTotalTokens));
  const reasons = [];
  if (!origin) reasons.push('valid-origin-agent-required');
  if (!target || !session.allowedAgents.includes(target)) reasons.push('target-agent-not-allowed');
  if (origin === target) reasons.push('self-directed-agent-task-rejected');
  if (!cleanObjective) reasons.push('task-objective-required');
  if (!strings(acceptanceTests, 40).length) reasons.push('acceptance-tests-required');
  if (!canonicalEvidenceRefs(evidenceRefs).ok) reasons.push('evidence-reference-format-invalid');
  if (tokens == null) reasons.push('bounded-task-token-budget-required');
  if (session.tasksCreated >= session.maxTasks) reasons.push('session-task-limit-reached');
  if (session.reservedTokens + (tokens || 0) > session.maxTotalTokens) reasons.push('session-token-budget-exceeded');
  if (reasons.length) return fail(reasons);

  const identity = {
    sessionId: session.sessionId,
    origin,
    target,
    kind: text(kind, 80).toUpperCase(),
    cleanObjective,
    parentTaskId: text(parentTaskId, 120) || null,
    contextRefs: strings(contextRefs),
    evidenceRefs: canonicalEvidenceRefs(evidenceRefs).valid,
    acceptanceTests: strings(acceptanceTests, 40),
    requiredOutputs: strings(requiredOutputs, 40),
    constraints: strings(constraints, 40),
    tokenBudget: tokens
  };
  const taskId = `mesh_task_${hash(identity).slice(0, 24)}`;
  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_POLICY_VERSION,
    sessionId: session.sessionId,
    taskId,
    status: 'READY_FOR_RELAY',
    originAgent: origin,
    targetAgent: target,
    kind: identity.kind,
    objective: cleanObjective,
    parentTaskId: identity.parentTaskId,
    contextRefs: identity.contextRefs,
    evidenceRefs: identity.evidenceRefs,
    acceptanceTests: identity.acceptanceTests,
    requiredOutputs: identity.requiredOutputs.length ? identity.requiredOutputs : ['outcome', 'coordination', 'evidenceRefs'],
    constraints: [...new Set(['local-preparation-only', 'no-business-external-effects', ...identity.constraints])],
    tokenBudget: tokens,
    createdAt: timestamp(date),
    consequenceClass: 'LOCAL_PREPARATION',
    businessEffectLedger: { ...EXTERNAL_EFFECT_ZERO }
  };
}

export function registerTaskIntent({ session, intent, date = new Date() } = {}) {
  if (!validSession(session)) return fail(['valid-autonomy-session-required']);
  if (!intent?.ok || intent.sessionId !== session.sessionId || !intent.taskId) return fail(['valid-task-intent-required']);
  if (session.history.some(item => item.taskId === intent.taskId)) return fail(['duplicate-task-intent-rejected']);
  const next = cloneSession(session);
  next.tasksCreated += 1;
  next.reservedTokens += intent.tokenBudget;
  next.currentTaskId = intent.taskId;
  next.status = 'AWAITING_AGENT';
  next.updatedAt = timestamp(date);
  next.history.push({
    event: 'TASK_CREATED',
    taskId: intent.taskId,
    parentTaskId: intent.parentTaskId,
    originAgent: intent.originAgent,
    targetAgent: intent.targetAgent,
    kind: intent.kind,
    objective: intent.objective,
    tokenBudget: intent.tokenBudget,
    at: next.updatedAt
  });
  next.history = next.history.slice(-MAX_HISTORY);
  return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: next.status, session: next };
}

export function normalizeCoordination(result = {}) {
  const raw = result?.coordination && typeof result.coordination === 'object' ? result.coordination : {};
  const action = text(raw.action || result.nextAction, 80).toUpperCase();
  const reasons = [];
  if (!AUTONOMY_ACTIONS.includes(action)) reasons.push('valid-coordination-action-required');
  const evidence = canonicalEvidenceRefs(raw.evidenceRefs || result.evidenceRefs || []);
  if (!evidence.ok) reasons.push('evidence-reference-format-invalid');
  const objective = text(raw.objective || raw.requestedObjective || '', 1600);
  if (SAFE_AUTO_ACTIONS.has(action) && !objective) reasons.push('followup-objective-required');
  const confidence = Number(raw.confidence);
  if (Number.isFinite(confidence) && (confidence < 0 || confidence > 1)) reasons.push('coordination-confidence-out-of-range');
  if (reasons.length) return fail(reasons);
  return {
    ok: true,
    action,
    objective: objective || null,
    summary: text(raw.summary || result.outcome, 1200) || null,
    evidenceRefs: evidence.valid,
    contextRefs: strings(raw.contextRefs || []),
    acceptanceTests: strings(raw.acceptanceTests || [], 40),
    requiredOutputs: strings(raw.requiredOutputs || [], 40),
    constraints: strings(raw.constraints || [], 40),
    tokenBudget: int(raw.tokenBudget, 1, 500_000, 50_000),
    confidence: Number.isFinite(confidence) ? confidence : null
  };
}

export function ingestAgentResult({ session, taskIntent, result, date = new Date() } = {}) {
  if (!validSession(session)) return fail(['valid-autonomy-session-required']);
  if (!taskIntent?.ok || taskIntent.sessionId !== session.sessionId || taskIntent.taskId !== session.currentTaskId) return fail(['current-task-intent-required']);
  if (!result || typeof result !== 'object' || Array.isArray(result)) return fail(['agent-result-object-required']);
  if (!zeroBusinessLedger(result.businessEffectLedger || EXTERNAL_EFFECT_ZERO)) return fail(['nonzero-business-effect-rejected']);
  const coordination = normalizeCoordination(result);
  if (!coordination.ok) return coordination;

  const next = cloneSession(session);
  next.roundsCompleted += 1;
  next.currentTaskId = null;
  next.updatedAt = timestamp(date);
  next.history.push({
    event: 'AGENT_RESULT',
    taskId: taskIntent.taskId,
    agent: taskIntent.targetAgent,
    action: coordination.action,
    summary: coordination.summary,
    evidenceRefs: coordination.evidenceRefs,
    at: next.updatedAt
  });
  next.history = next.history.slice(-MAX_HISTORY);

  if (coordination.action === 'DONE') {
    next.status = 'COMPLETED';
    return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: 'COMPLETED', session: next, coordination, nextIntent: null };
  }

  if (coordination.action === 'DISPUTE_REQUIRED') {
    next.status = 'DISPUTE_PENDING';
    return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: next.status, session: next, coordination, nextIntent: null };
  }

  if (OWNER_BOUNDARY_ACTIONS.has(coordination.action)) {
    if (next.founderActionsUsed < next.founderActionBudget) next.founderActionsUsed += 1;
    next.status = 'OWNER_BOUNDARY';
    return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: next.status, session: next, coordination, nextIntent: null };
  }

  if (!SAFE_AUTO_ACTIONS.has(coordination.action)) {
    next.status = 'BLOCKED';
    return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: next.status, session: next, coordination, nextIntent: null };
  }

  if (next.roundsCompleted >= next.maxRounds || next.tasksCreated >= next.maxTasks) {
    next.status = 'BOUNDED_STOP';
    return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: next.status, session: next, coordination, nextIntent: null, reasonCodes: ['autonomy-bound-reached'] };
  }

  const targetAgent = ROUTES[coordination.action];
  if (!next.allowedAgents.includes(targetAgent)) {
    next.status = 'BLOCKED';
    return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: next.status, session: next, coordination, nextIntent: null, reasonCodes: ['required-target-agent-not-allowed'] };
  }

  const followupIdentity = {
    action: coordination.action,
    targetAgent,
    objective: coordination.objective,
    evidenceRefs: coordination.evidenceRefs,
    acceptanceTests: coordination.acceptanceTests
  };
  const followupKey = hash(followupIdentity);
  if (next.seenFollowups.includes(followupKey)) {
    next.status = 'LOOP_DETECTED';
    return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: next.status, session: next, coordination, nextIntent: null, reasonCodes: ['duplicate-followup-loop-detected'] };
  }
  next.seenFollowups.push(followupKey);
  next.seenFollowups = next.seenFollowups.slice(-MAX_HISTORY);

  const intent = compileTaskIntent({
    session: next,
    originAgent: taskIntent.targetAgent,
    targetAgent,
    kind: coordination.action,
    objective: coordination.objective,
    parentTaskId: taskIntent.taskId,
    contextRefs: [`session:${next.sessionId}`, `task:${taskIntent.taskId}`, ...coordination.contextRefs],
    evidenceRefs: coordination.evidenceRefs,
    acceptanceTests: coordination.acceptanceTests,
    requiredOutputs: coordination.requiredOutputs,
    constraints: coordination.constraints,
    tokenBudget: coordination.tokenBudget,
    date
  });
  if (!intent.ok) {
    next.status = 'BOUNDED_STOP';
    return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: next.status, session: next, coordination, nextIntent: null, reasonCodes: intent.reasonCodes };
  }
  next.status = 'FOLLOWUP_READY';
  return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: next.status, session: next, coordination, nextIntent: intent };
}

// Executes only coordination. Provider/model invocation and repository mutation
// belong to injected adapters. This function never creates an unbounded loop.
export async function runAutonomyLoop({
  session,
  initialIntent,
  adapters = {},
  adapterFactory = null,
  compileRelayTask,
  maxSteps = 8,
  onReceipt = null,
  date = new Date()
} = {}) {
  if (!validSession(session)) return fail(['valid-autonomy-session-required']);
  if (!initialIntent?.ok || initialIntent.sessionId !== session.sessionId) return fail(['valid-initial-intent-required']);
  if (typeof compileRelayTask !== 'function') return fail(['relay-task-compiler-required']);
  const stepLimit = int(maxSteps, 1, 32, 8);
  let state = session;
  let intent = initialIntent;
  const receipts = [];

  for (let step = 0; step < stepLimit; step += 1) {
    const adapter = typeof adapterFactory === 'function'
      ? await adapterFactory({ originAgent: intent.originAgent, targetAgent: intent.targetAgent, intent, session: state })
      : adapters[intent.targetAgent];
    if (!adapter || typeof adapter.createTask !== 'function' || typeof adapter.waitForResult !== 'function') {
      return { ...fail(['target-agent-adapter-required'], 'BLOCKED'), session: state, receipts };
    }
    const registered = registerTaskIntent({ session: state, intent, date });
    if (!registered.ok) return { ...registered, session: state, receipts };
    state = registered.session;

    const relayTask = compileRelayTask(intent, state);
    if (!relayTask?.ok) return { ...fail(relayTask?.reasonCodes || ['relay-task-compilation-failed']), session: state, receipts };
    const queued = await adapter.createTask(relayTask, date);
    if (!queued?.ok) return { ...fail(queued?.reasonCodes || ['relay-task-queue-failed'], 'PENDING'), session: state, receipts };
    const issueNumber = Number(queued.issueNumber);
    const received = await adapter.waitForResult({ issueNumber, expectedTaskId: relayTask.taskId });
    if (!received?.ok || received.status !== 'RESULT_RECEIVED') {
      return { ...fail(received?.reasonCodes || ['agent-result-not-received'], received?.status === 'PENDING' ? 'PENDING' : 'BLOCKED'), session: state, receipts };
    }

    const receipt = {
      step: step + 1,
      sessionId: state.sessionId,
      taskId: relayTask.taskId,
      targetAgent: intent.targetAgent,
      issueNumber,
      resultStatus: received.resultStatus,
      result: received.result
    };
    receipts.push(receipt);
    if (typeof onReceipt === 'function') await onReceipt(receipt);

    const ingested = ingestAgentResult({ session: state, taskIntent: intent, result: received.result, date });
    if (!ingested.ok) return { ...ingested, session: state, receipts };
    state = ingested.session;
    if (!ingested.nextIntent) {
      return { ok: true, policyVersion: AGENT_AUTONOMY_POLICY_VERSION, status: ingested.status, session: state, receipts, coordination: ingested.coordination };
    }
    intent = ingested.nextIntent;
  }

  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_POLICY_VERSION,
    status: 'BOUNDED_STOP',
    reasonCodes: ['runner-step-limit-reached'],
    session: state,
    receipts
  };
}

export function buildAutonomyMorningSummary({ session, receipts = [] } = {}) {
  if (!validSession(session)) return fail(['valid-autonomy-session-required']);
  const safeReceipts = Array.isArray(receipts) ? receipts.slice(0, MAX_HISTORY) : [];
  const agents = {};
  for (const item of safeReceipts) {
    const agent = normalizeAgent(item?.targetAgent) || 'unknown';
    agents[agent] = (agents[agent] || 0) + 1;
  }
  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_POLICY_VERSION,
    sessionId: session.sessionId,
    status: session.status,
    objective: session.objective,
    roundsCompleted: session.roundsCompleted,
    tasksCreated: session.tasksCreated,
    founderActionsUsed: session.founderActionsUsed,
    founderActionBudget: session.founderActionBudget,
    agentTaskCounts: agents,
    lastEvents: session.history.slice(-10),
    claimBoundary: {
      commercialRevenue: 'NOT_INFERRED',
      customerAcquisition: 'NOT_INFERRED',
      productionPromotion: 'NOT_INFERRED'
    },
    businessEffectLedger: { ...EXTERNAL_EFFECT_ZERO }
  };
}
