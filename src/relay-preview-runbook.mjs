import { createHash } from 'node:crypto';
import { ZERO_EFFECTS } from './cloud-agent-relay.mjs';
import {
  EXPECTED_RELAY_PROJECT_ID,
  EXPECTED_RELAY_PROJECT_NAME,
  EXPECTED_RELAY_TEAM_ID
} from './relay-deployment-eligibility.mjs';

export const RELAY_PREVIEW_RUNBOOK_POLICY_VERSION = 'relay-preview-runbook-1.0.0';

const TERMINAL = new Set(['INTERFACE_PROVEN', 'BLOCKED', 'QUARANTINED', 'REPAIR_REQUIRED']);

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function output(run, patch = {}) {
  const next = {
    ...run,
    ...patch,
    secondAttemptAuthorized: false,
    workerExecution: 'BLOCKED',
    productionPromotion: 'BLOCKED',
    truthClassification: patch.stage === 'INTERFACE_PROVEN' ? 'INTERFACE_ONLY' : 'NOT_LIVE',
    externalEffectLedger: patch.externalEffectLedger || run.externalEffectLedger || { ...ZERO_EFFECTS }
  };
  return Object.freeze(next);
}

function reject(run, reason) {
  return output(run || {
    ok: false,
    policyVersion: RELAY_PREVIEW_RUNBOOK_POLICY_VERSION,
    stage: 'QUARANTINED',
    attemptsConsumed: 0
  }, { ok: false, stage: 'QUARANTINED', reasonCodes: [reason] });
}

export function createRelayPreviewRun({ bundleDigest, resetAt, date = new Date() } = {}) {
  const createdAt = iso(date);
  const quotaResetAt = iso(resetAt);
  if (!createdAt || !quotaResetAt || !/^[a-f0-9]{64}$/i.test(String(bundleDigest || ''))) {
    return reject(null, 'valid-run-input-required');
  }
  const identity = {
    policyVersion: RELAY_PREVIEW_RUNBOOK_POLICY_VERSION,
    projectId: EXPECTED_RELAY_PROJECT_ID,
    teamId: EXPECTED_RELAY_TEAM_ID,
    projectName: EXPECTED_RELAY_PROJECT_NAME,
    bundleDigest: String(bundleDigest).toLowerCase(),
    quotaResetAt
  };
  const stage = Date.parse(createdAt) >= Date.parse(quotaResetAt) ? 'PREFLIGHT_REQUIRED' : 'WAITING_FOR_RESET';
  return output({
    ok: true,
    ...identity,
    runId: `relay-preview-run:${hash(identity)}`,
    stage,
    attemptsConsumed: 0,
    createdAt,
    updatedAt: createdAt,
    reasonCodes: stage === 'WAITING_FOR_RESET' ? ['deployment-window-not-open'] : [],
    requiredNextEvent: stage === 'WAITING_FOR_RESET' ? 'CLOCK_OBSERVED' : 'PREFLIGHT_DECIDED',
    externalEffectLedger: { ...ZERO_EFFECTS }
  });
}

export function advanceRelayPreviewRun({ run, event, date = new Date() } = {}) {
  const updatedAt = iso(date);
  if (!run?.ok || !run.runId || !updatedAt || !event?.type) return reject(run, 'valid-run-event-required');
  if (TERMINAL.has(run.stage)) return reject(run, 'terminal-run-cannot-advance');

  if (run.stage === 'WAITING_FOR_RESET') {
    if (event.type !== 'CLOCK_OBSERVED') return reject(run, 'clock-observation-required');
    if (Date.parse(updatedAt) < Date.parse(run.quotaResetAt)) {
      return output(run, { updatedAt, reasonCodes: ['deployment-window-not-open'] });
    }
    return output(run, { stage: 'PREFLIGHT_REQUIRED', updatedAt, reasonCodes: [], requiredNextEvent: 'PREFLIGHT_DECIDED' });
  }

  if (run.stage === 'PREFLIGHT_REQUIRED') {
    if (event.type !== 'PREFLIGHT_DECIDED') return reject(run, 'preflight-decision-required');
    const d = event.decision;
    if (d?.status === 'WAIT_FOR_QUOTA_RESET') return output(run, { stage: 'WAITING_FOR_RESET', updatedAt, reasonCodes: ['deployment-window-not-open'], requiredNextEvent: 'CLOCK_OBSERVED' });
    if (d?.status === 'ALREADY_DEPLOYED_VERIFY_ONLY') return output(run, { stage: 'RECONCILIATION_REQUIRED', updatedAt, reasonCodes: ['existing-deployment-reconciliation-required'], requiredNextEvent: 'ATTEMPT_RECONCILED' });
    if (d?.status !== 'DEPLOY_PREVIEW_ONCE' || d?.authorizedAttempts !== 1 || run.attemptsConsumed !== 0) return reject(run, 'exact-one-attempt-preflight-required');
    return output(run, { stage: 'ATTEMPT_AUTHORIZED', updatedAt, reasonCodes: [], requiredNextEvent: 'ATTEMPT_RECORDED' });
  }

  if (run.stage === 'ATTEMPT_AUTHORIZED') {
    if (event.type !== 'ATTEMPT_RECORDED') return reject(run, 'attempt-receipt-required');
    const r = event.receipt;
    if (!r || r.attemptsConsumed !== 1 || r.secondAttemptAuthorized !== false) return reject(run, 'valid-one-shot-attempt-receipt-required');
    return output(run, {
      stage: 'RECONCILIATION_REQUIRED', updatedAt, attemptsConsumed: 1,
      attemptId: r.attemptId || null, reasonCodes: [], requiredNextEvent: 'ATTEMPT_RECONCILED',
      externalEffectLedger: r.externalEffectLedger || { ...ZERO_EFFECTS }
    });
  }

  if (run.stage === 'RECONCILIATION_REQUIRED') {
    if (event.type !== 'ATTEMPT_RECONCILED') return reject(run, 'attempt-reconciliation-required');
    const status = event.decision?.status;
    if (status === 'VERIFY_ENDPOINTS') return output(run, { stage: 'ENDPOINT_PROOF_REQUIRED', updatedAt, deploymentId: event.decision.deploymentId, deploymentUrl: event.decision.url, reasonCodes: [], requiredNextEvent: 'ENDPOINTS_PROVEN' });
    if (status === 'WAIT_NO_RETRY') return output(run, { updatedAt, reasonCodes: ['deployment-not-terminal'] });
    if (status === 'STOP_REPAIR_REQUIRED') return output(run, { ok: false, stage: 'REPAIR_REQUIRED', updatedAt, reasonCodes: ['deployment-terminal-failure'] });
    if (status === 'STOP_NO_SECOND_ATTEMPT') return output(run, { ok: false, stage: 'BLOCKED', updatedAt, reasonCodes: ['second-attempt-forbidden'] });
    return output(run, { ok: false, stage: 'QUARANTINED', updatedAt, reasonCodes: ['uncertain-deployment-outcome'] });
  }

  if (run.stage === 'ENDPOINT_PROOF_REQUIRED') {
    if (event.type !== 'ENDPOINTS_PROVEN') return reject(run, 'endpoint-proof-required');
    const receipt = event.receipt;
    const deployment = receipt?.deployment;
    if (receipt?.status !== 'PREVIEW_INTERFACE_PROVEN'
      || receipt?.truthClassification !== 'INTERFACE_ONLY'
      || receipt?.fullDurableRelay !== 'NOT_PROVEN'
      || receipt?.productionPromotion !== 'BLOCKED'
      || deployment?.id !== run.deploymentId
      || deployment?.projectId !== EXPECTED_RELAY_PROJECT_ID
      || deployment?.teamId !== EXPECTED_RELAY_TEAM_ID
      || deployment?.state !== 'READY'
      || deployment?.environment !== 'preview'
      || deployment?.url !== run.deploymentUrl) {
      return reject(run, 'valid-interface-only-receipt-required');
    }
    return output(run, { stage: 'INTERFACE_PROVEN', updatedAt, reasonCodes: [], requiredNextEvent: null, previewReceiptId: receipt.receiptId || null });
  }
  return reject(run, 'unknown-run-stage');
}
