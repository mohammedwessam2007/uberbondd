import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizePublicSkillBody } from './capability-genome-body-import.mjs';

export const CAPABILITY_GENOME_BODY_FETCH_VERSION = 'capability-genome-body-fetch-1.0.0';
const GITHUB_API_ORIGIN = 'https://api.github.com';

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
    if (response.status === 403 || response.status === 429) {
      return {
        ok: true,
        status: 'SKILL_BODY_RATE_LIMITED_NO_BLIND_RETRY',
        imports,
        receipts,
        providerCalls,
        rateLimitedRequestIndex: index,
        retryAfter: response.headers?.get?.('retry-after') || null,
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
