import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizePublicSkillBody } from './capability-genome-body-import.mjs';

export const CAPABILITY_GENOME_BODY_FETCH_VERSION = 'capability-genome-body-fetch-1.0.0';
const GITHUB_API_ORIGIN = 'https://api.github.com';
const GITHUB_RAW_ORIGIN = 'https://raw.githubusercontent.com';

/**
 * The Git object name for a blob, computed from the bytes rather than read off
 * a response.
 *
 * This is what makes the raw transport below safe to use. The API lane trusts
 * the provider's `sha` field; here the identity is derived from the content in
 * hand, so a substituted body cannot present itself as the pinned one no matter
 * what the server says about it.
 */
export function gitBlobSha1(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buffer.length}\0`), buffer])).digest('hex');
}

const clone = value => structuredClone(value);
const zeroEffects = () => clone(ZERO_EXTERNAL_EFFECTS);
function readEffects(providerCalls = 0) { return { ...zeroEffects(), providerCalls }; }
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    status: 'CAPABILITY_SKILL_BODY_FETCH_DENIED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function sha1(value) { return /^[a-f0-9]{40}$/i.test(String(value || '')); }
function repo(value) { return /^[^/\s]+\/[^/\s]+$/.test(String(value || '')); }
function skillPath(value) {
  const text = String(value || '').replaceAll('\\', '/');
  return text && !text.startsWith('/') && !text.includes('..') && text.split('/').at(-1)?.toUpperCase() === 'SKILL.MD';
}
function encodePath(value) { return String(value).split('/').map(encodeURIComponent).join('/'); }

export async function executeGithubSkillBodyReads({
  requests = [],
  fetchImpl = globalThis.fetch,
  maxProviderCalls = 50,
  maxBodyBytes = 512 * 1024,
  userAgent = 'uberbond-capability-genome/1.0'
} = {}) {
  if (!Array.isArray(requests) || requests.length === 0) return fail(['body-read-requests-required']);
  if (typeof fetchImpl !== 'function') return fail(['fetch-implementation-required']);
  const callCap = Number.isSafeInteger(maxProviderCalls) ? Math.max(1, Math.min(10_000, maxProviderCalls)) : 50;
  const imports = [];
  const receipts = [];
  let providerCalls = 0;

  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index] || {};
    if (!repo(request.repositoryFullName) || !sha1(request.sourceCommit) || !skillPath(request.skillPath)) {
      return fail(['valid-pinned-skill-body-request-required'], { completedImports: imports, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    if (request.expectedGitBlobSha != null && !sha1(request.expectedGitBlobSha)) {
      return fail(['valid-expected-git-blob-sha-required'], { completedImports: imports, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    if (providerCalls >= callCap) {
      return {
        ok: true,
        status: 'SKILL_BODY_PROVIDER_CALL_BUDGET_EXHAUSTED',
        imports,
        receipts,
        providerCalls,
        remainingRequestIndex: index,
        businessEffectAuthority: 'NONE',
        externalEffectLedger: readEffects(providerCalls)
      };
    }

    const [owner, name] = request.repositoryFullName.split('/');
    const url = `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodePath(request.skillPath)}?ref=${encodeURIComponent(request.sourceCommit)}`;
    providerCalls += 1;
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent }
      });
    } catch (error) {
      return fail(['github-skill-body-network-error'], { errorClass: error?.name || 'UNKNOWN', completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    // 403 and 429 are not the same problem and must not carry the same label.
    // GitHub answers an exhausted quota with 429, or with 403 plus
    // x-ratelimit-remaining: 0 or a retry-after header. A 403 with neither is an
    // access decision -- a private repository, or a proxy scoping which
    // repositories this host may read -- and reporting it as a rate limit sends
    // an operator to wait out a clock that will never help them.
    //
    // Both stop without retrying. Only the diagnosis differs, and the diagnosis
    // is the whole value of the message.
    if (response.status === 403 || response.status === 429) {
      const retryAfter = response.headers?.get?.('retry-after') || null;
      const remaining = response.headers?.get?.('x-ratelimit-remaining');
      const quotaExhausted = response.status === 429 || retryAfter != null || remaining === '0';
      return {
        ok: true,
        status: quotaExhausted ? 'SKILL_BODY_RATE_LIMITED_NO_BLIND_RETRY' : 'SKILL_BODY_ACCESS_DENIED_NOT_RATE_LIMITED',
        imports,
        receipts,
        providerCalls,
        ...(quotaExhausted ? { rateLimitedRequestIndex: index } : { accessDeniedRequestIndex: index }),
        httpStatus: response.status,
        retryAfter,
        rateLimitRemaining: remaining ?? null,
        // Named so nobody treats an authorization block as something waiting
        // will clear, and so nobody routes around it either.
        operatorAction: quotaExhausted ? 'WAIT_FOR_QUOTA_RESET_OR_USE_AN_AUTHORIZED_LANE' : 'RESOLVE_READ_AUTHORIZATION_FOR_THIS_REPOSITORY',
        businessEffectAuthority: 'NONE',
        externalEffectLedger: readEffects(providerCalls)
      };
    }
    if (!response.ok) {
      return fail(['github-skill-body-http-error'], { httpStatus: response.status, completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    let body;
    try {
      body = await response.json();
    } catch (error) {
      return fail(['github-skill-body-json-error'], { errorClass: error?.name || 'UNKNOWN', completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    if (body?.type !== 'file' || body?.encoding !== 'base64' || typeof body?.content !== 'string' || !sha1(body?.sha)) {
      return fail(['github-skill-body-file-response-required'], { completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    if (request.expectedGitBlobSha && body.sha.toLowerCase() !== request.expectedGitBlobSha.toLowerCase()) {
      return fail(['git-blob-sha-mismatch'], { expectedGitBlobSha: request.expectedGitBlobSha.toLowerCase(), actualGitBlobSha: body.sha.toLowerCase(), completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }

    let content;
    try {
      const bytes = Buffer.from(body.content.replaceAll('\n', ''), 'base64');
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
      return fail(['utf8-skill-body-required'], { errorClass: error?.name || 'UNKNOWN', completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    const imported = normalizePublicSkillBody({
      repositoryFullName: request.repositoryFullName,
      sourceCommit: request.sourceCommit,
      gitBlobSha: body.sha,
      skillPath: request.skillPath,
      content,
      observedAt: request.observedAt || new Date(),
      declaredLicenseHint: request.declaredLicenseHint ?? null
    }, { maxBodyBytes });
    if (!imported.ok) {
      return fail(imported.reasonCodes || ['skill-body-normalization-failed'], { completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    imports.push(imported);
    receipts.push({
      requestIndex: index,
      repositoryFullName: request.repositoryFullName,
      skillPath: request.skillPath,
      sourceCommit: request.sourceCommit.toLowerCase(),
      gitBlobSha: body.sha.toLowerCase(),
      contentSha256: imported.bodyEvidence.contentSha256,
      byteLength: imported.bodyEvidence.byteLength,
      status: 'PINNED_PUBLIC_SKILL_BODY_READ'
    });
  }

  return {
    ok: true,
    status: 'PINNED_PUBLIC_SKILL_BODY_READS_COMPLETE',
    imports,
    receipts,
    providerCalls,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: readEffects(providerCalls)
  };
}


/**
 * Read pinned public skill bodies over the raw content host.
 *
 * A second transport for the same bytes, not a second trust model. The API lane
 * is preferred because it returns the repository's own blob identity; this one
 * is for hosts where that lane is unavailable -- an access policy scoping which
 * repositories the API may be called for is the case that produced it.
 *
 * The price of not being told the blob identity is that the caller must already
 * know it. `expectedGitBlobSha` is required on every request, and the identity
 * is recomputed here from the received bytes. A read this transport cannot bind
 * to a pinned identity is refused rather than imported, because an unverifiable
 * body is worth less than no body: it would enter the corpus indistinguishable
 * from a verified one.
 */
export async function executePinnedRawSkillBodyReads({
  requests = [],
  fetchImpl = globalThis.fetch,
  maxProviderCalls = 50,
  maxBodyBytes = 512 * 1024,
  userAgent = 'uberbond-capability-genome/1.0'
} = {}) {
  if (!Array.isArray(requests) || requests.length === 0) return fail(['body-read-requests-required']);
  if (typeof fetchImpl !== 'function') return fail(['fetch-implementation-required']);
  const callCap = Number.isSafeInteger(maxProviderCalls) ? Math.max(1, Math.min(10_000, maxProviderCalls)) : 50;
  const imports = [];
  const receipts = [];
  let providerCalls = 0;

  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index] || {};
    if (!repo(request.repositoryFullName) || !sha1(request.sourceCommit) || !skillPath(request.skillPath)) {
      return fail(['valid-pinned-skill-body-request-required'], { completedImports: imports, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    // Not optional here, unlike the API lane. Without it there is nothing to
    // check the bytes against.
    if (!sha1(request.expectedGitBlobSha)) {
      return fail(['expected-git-blob-sha-required-for-raw-transport'], { completedImports: imports, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    if (providerCalls >= callCap) {
      return { ok: true, status: 'SKILL_BODY_PROVIDER_CALL_BUDGET_EXHAUSTED', imports, receipts, providerCalls, remainingRequestIndex: index, businessEffectAuthority: 'NONE', externalEffectLedger: readEffects(providerCalls) };
    }

    const url = `${GITHUB_RAW_ORIGIN}/${request.repositoryFullName}/${request.sourceCommit}/${encodePath(request.skillPath)}`;
    providerCalls += 1;
    let response;
    try {
      response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'text/plain', 'User-Agent': userAgent } });
    } catch (error) {
      return fail(['github-skill-body-network-error'], { errorClass: error?.name || 'UNKNOWN', completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    if (response.status === 403 || response.status === 429) {
      const retryAfter = response.headers?.get?.('retry-after') || null;
      const quotaExhausted = response.status === 429 || retryAfter != null;
      return {
        ok: true,
        status: quotaExhausted ? 'SKILL_BODY_RATE_LIMITED_NO_BLIND_RETRY' : 'SKILL_BODY_ACCESS_DENIED_NOT_RATE_LIMITED',
        imports, receipts, providerCalls,
        ...(quotaExhausted ? { rateLimitedRequestIndex: index } : { accessDeniedRequestIndex: index }),
        httpStatus: response.status, retryAfter,
        operatorAction: quotaExhausted ? 'WAIT_FOR_QUOTA_RESET_OR_USE_AN_AUTHORIZED_LANE' : 'RESOLVE_READ_AUTHORIZATION_FOR_THIS_REPOSITORY',
        businessEffectAuthority: 'NONE',
        externalEffectLedger: readEffects(providerCalls)
      };
    }
    if (!response.ok) {
      return fail(['github-skill-body-http-error'], { httpStatus: response.status, completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }

    let bytes;
    try {
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      return fail(['github-skill-body-read-error'], { errorClass: error?.name || 'UNKNOWN', completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    const actualGitBlobSha = gitBlobSha1(bytes);
    if (actualGitBlobSha !== request.expectedGitBlobSha.toLowerCase()) {
      return fail(['git-blob-sha-mismatch'], { expectedGitBlobSha: request.expectedGitBlobSha.toLowerCase(), actualGitBlobSha, completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    let content;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
      return fail(['utf8-skill-body-required'], { errorClass: error?.name || 'UNKNOWN', completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }

    const imported = normalizePublicSkillBody({
      repositoryFullName: request.repositoryFullName,
      sourceCommit: request.sourceCommit,
      gitBlobSha: actualGitBlobSha,
      skillPath: request.skillPath,
      content,
      observedAt: request.observedAt || new Date(),
      declaredLicenseHint: request.declaredLicenseHint ?? null
    }, { maxBodyBytes });
    if (!imported.ok) {
      return fail(imported.reasonCodes || ['skill-body-normalization-failed'], { completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    if (request.expectedContentSha256 && imported.bodyEvidence.contentSha256 !== String(request.expectedContentSha256).toLowerCase()) {
      return fail(['skill-body-sha256-mismatch'], { expectedSha256: String(request.expectedContentSha256).toLowerCase(), actualSha256: imported.bodyEvidence.contentSha256, completedImports: imports, receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
    }
    imports.push(imported);
    receipts.push({
      requestIndex: index,
      repositoryFullName: request.repositoryFullName,
      skillPath: request.skillPath,
      sourceCommit: request.sourceCommit.toLowerCase(),
      gitBlobSha: actualGitBlobSha,
      contentSha256: imported.bodyEvidence.contentSha256,
      byteLength: imported.bodyEvidence.byteLength,
      // Which lane served these bytes, so provenance survives the read.
      transport: 'GITHUB_RAW_PINNED_COMMIT',
      blobIdentitySource: 'COMPUTED_FROM_RECEIVED_BYTES',
      status: 'PINNED_PUBLIC_SKILL_BODY_READ'
    });
  }

  return { ok: true, status: 'PINNED_PUBLIC_SKILL_BODY_READS_COMPLETE', imports, receipts, providerCalls, transport: 'GITHUB_RAW_PINNED_COMMIT', businessEffectAuthority: 'NONE', externalEffectLedger: readEffects(providerCalls) };
}
