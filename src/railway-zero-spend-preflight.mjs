/**
 * Read-only evidence quality gate for a Railway nonproduction rehearsal.
 * It NEVER grants deploy/spend authority. No provider calls or secret reads.
 * Inputs are operator-supplied assertions, not independently verified facts.
 */
export const EXPECTED_WORKSPACE = '2b588eed-7a03-4e44-8f90-fdec83447c98';
export const EXPECTED_REPOSITORY = 'mohammedwessam2007/uberbondd';
const OLD_PROJECTS = new Set([
  '1048d0ce-ef29-4654-8425-c2d4a9122ff7',
  '41689b51-8922-4246-a095-a2fdd8fe77f3'
]);
// Accept only the documented flat evidence schema. Arbitrary metadata is not a
// safe place for credentials, even when a field name evades a secret regex.
const EVIDENCE_FIELDS = new Set([
  'workspaceId', 'repository', 'sourceSha', 'projectId', 'observedAt',
  'billingReadFromAuthenticatedProvider', 'billingEvidenceRef',
  'plan', 'planActive', 'projectCreationPermitted', 'remainingCreditUsd',
  'existingUsageUsd', 'projectedWorstCaseUsd', 'zeroOverageEnforcedByProvider',
  'noNewPaidSubscription', 'noBillableVolume', 'railwayAgentDisabled',
  'nonproductionPrivate', 'publicIngress', 'webWorkerSeparated',
  'outboundDisabled', 'neonPgVersion', 'neonReadOnlyRoleVerified',
  'originalKeyReferenceOnly', 'secretValueObserved'
]);
const SECRET_KEY = /(?:^|_)(?:password|passphrase|passwd|secret|token|api_key|private_key|database_url|connection_string|credential|credentials|authorization|cookie|dsn)(?:$|_)/;
const money = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const sha = s => typeof s === 'string' && /^[a-f0-9]{40}$/.test(s);
const plain = o => o !== null && typeof o === 'object' && !Array.isArray(o) &&
  (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);

function evidenceShapeProblem(o) {
  for (const [key, value] of Object.entries(o)) {
    if (!EVIDENCE_FIELDS.has(key)) {
      const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      return SECRET_KEY.test(normalized) ? 'SECRET_BEARING_INPUT_REFUSED' : 'UNEXPECTED_EVIDENCE_FIELD';
    }
    if (value !== null && typeof value === 'object') return 'NESTED_EVIDENCE_FIELD_REFUSED';
  }
  return null;
}

export function assessRailwayZeroSpendEvidence(evidence, { now = Date.now(), expectedSha } = {}) {
  const reasons = [];
  const refuse = code => reasons.push(code);
  if (!plain(evidence)) {
    refuse('EVIDENCE_OBJECT_REQUIRED');
  } else {
    const shapeProblem = evidenceShapeProblem(evidence);
    if (shapeProblem) {
      refuse(shapeProblem);
    } else {
      if (evidence.workspaceId !== EXPECTED_WORKSPACE) refuse('WRONG_WORKSPACE');
      if (evidence.repository !== EXPECTED_REPOSITORY) refuse('WRONG_REPOSITORY');
      if (!sha(expectedSha) || !sha(evidence.sourceSha) || evidence.sourceSha !== expectedSha) refuse('UNPINNED_OR_STALE_SOURCE');
      if (OLD_PROJECTS.has(evidence.projectId)) refuse('FAILED_HISTORICAL_PROJECT_NOT_SOURCE');
      if (evidence.projectId !== null && evidence.projectId !== undefined &&
          (typeof evidence.projectId !== 'string' || !/^[0-9a-f-]{36}$/.test(evidence.projectId))) refuse('INVALID_PROJECT_ID');
      const observed = Date.parse(evidence.observedAt);
      if (typeof evidence.observedAt !== 'string' || !Number.isFinite(observed) ||
          !Number.isFinite(now) || observed > now + 5 * 60_000 || now - observed > 60 * 60_000) {
        refuse('STALE_OR_INVALID_ACCOUNT_EVIDENCE');
      }
      if (evidence.billingReadFromAuthenticatedProvider !== true ||
          typeof evidence.billingEvidenceRef !== 'string' ||
          !/^provider-read:\/\/[a-z0-9-]{8,100}$/.test(evidence.billingEvidenceRef)) {
        refuse('AUTHENTICATED_BILLING_RECEIPT_REQUIRED');
      }
      if (evidence.plan !== 'Free' || evidence.planActive !== true || evidence.projectCreationPermitted !== true) {
        refuse('FREE_PLAN_NOT_ACTIVATED');
      }
      if (!money(evidence.remainingCreditUsd) || !money(evidence.projectedWorstCaseUsd) ||
          !money(evidence.existingUsageUsd) ||
          evidence.projectedWorstCaseUsd + evidence.existingUsageUsd + 0.25 > evidence.remainingCreditUsd) {
        refuse('CREDIT_MARGIN_NOT_PROVEN');
      }
      if (evidence.zeroOverageEnforcedByProvider !== true) refuse('ZERO_OVERAGE_ENFORCEMENT_UNVERIFIED');
      if (evidence.noNewPaidSubscription !== true || evidence.noBillableVolume !== true ||
          evidence.railwayAgentDisabled !== true) refuse('PAID_RESOURCE_EXPOSURE');
      if (evidence.nonproductionPrivate === true && evidence.publicIngress === false &&
          evidence.webWorkerSeparated === true && evidence.outboundDisabled === true) {
        // All four are required. A provider-attested network check is still required before a real deployment.
      } else refuse('RUNTIME_ISOLATION_UNVERIFIED');
      if (evidence.neonPgVersion !== 16 || evidence.neonReadOnlyRoleVerified !== true ||
          evidence.originalKeyReferenceOnly !== true || evidence.secretValueObserved !== false) {
        refuse('NEON_OR_KEY_BOUNDARY_UNVERIFIED');
      }
    }
  }
  return Object.freeze({
    status: reasons.length ? 'HOLD' : 'EVIDENCE_COMPLETE_REQUIRES_INDEPENDENT_REVIEW',
    reasons: [...new Set(reasons)],
    evidenceComplete: reasons.length === 0,
    deploymentPermitted: false,
    resourceCreationPermitted: false,
    spendingPermitted: false,
    releaseAuthority: 'NONE',
    independentProviderVerification: 'NOT_ESTABLISHED_BY_THIS_TOOL'
  });
}
