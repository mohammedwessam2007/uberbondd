// One place that decides whether a worker result is allowed to end a run.
//
// The relay's `validResult` answers a different question -- is this envelope
// safe to persist and pay for -- and it deliberately stays loose about content
// so that a research result and an engineering result can share one contract.
// That looseness is fine right up until a result claims DONE. At that moment
// the system stops asking a model for more work and starts treating its claim
// as truth, and a claim is not evidence.
//
// So terminal is a stricter state than valid, and this module is the only
// thing that grants it. It adds nothing the relay already checks; it checks
// what the relay deliberately does not.

import { validResult } from './cloud-agent-relay.mjs';

export const WORKER_RESULT_TRUTH_POLICY_VERSION = 'worker-result-truth-1.0.0';

const TERMINAL_DECISIONS = new Set(['DONE', 'COMPLETE', 'COMPLETED', 'ACCEPTED', 'PASS']);
const IDENTITY_FIELDS = Object.freeze(['taskId', 'runId', 'sessionId', 'workerId']);
const MAX_TRUTH_ROWS = 200;

function text(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function declaresTerminal(result) {
  const decision = text(result?.decision, 80).toUpperCase();
  const action = text(result?.coordination?.action, 80).toUpperCase();
  return TERMINAL_DECISIONS.has(decision) || action === 'DONE';
}

/**
 * Identity smuggling check.
 *
 * A worker that answers with somebody else's identifiers is either confused or
 * hostile, and both are the same problem here. Only fields the result actually
 * declares are compared: requiring every worker to echo four identifiers would
 * be a contract change across the whole relay, and an omitted field is already
 * covered by the caller having bound the read to a specific task.
 */
export function workerResultIdentityErrors(result, expected = {}) {
  const reasonCodes = [];
  for (const field of IDENTITY_FIELDS) {
    const declared = text(result?.[field], 200);
    const wanted = text(expected?.[field], 200);
    if (!declared || !wanted) continue;
    if (declared !== wanted) reasonCodes.push(`worker-result-${field.replace(/Id$/, '-id')}-mismatch`);
  }
  return reasonCodes;
}

function terminalEvidenceErrors(result) {
  const reasonCodes = [];
  if (!text(result?.outcome, 4000)) reasonCodes.push('terminal-result-outcome-required');
  if (!text(result?.decision, 80)) reasonCodes.push('terminal-result-decision-required');

  if (!Array.isArray(result?.changedArtifacts)) {
    reasonCodes.push('terminal-result-changed-artifacts-required');
  }
  if (!Array.isArray(result?.testsActuallyRun)) {
    reasonCodes.push('terminal-result-tests-required');
  }
  if (!Array.isArray(result?.truthTable) || result.truthTable.length === 0) {
    reasonCodes.push('terminal-result-truth-table-required');
  } else if (result.truthTable.length > MAX_TRUTH_ROWS) {
    reasonCodes.push('terminal-result-truth-table-too-large');
  } else {
    const rowsUnsupported = result.truthTable.some(row => !text(row?.claim, 500) || !text(row?.status, 200));
    if (rowsUnsupported) reasonCodes.push('terminal-result-truth-table-rows-unsupported');
  }

  // Changing artifacts without running anything is the cheapest way to claim
  // work that was never verified, so it is refused specifically.
  if (Array.isArray(result?.changedArtifacts) && result.changedArtifacts.length > 0
    && Array.isArray(result?.testsActuallyRun) && result.testsActuallyRun.length === 0) {
    reasonCodes.push('terminal-result-changed-artifacts-without-tests');
  }
  return reasonCodes;
}

/**
 * @returns {{ok: boolean, terminal: boolean, policyVersion: string, reasonCodes: string[]}}
 */
export function evaluateWorkerResultTruth({ result, expected = {} } = {}) {
  const envelope = validResult(result);
  const identity = workerResultIdentityErrors(result, expected);
  const terminal = declaresTerminal(result);
  const evidence = terminal ? terminalEvidenceErrors(result) : [];
  const reasonCodes = [...new Set([...envelope, ...identity, ...evidence])];
  return {
    ok: reasonCodes.length === 0,
    terminal,
    policyVersion: WORKER_RESULT_TRUTH_POLICY_VERSION,
    reasonCodes
  };
}
