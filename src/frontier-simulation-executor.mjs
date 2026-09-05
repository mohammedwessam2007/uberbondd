import crypto from 'node:crypto';

export const FRONTIER_SIMULATION_EXECUTOR_VERSION = 'uberbond.frontier-simulation-executor-1.0.0';

const simulationFactories = new WeakSet();
const MAX_RESPONSES = 128;
const MAX_RESULT_BYTES = 100_000;

function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function clone(value) { return structuredClone(value); }
function bytes(value) { return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8'); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function normalizeResponses(responses = []) {
  if (!Array.isArray(responses) || responses.length === 0 || responses.length > MAX_RESPONSES) {
    throw new Error('bounded frontier simulation responses required');
  }
  const normalized = [];
  const seen = new Set();
  for (const [index, raw] of responses.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`simulation response object required:${index}`);
    const taskId = text(raw.taskId, 240)?.toLowerCase();
    const model = raw.model == null ? null : text(raw.model, 160);
    const costCents = integer(raw.costCents ?? 0, 0, 10_000_000);
    if (!taskId || costCents == null) throw new Error(`simulation response task/cost invalid:${index}`);
    if (bytes(raw.result) > MAX_RESULT_BYTES) throw new Error(`simulation response result too large:${index}`);
    const key = `${taskId}\u0000${model ?? '*'}`;
    if (seen.has(key)) throw new Error(`duplicate simulation response:${key}`);
    seen.add(key);
    normalized.push({ taskId, model, costCents, result: clone(raw.result) });
  }
  return Object.freeze(normalized.map(item => Object.freeze(item)));
}

// This is the only production-module seam that may execute a synthetic frontier
// admission. It cannot accept fetch, callbacks, endpoints, credentials or arbitrary
// executors. It returns only predeclared in-memory results and therefore cannot
// create network/provider side effects.
export function createFrontierSimulationExecutorFactory({ responses = [] } = {}) {
  const scripts = normalizeResponses(responses);
  const factoryId = digest(scripts).slice(0, 24);
  const factory = worker => {
    const model = text(worker?.model, 160);
    const reasoningEffort = text(worker?.reasoningEffort, 40)?.toLowerCase();
    if (!model || !reasoningEffort) throw new Error('complete frontier simulation worker required');
    return async ({ task, costCeilingCents } = {}) => {
      const taskId = text(task?.taskId, 240)?.toLowerCase();
      const ceiling = integer(costCeilingCents, 0, 10_000_000);
      if (!taskId || ceiling == null) return { ok: false, outcome: 'CONFIRMED_FAILURE', reasonCodes: ['valid-simulation-task-and-budget-required'] };
      const script = scripts.find(item => item.taskId === taskId && (item.model == null || item.model === model));
      if (!script) return { ok: false, outcome: 'CONFIRMED_FAILURE', reasonCodes: ['frontier-simulation-response-not-scripted'] };
      return {
        ok: true,
        outcome: 'COMPLETED',
        providerRequestId: `simulation-${factoryId}-${digest({ taskId, model }).slice(0, 16)}`,
        model,
        identityVerification: 'OBSERVED',
        appliedReasoningEffort: reasoningEffort,
        appliedReasoningEvidence: 'REQUEST_BODY_ATTESTED',
        usage: { costCents: script.costCents },
        result: clone(script.result),
        simulationOnly: true,
        networkCalls: 0
      };
    };
  };
  simulationFactories.add(factory);
  return factory;
}

export function isFrontierSimulationExecutorFactory(value) {
  return typeof value === 'function' && simulationFactories.has(value);
}
