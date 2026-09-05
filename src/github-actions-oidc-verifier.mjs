import crypto from 'node:crypto';

export const GITHUB_ACTIONS_OIDC_VERIFIER_POLICY_VERSION = 'github-actions-oidc-verifier-1.0.0';
export const GITHUB_ACTIONS_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_ACTIONS_OIDC_JWKS = 'https://token.actions.githubusercontent.com/.well-known/jwks';
export const SELF_MAINTAINER_OIDC_AUDIENCE = 'uberbond-self-maintainer-proposer-v1';

const EXPECTED_REPOSITORY = 'mohammedwessam2007/uberbondd';
const EXPECTED_REPOSITORY_ID = '1300996174';
const EXPECTED_OWNER_ID = '290769413';
const EXPECTED_WORKFLOW_REF = `${EXPECTED_REPOSITORY}/.github/workflows/uberbond-self-maintainer.yml@refs/heads/main`;
const MAX_TOKEN_BYTES = 32_000;
const MAX_JWKS_BYTES = 256_000;
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_LIFETIME_SECONDS = 20 * 60;

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes, status = 'OIDC_REJECTED') {
  return {
    ok: false,
    policyVersion: GITHUB_ACTIONS_OIDC_VERIFIER_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))]
  };
}

function decodePart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part || '')) throw new Error('jwt-base64url-invalid');
  return Buffer.from(part, 'base64url');
}

function parseJwt(token) {
  const raw = String(token || '');
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_TOKEN_BYTES) return null;
  const parts = raw.split('.');
  if (parts.length !== 3 || parts.some(part => !part)) return null;
  try {
    const header = JSON.parse(decodePart(parts[0]).toString('utf8'));
    const claims = JSON.parse(decodePart(parts[1]).toString('utf8'));
    const signature = decodePart(parts[2]);
    return { header, claims, signature, signingInput: `${parts[0]}.${parts[1]}` };
  } catch {
    return null;
  }
}

async function loadJwks(fetchImpl) {
  const response = await fetchImpl(GITHUB_ACTIONS_OIDC_JWKS, {
    method: 'GET',
    headers: { accept: 'application/json', 'user-agent': 'UberBond-OIDC-Verifier' }
  });
  if (!response?.ok) throw new Error(`github-oidc-jwks-http-${Number(response?.status || 0) || 'unknown'}`);
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_JWKS_BYTES) throw new Error('github-oidc-jwks-too-large');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.keys)) throw new Error('github-oidc-jwks-invalid');
  return parsed.keys;
}

function audienceMatches(aud) {
  if (typeof aud === 'string') return aud === SELF_MAINTAINER_OIDC_AUDIENCE;
  return Array.isArray(aud) && aud.length > 0 && aud.every(item => typeof item === 'string')
    && aud.includes(SELF_MAINTAINER_OIDC_AUDIENCE);
}

export async function verifyGithubActionsOidcToken({
  token,
  expectedSha,
  fetchImpl = globalThis.fetch,
  date = new Date()
} = {}) {
  if (typeof fetchImpl !== 'function') return fail(['fetch-implementation-required']);
  const parsed = parseJwt(token);
  if (!parsed) return fail(['github-oidc-jwt-invalid']);
  const { header, claims, signature, signingInput } = parsed;
  const reasons = [];
  if (header?.alg !== 'RS256') reasons.push('github-oidc-rs256-required');
  if (header?.typ !== 'JWT') reasons.push('github-oidc-jwt-type-required');
  const kid = text(header?.kid, 300);
  if (!kid) reasons.push('github-oidc-kid-required');
  if (reasons.length) return fail(reasons);

  let keys;
  try { keys = await loadJwks(fetchImpl); }
  catch { return fail(['github-oidc-jwks-unavailable']); }
  const jwk = keys.find(key => key?.kid === kid && key?.kty === 'RSA' && (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
  if (!jwk) return fail(['github-oidc-signing-key-not-found']);
  let verified = false;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    verified = crypto.verify('RSA-SHA256', Buffer.from(signingInput), publicKey, signature);
  } catch {
    verified = false;
  }
  if (!verified) return fail(['github-oidc-signature-invalid']);

  const nowMs = (date instanceof Date ? date : new Date(date || Date.now())).getTime();
  if (!Number.isFinite(nowMs)) return fail(['reference-time-invalid']);
  const now = Math.floor(nowMs / 1000);
  const iat = Number(claims?.iat);
  const nbf = Number(claims?.nbf);
  const exp = Number(claims?.exp);
  if (!Number.isFinite(iat) || !Number.isFinite(nbf) || !Number.isFinite(exp)) reasons.push('github-oidc-time-claims-required');
  else {
    if (iat > now + CLOCK_SKEW_SECONDS) reasons.push('github-oidc-issued-in-future');
    if (nbf > now + CLOCK_SKEW_SECONDS) reasons.push('github-oidc-not-yet-valid');
    if (exp < now - CLOCK_SKEW_SECONDS) reasons.push('github-oidc-expired');
    if (exp <= iat || exp - iat > MAX_TOKEN_LIFETIME_SECONDS) reasons.push('github-oidc-lifetime-invalid');
  }

  const sha = text(expectedSha, 80).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) reasons.push('exact-request-sha-required');
  if (claims?.iss !== GITHUB_ACTIONS_OIDC_ISSUER) reasons.push('github-oidc-issuer-mismatch');
  if (!audienceMatches(claims?.aud)) reasons.push('github-oidc-audience-mismatch');
  if (claims?.repository !== EXPECTED_REPOSITORY) reasons.push('github-oidc-repository-mismatch');
  if (String(claims?.repository_id || '') !== EXPECTED_REPOSITORY_ID) reasons.push('github-oidc-repository-id-mismatch');
  if (String(claims?.repository_owner_id || '') !== EXPECTED_OWNER_ID) reasons.push('github-oidc-owner-id-mismatch');
  if (claims?.repository_owner !== 'mohammedwessam2007') reasons.push('github-oidc-owner-mismatch');
  if (claims?.workflow_ref !== EXPECTED_WORKFLOW_REF) reasons.push('github-oidc-dedicated-main-workflow-required');
  if (claims?.ref !== 'refs/heads/main' || claims?.ref_type !== 'branch') reasons.push('github-oidc-main-ref-required');
  if (text(claims?.sha, 80).toLowerCase() !== sha) reasons.push('github-oidc-sha-mismatch');
  if (!['schedule', 'workflow_dispatch'].includes(String(claims?.event_name || ''))) reasons.push('github-oidc-event-not-allowed');
  if (claims?.runner_environment !== 'github-hosted') reasons.push('github-oidc-github-hosted-runner-required');
  if (!text(claims?.jti, 300)) reasons.push('github-oidc-jti-required');
  if (!/^\d+$/.test(String(claims?.run_id || ''))) reasons.push('github-oidc-run-id-required');
  if (reasons.length) return fail(reasons);

  return {
    ok: true,
    policyVersion: GITHUB_ACTIONS_OIDC_VERIFIER_POLICY_VERSION,
    status: 'OIDC_VERIFIED',
    identity: Object.freeze({
      repository: EXPECTED_REPOSITORY,
      repositoryId: EXPECTED_REPOSITORY_ID,
      workflowRef: EXPECTED_WORKFLOW_REF,
      eventName: String(claims.event_name),
      sha,
      runId: String(claims.run_id),
      runAttempt: text(claims?.run_attempt, 40) || null,
      jti: text(claims.jti, 300)
    })
  };
}
