import { createHash } from 'node:crypto';
import {
  EXPECTED_RELAY_PROJECT_ID,
  EXPECTED_RELAY_PROJECT_NAME,
  EXPECTED_RELAY_TEAM_ID
} from './relay-deployment-eligibility.mjs';

export const RELAY_DEPLOYMENT_ATTEMPT_POLICY_VERSION = 'relay-deployment-attempt-1.0.0';

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function at(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function result(status, reasons, detail = {}) {
  return Object.freeze({
    ok: !['REJECTED', 'QUARANTINED'].includes(status),
    policyVersion: RELAY_DEPLOYMENT_ATTEMPT_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasons.filter(Boolean))],
    secondAttemptAuthorized: false,
    productionPromotion: 'BLOCKED',
    truthClassification: 'INTERFACE_ONLY',
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...detail
  });
}

function exactProject(project) {
  return project?.id === EXPECTED_RELAY_PROJECT_ID
    && project?.accountId === EXPECTED_RELAY_TEAM_ID
    && project?.name === EXPECTED_RELAY_PROJECT_NAME;
}

export function compileRelayDeploymentAttemptReceipt({
  eligibilityDecision,
  bundleDigest,
  response = null,
  error = null,
  date = new Date()
} = {}) {
  const attemptedAt = at(date);
  if (!attemptedAt) return result('REJECTED', ['valid-attempt-time-required']);
  if (eligibilityDecision?.status !== 'DEPLOY_PREVIEW_ONCE'
    || eligibilityDecision?.authorizedAttempts !== 1
    || eligibilityDecision?.projectId !== EXPECTED_RELAY_PROJECT_ID
    || eligibilityDecision?.teamId !== EXPECTED_RELAY_TEAM_ID
    || eligibilityDecision?.environment !== 'preview'
    || eligibilityDecision?.productionPromotion !== false) {
    return result('REJECTED', ['one-preview-attempt-eligibility-required']);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(bundleDigest || ''))) {
    return result('REJECTED', ['tested-bundle-digest-required']);
  }

  const base = {
    attemptedAt,
    projectId: EXPECTED_RELAY_PROJECT_ID,
    teamId: EXPECTED_RELAY_TEAM_ID,
    projectName: EXPECTED_RELAY_PROJECT_NAME,
    environment: 'preview',
    bundleDigest: String(bundleDigest).toLowerCase(),
    attemptsConsumed: 1
  };
  if (response && error) return result('REJECTED', ['response-error-contradiction'], base);
  if (response) {
    const deploymentId = String(response.id || '').trim();
    const url = String(response.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)
      || !/^[a-z0-9-]+\.vercel\.app$/i.test(url)
      || String(response.environment || '').toLowerCase() !== 'preview') {
      return result('ATTEMPT_UNCERTAIN_RECONCILE_ONLY', ['deployment-response-invalid'], {
        ...base,
        attemptId: `relay-deploy-attempt:${digest(base)}`
      });
    }
    const accepted = { ...base, deploymentId, url: `https://${url}` };
    return result('ATTEMPT_ACCEPTED_VERIFY', ['endpoint-verification-required'], {
      ...accepted,
      attemptId: `relay-deploy-attempt:${digest(accepted)}`,
      externalEffectLedger: { ...ZERO_EFFECTS, deployments: 1 }
    });
  }
  if (error) {
    const code = String(error.code || '').toUpperCase();
    const knownQuota = ['RATE_LIMITED', 'QUOTA_EXCEEDED', 'DEPLOYMENT_QUOTA_EXCEEDED'].includes(code);
    return result(
      knownQuota ? 'ATTEMPT_BLOCKED_NO_RETRY_THIS_RUN' : 'ATTEMPT_UNCERTAIN_RECONCILE_ONLY',
      [knownQuota ? 'deployment-quota-blocked' : 'unknown-deployment-outcome'],
      { ...base, errorCode: code || 'UNKNOWN', attemptId: `relay-deploy-attempt:${digest({ ...base, code })}` }
    );
  }
  return result('REJECTED', ['deployment-response-or-error-required'], base);
}

export function reconcileRelayDeploymentAttempt({ attemptReceipt, project, deployments, date = new Date() } = {}) {
  const observedAt = at(date);
  if (!observedAt) return result('REJECTED', ['valid-observation-time-required']);
  if (!attemptReceipt || attemptReceipt.attemptsConsumed !== 1 || attemptReceipt.secondAttemptAuthorized !== false) {
    return result('REJECTED', ['valid-attempt-receipt-required'], { observedAt });
  }
  if (!exactProject(project)) return result('QUARANTINED', ['exact-relay-project-identity-required'], { observedAt });
  const rows = Array.isArray(deployments) ? deployments : [];
  if (rows.length > 1) return result('QUARANTINED', ['multiple-deployments-observed'], { observedAt, deploymentCount: rows.length });

  if (attemptReceipt.status === 'ATTEMPT_BLOCKED_NO_RETRY_THIS_RUN') {
    return rows.length === 0
      ? result('STOP_NO_SECOND_ATTEMPT', ['quota-block-confirmed-no-deployment'], { observedAt, deploymentCount: 0 })
      : result('QUARANTINED', ['deployment-exists-after-blocked-response'], { observedAt, deploymentCount: rows.length });
  }

  const deployment = rows[0] || null;
  if (!deployment) {
    return result('QUARANTINED', ['deployment-not-observable-unknown-outcome'], { observedAt, deploymentCount: 0 });
  }
  if (attemptReceipt.deploymentId && deployment.id !== attemptReceipt.deploymentId) {
    return result('QUARANTINED', ['deployment-id-mismatch'], { observedAt, deploymentCount: 1 });
  }
  const environment = String(deployment.environment || deployment.target || '').toLowerCase();
  if (environment && environment !== 'preview') {
    return result('QUARANTINED', ['non-preview-deployment-observed'], { observedAt, deploymentCount: 1 });
  }
  const state = String(deployment.state || deployment.readyState || '').toUpperCase();
  if (state === 'READY') {
    return result('VERIFY_ENDPOINTS', ['two-endpoint-proof-required'], {
      observedAt,
      deploymentCount: 1,
      deploymentId: deployment.id,
      url: deployment.url ? `https://${String(deployment.url).replace(/^https?:\/\//, '')}` : null
    });
  }
  if (['ERROR', 'CANCELED', 'CANCELLED'].includes(state)) {
    return result('STOP_REPAIR_REQUIRED', ['deployment-terminal-failure'], { observedAt, deploymentCount: 1, deploymentId: deployment.id });
  }
  return result('WAIT_NO_RETRY', ['deployment-not-terminal'], { observedAt, deploymentCount: 1, deploymentId: deployment.id, deploymentState: state || 'UNKNOWN' });
}
