// Pure preflight for the single authorized UberBond relay preview deployment.
// It never calls Vercel and cannot deploy, promote, alias, or mutate a project.

export const RELAY_DEPLOYMENT_ELIGIBILITY_POLICY_VERSION =
  'relay-deployment-eligibility-1.0.0';
export const EXPECTED_RELAY_PROJECT_ID = 'prj_QTPTlb6JpYN8IyBTgyVrlWgq4ePT';
export const EXPECTED_RELAY_TEAM_ID = 'team_A9LnjIuS5PU0rNetsHMu1N0r';
export const EXPECTED_RELAY_PROJECT_NAME = 'uberbondd-relay';

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function decision(status, reasonCodes, detail = {}) {
  return {
    ok: status !== 'INVALID',
    policyVersion: RELAY_DEPLOYMENT_ELIGIBILITY_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    authorizedAttempts: status === 'DEPLOY_PREVIEW_ONCE' ? 1 : 0,
    productionPromotion: false,
    ...detail
  };
}

export function evaluateRelayDeploymentEligibility({
  project,
  deployments,
  testedBundle,
  resetAt,
  date = new Date()
} = {}) {
  const observedAt = timestamp(date);
  const quotaResetAt = timestamp(resetAt);
  if (!observedAt || !quotaResetAt) {
    return decision('INVALID', ['valid-time-evidence-required'], { observedAt, quotaResetAt });
  }
  if (project?.id !== EXPECTED_RELAY_PROJECT_ID
    || project?.accountId !== EXPECTED_RELAY_TEAM_ID
    || project?.name !== EXPECTED_RELAY_PROJECT_NAME) {
    return decision('INVALID', ['exact-relay-project-identity-required'], { observedAt, quotaResetAt });
  }
  if (!testedBundle?.ok
    || testedBundle.root !== 'relay/'
    || testedBundle.matchedBlobCount !== testedBundle.expectedBlobCount
    || testedBundle.expectedBlobCount < 1
    || testedBundle.failedTests !== 0) {
    return decision('INVALID', ['byte-for-byte-tested-relay-bundle-required'], {
      observedAt,
      quotaResetAt
    });
  }

  const items = Array.isArray(deployments) ? deployments : [];
  if (items.length > 0 || project.latestDeployment) {
    return decision('ALREADY_DEPLOYED_VERIFY_ONLY', ['deployment-already-exists'], {
      observedAt,
      quotaResetAt,
      deploymentCount: items.length
    });
  }
  if (Date.parse(observedAt) < Date.parse(quotaResetAt)) {
    return decision('WAIT_FOR_QUOTA_RESET', ['deployment-window-not-open'], {
      observedAt,
      quotaResetAt,
      remainingMs: Date.parse(quotaResetAt) - Date.parse(observedAt),
      deploymentCount: 0
    });
  }
  return decision('DEPLOY_PREVIEW_ONCE', [], {
    observedAt,
    quotaResetAt,
    projectId: EXPECTED_RELAY_PROJECT_ID,
    teamId: EXPECTED_RELAY_TEAM_ID,
    projectName: EXPECTED_RELAY_PROJECT_NAME,
    environment: 'preview',
    deploymentCount: 0,
    requiredVerification: [
      'deployment-state-READY',
      'GET-health-200-HEALTHY_PARTIAL_ADAPTER',
      'tasks-501-durable-queue-required'
    ],
    truthCeiling: 'INTERFACE_ONLY'
  });
}
