export const GITHUB_ACTIONS_SELF_MAINTAINER_AUTHORITY_POLICY_VERSION = 'github-actions-self-maintainer-authority-1.0.0';

const issued = new WeakMap();
const WORKFLOW_PATH = '.github/workflows/uberbond-self-maintainer.yml';

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: GITHUB_ACTIONS_SELF_MAINTAINER_AUTHORITY_POLICY_VERSION,
    status: 'AUTHORITY_BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    authority: null
  };
}

/**
 * Mint BRANCH_AND_PR_ONLY authority only inside the dedicated workflow running
 * from main at the exact base revision it is about to maintain.
 *
 * The autonomous change contract already forbids editing .github/workflows, so
 * candidate code cannot rewrite the authority root that will execute it on the
 * next run. The returned object is additionally process-local branded: copying
 * or reconstructing its fields does not preserve authority.
 */
export function issueGithubActionsSelfMaintainerAuthority({ env = process.env, baseRevision, date = new Date() } = {}) {
  const repository = text(env.GITHUB_REPOSITORY, 300);
  const base = text(baseRevision, 160);
  const sha = text(env.GITHUB_SHA, 160);
  const workflowRef = text(env.GITHUB_WORKFLOW_REF, 1000);
  const expectedWorkflowRef = repository ? `${repository}/${WORKFLOW_PATH}@refs/heads/main` : '';
  const reasons = [];

  if (String(env.GITHUB_ACTIONS || '').toLowerCase() !== 'true') reasons.push('github-actions-runtime-required');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) reasons.push('github-repository-required');
  if (!/^[a-f0-9]{40}$/i.test(base)) reasons.push('exact-base-revision-required');
  if (sha !== base) reasons.push('workflow-sha-must-equal-maintenance-base');
  if (workflowRef !== expectedWorkflowRef) reasons.push('dedicated-main-workflow-ref-required');
  if (!['schedule', 'workflow_dispatch'].includes(String(env.GITHUB_EVENT_NAME || ''))) reasons.push('trusted-workflow-event-required');
  if (!String(env.GITHUB_TOKEN || '')) reasons.push('scoped-github-token-required');
  if (reasons.length) return fail(reasons);

  const now = date instanceof Date ? date : new Date(date || Date.now());
  const expires = new Date(now.getTime() + 30 * 60 * 1000);
  const authority = Object.freeze({
    policyVersion: GITHUB_ACTIONS_SELF_MAINTAINER_AUTHORITY_POLICY_VERSION,
    status: 'AUTHORIZED',
    scope: 'BRANCH_AND_PR_ONLY',
    repository,
    baseRevision: base,
    workflowRef,
    eventName: String(env.GITHUB_EVENT_NAME),
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    evidenceRefs: Object.freeze([`github:${workflowRef}`, `github:commit:${base}`])
  });
  issued.set(authority, { repository, baseRevision: base, expiresAt: expires.getTime() });
  return {
    ok: true,
    policyVersion: GITHUB_ACTIONS_SELF_MAINTAINER_AUTHORITY_POLICY_VERSION,
    status: 'AUTHORITY_ISSUED',
    authority
  };
}

export function validateGithubActionsSelfMaintainerAuthority(authority, { repository, baseRevision, date = new Date() } = {}) {
  const record = authority && typeof authority === 'object' ? issued.get(authority) : null;
  if (!record) return fail(['process-local-workflow-authority-origin-required']);
  const now = date instanceof Date ? date : new Date(date || Date.now());
  const reasons = [];
  if (record.repository !== text(repository, 300)) reasons.push('authority-repository-mismatch');
  if (record.baseRevision !== text(baseRevision, 160)) reasons.push('authority-base-revision-mismatch');
  if (record.expiresAt <= now.getTime()) reasons.push('authority-expired');
  return reasons.length ? fail(reasons) : {
    ok: true,
    policyVersion: GITHUB_ACTIONS_SELF_MAINTAINER_AUTHORITY_POLICY_VERSION,
    status: 'AUTHORITY_VALID',
    scope: 'BRANCH_AND_PR_ONLY'
  };
}
