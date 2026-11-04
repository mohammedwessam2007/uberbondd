import { types as nodeTypes } from 'node:util';

/**
 * Read-only evidence quality gate for a Railway nonproduction rehearsal.
 * It NEVER grants deploy/spend authority. No provider calls or secret reads.
 * Inputs are operator-supplied assertions, not independently verified facts.
 */
export const EXPECTED_WORKSPACE = '2b588eed-7a03-4e44-8f90-fdec83447c98';
export const EXPECTED_REPOSITORY = 'mohammedwessam2007/uberbondd';
export const EXPECTED_NEON_PROJECT = 'misty-moon-35132124';
export const EXPECTED_NEON_BRANCH = 'br-orange-wave-baqrfil7';
// Only the explicitly reviewed, least-privilege application role name may be
// represented as verified. A role name alone never proves SQL grants.
const ALLOWED_NEON_READONLY_ROLES = new Set(['uberbond_readonly']);
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
  'outboundDisabled', 'neonPgVersion', 'neonProjectId', 'neonBranchId',
  'neonDatabaseName', 'neonSourceParityVerified', 'neonRoleName', 'neonRoleScopeVerified',
  'neonReadOnlyRoleVerified',
  'originalKeyReferenceOnly', 'secretValueObserved',
  'neonFreePlanVerified', 'neonUsageReadFromAuthenticatedProvider',
  'neonMonthlyCuHourAllowance', 'neonUsedCuHours', 'neonComputeTimeSeconds', 'neonProjectedCuHours',
  'neonHealthProbeDatabaseFree'
]);
const SECRET_KEY = /(?:^|_)(?:password|passphrase|passwd|secret|token|api_key|private_key|database_url|connection_string|credential|credentials|authorization|cookie|dsn)(?:$|_)/;
const money = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const sha = s => typeof s === 'string' && /^[a-f0-9]{40}$/.test(s);
const plain = o => o !== null && typeof o === 'object' && !Array.isArray(o) &&
  (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);

// Snapshot descriptor values once. Never read the original untrusted object
// after shape validation: a Proxy's get trap can lie about billing/plan facts.
function evidenceSnapshot(o) {
  const values = Object.create(null);
  for (const key of Reflect.ownKeys(o)) {
    if (typeof key !== 'string') return { problem: 'UNEXPECTED_EVIDENCE_FIELD' };
    if (!EVIDENCE_FIELDS.has(key)) {
      const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      return { problem: SECRET_KEY.test(normalized) ? 'SECRET_BEARING_INPUT_REFUSED' : 'UNEXPECTED_EVIDENCE_FIELD' };
    }
    const descriptor = Object.getOwnPropertyDescriptor(o, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return { problem: 'ACCESSOR_EVIDENCE_FIELD_REFUSED' };
    if (descriptor.value !== null && typeof descriptor.value === 'object') return { problem: 'NESTED_EVIDENCE_FIELD_REFUSED' };
    values[key] = descriptor.value;
  }
  return { problem: null, values: Object.freeze(values) };
}

export function assessRailwayZeroSpendEvidence(evidence, { now = Date.now(), expectedSha } = {}) {
  const reasons = [];
  const refuse = code => reasons.push(code);
  try {
    // A Proxy can forge ownKeys and property descriptors, not just get traps.
    // Node's native isProxy check does not invoke attacker-controlled traps.
    if (nodeTypes.isProxy(evidence)) {
      refuse('PROXY_EVIDENCE_OBJECT_REFUSED');
    } else if (!plain(evidence)) {
      refuse('EVIDENCE_OBJECT_REQUIRED');
    } else {
    const snapshot = evidenceSnapshot(evidence);
    const shapeProblem = snapshot.problem;
    if (shapeProblem) {
      refuse(shapeProblem);
    } else {
      // Inherited fields must never count as authenticated account snapshot.values.
      if ([...EVIDENCE_FIELDS].some(key => key !== 'projectId' && !Object.hasOwn(snapshot.values, key))) {
        refuse('MISSING_OWN_EVIDENCE_FIELD');
      }
      if (snapshot.values.workspaceId !== EXPECTED_WORKSPACE) refuse('WRONG_WORKSPACE');
      if (snapshot.values.repository !== EXPECTED_REPOSITORY) refuse('WRONG_REPOSITORY');
      if (!sha(expectedSha) || !sha(snapshot.values.sourceSha) || snapshot.values.sourceSha !== expectedSha) refuse('UNPINNED_OR_STALE_SOURCE');
      if (OLD_PROJECTS.has(snapshot.values.projectId)) refuse('FAILED_HISTORICAL_PROJECT_NOT_SOURCE');
      if (snapshot.values.projectId !== null && snapshot.values.projectId !== undefined &&
          (typeof snapshot.values.projectId !== 'string' || !/^[0-9a-f-]{36}$/.test(snapshot.values.projectId))) refuse('INVALID_PROJECT_ID');
      const observed = typeof snapshot.values.observedAt === 'string' ? Date.parse(snapshot.values.observedAt) : NaN;
      if (typeof snapshot.values.observedAt !== 'string' || !Number.isFinite(observed) ||
          !Number.isFinite(now) || observed > now + 5 * 60_000 || now - observed > 60 * 60_000) {
        refuse('STALE_OR_INVALID_ACCOUNT_EVIDENCE');
      }
      if (snapshot.values.billingReadFromAuthenticatedProvider !== true ||
          typeof snapshot.values.billingEvidenceRef !== 'string' ||
          !/^provider-read:\/\/[a-z0-9-]{8,100}$/.test(snapshot.values.billingEvidenceRef)) {
        refuse('AUTHENTICATED_BILLING_RECEIPT_REQUIRED');
      }
      if (snapshot.values.plan !== 'Free' || snapshot.values.planActive !== true || snapshot.values.projectCreationPermitted !== true) {
        refuse('FREE_PLAN_NOT_ACTIVATED');
      }
      if (// Railway Free after trial includes $1/month of resource credit, not an
          // arbitrary provider-asserted balance. Reject impossible Free claims.
          !money(snapshot.values.remainingCreditUsd) || snapshot.values.remainingCreditUsd > 1 ||
          !money(snapshot.values.projectedWorstCaseUsd) ||
          !money(snapshot.values.existingUsageUsd) ||
          snapshot.values.projectedWorstCaseUsd + snapshot.values.existingUsageUsd + 0.25 > snapshot.values.remainingCreditUsd) {
        refuse('CREDIT_MARGIN_NOT_PROVEN');
      }
      if (snapshot.values.zeroOverageEnforcedByProvider !== true) refuse('ZERO_OVERAGE_ENFORCEMENT_UNVERIFIED');
      if (snapshot.values.noNewPaidSubscription !== true || snapshot.values.noBillableVolume !== true ||
          snapshot.values.railwayAgentDisabled !== true) refuse('PAID_RESOURCE_EXPOSURE');
      if (snapshot.values.nonproductionPrivate === true && snapshot.values.publicIngress === false &&
          snapshot.values.webWorkerSeparated === true && snapshot.values.outboundDisabled === true) {
        // All four are required. A provider-attested network check is still required before a real deployment.
      } else refuse('RUNTIME_ISOLATION_UNVERIFIED');
      // Pin the observed PG16 source. Version-only checks could silently accept a
      // different Neon project/branch or a privileged owner role.
      // Database names were observed read-only on 2026-10-25; source parity
      // and scoped role authority still require independent live proof.
      const knownDatabases = new Set([
        'uberbond_phoenix_rehearsal_20261014_v2',
        'uberbond_render_rescue',
        'uberbond_titan_rehearsal_20261014',
        'uberbond_trident_rehearsal_20261013'
      ]);
      if (snapshot.values.neonProjectId !== EXPECTED_NEON_PROJECT ||
          snapshot.values.neonBranchId !== EXPECTED_NEON_BRANCH ||
          !knownDatabases.has(snapshot.values.neonDatabaseName) ||
          snapshot.values.neonSourceParityVerified !== true ||
          typeof snapshot.values.neonRoleName !== 'string' ||
          !/^[a-z][a-z0-9_]{0,62}$/.test(snapshot.values.neonRoleName) ||
          !ALLOWED_NEON_READONLY_ROLES.has(snapshot.values.neonRoleName) ||
          snapshot.values.neonRoleScopeVerified !== true) {
        refuse('NEON_SOURCE_IDENTITY_OR_ROLE_SCOPE_UNVERIFIED');
      }
      if (snapshot.values.neonPgVersion !== 16 || snapshot.values.neonReadOnlyRoleVerified !== true ||
          snapshot.values.originalKeyReferenceOnly !== true || snapshot.values.secretValueObserved !== false) {
        refuse('NEON_OR_KEY_BOUNDARY_UNVERIFIED');
      }
      // Neon's Free plan has a per-project monthly CU-hour cap. An always-awake
      // 0.25-CU database needs ~180 CU-hours in a 30-day month, exceeding 100.
      // This is a conservative evidence check, NOT a provider quota attestation.
      if (snapshot.values.neonFreePlanVerified !== true ||
          snapshot.values.neonUsageReadFromAuthenticatedProvider !== true ||
          snapshot.values.neonHealthProbeDatabaseFree !== true ||
          snapshot.values.neonMonthlyCuHourAllowance !== 100 ||
          !money(snapshot.values.neonUsedCuHours) || !money(snapshot.values.neonComputeTimeSeconds) ||
          !money(snapshot.values.neonProjectedCuHours) ||
          // Neon project compute_time_seconds is ALREADY CU-weighted seconds.
          // Cross-check the raw provider metric; multiplying by CU size again
          // silently understates Free-plan consumption (Neon usage-calculations).
          Math.abs(snapshot.values.neonUsedCuHours - snapshot.values.neonComputeTimeSeconds / 3600) > 0.01 ||
          snapshot.values.neonUsedCuHours + snapshot.values.neonProjectedCuHours + 5 > 100) {
        refuse('NEON_FREE_COMPUTE_BUDGET_UNVERIFIED');
      }
    }
  }
  } catch {
    // A hostile Proxy or unexpected primitive must never crash the preflight.
    refuse('UNTRUSTED_EVIDENCE_OBJECT_REFUSED');
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
