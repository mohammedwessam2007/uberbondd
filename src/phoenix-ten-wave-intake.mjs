// Evidence-bound bridge from the PHOENIX source snapshot into UberBond's
// existing measured repository candidate corpus. ZERO authorization to
// install, fetch skill bodies, promote, execute or contact customers.
import crypto from 'node:crypto';
import { buildMeasuredRepositoryCorpus } from './capability-genome-harvest.mjs';

export const PHOENIX_MANIFEST_SHA256 = '33f699492ff3d9247b45cde41f2e50d8eb795ed3e1994723f349fe0df796e064';
export const PHOENIX_SNAPSHOT_CANONICAL_SHA256 = 'da0947f762ea54c5d760ef5e8d930606e642f3c07dda6ce28ef86aed967100fe';
const URL_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;
const SHA_RE = /^[a-f0-9]{40}$/;
const zero = () => ({ providerCalls: 0, spendCents: 0, deployments: 0, outreachMessages: 0, credentialChanges: 0 });
const refuse = code => ({ ok: false, status: 'PHOENIX_MEASURED_IMPORT_REFUSED', reasonCodes: [code], promotionAuthority: 'NONE', externalEffects: zero() });

export function importPhoenixPublicHeads({ manifestText, receipt } = {}) {
  if (typeof manifestText !== 'string' || typeof receipt !== 'object' || !receipt || Array.isArray(receipt)) return refuse('MISSING_SOURCE_EVIDENCE');
  const hash = crypto.createHash('sha256').update(manifestText).digest('hex');
  if (hash !== PHOENIX_MANIFEST_SHA256 || receipt.source_manifest_sha256 !== hash) return refuse('MANIFEST_DIGEST_MISMATCH');
  // The historical Git HEADs are evidence, not a mutable user-supplied
  // assertion. Pin the entire observed snapshot, including all 243 SHAs.
  const snapshotHash = crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
  if (snapshotHash !== PHOENIX_SNAPSHOT_CANONICAL_SHA256) return refuse('OBSERVATION_SNAPSHOT_DIGEST_MISMATCH');
  const urls = manifestText.trimEnd().split('\n');
  if (urls.length !== 243 || new Set(urls).size !== 243 || urls.some((x, i) => !URL_RE.test(x) || (i > 0 && x <= urls[i - 1]))) return refuse('MANIFEST_ORDER_OR_IDENTITY_REFUSED');
  if (receipt.schema !== 'uberbond.phoenix.public-head-attestation.v1'
      || receipt.checked !== 243 || receipt.public_head_observed !== 243
      || receipt.no_source_executed !== true || receipt.supplier_promotion !== 'NONE'
      || receipt.license_status !== 'NOT_VERIFIED' || !Array.isArray(receipt.rows)
      || receipt.rows.length !== 243) return refuse('UNTRUSTED_SOURCE_RECEIPT');
  const when = new Date(receipt.observed_at_utc);
  if (typeof receipt.observed_at_utc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}(Z|\+00:00)$/.test(receipt.observed_at_utc) || !Number.isFinite(when.getTime())) return refuse('INVALID_OBSERVATION_TIME');
  const repositories = [];
  for (let i = 0; i < urls.length; i++) {
    const row = receipt.rows[i];
    if (!row || row.index !== i || row.url !== urls[i] || row.status !== 'PUBLIC_HEAD_OBSERVED'
        || !SHA_RE.test(row.head_sha ?? '')
        || (row.symbolic_head !== null && !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(row.symbolic_head ?? '')))
      return refuse('UNVERIFIED_OR_MISALIGNED_PUBLIC_HEAD');
    const [, owner, name] = URL_RE.exec(urls[i]);
    repositories.push({ fullName: owner + '/' + name, htmlUrl: urls[i], private: false, visibility: 'public', archived: false, defaultBranch: row.symbolic_head?.replace('refs/heads/', '') ?? null });
  }
  const canonicalNames = new Set(repositories.map(x => x.fullName.toLowerCase()));
  const canonicalCount = canonicalNames.size;
  // This existing production-grade normalization gives all candidates a
  // canonical identity, metadata hash and UNTRUSTED state.
  const measured = buildMeasuredRepositoryCorpus({
    sourceId: 'github-public-capability-search',
    observedAt: when,
    queryReceipts: [{ query: 'PHOENIX_WAVES_3_TO_10_EXISTING_PUBLIC_HEAD_SNAPSHOT', providerCalls: 0, repositories }]
  });
  if (!measured.ok || measured.manifest?.distinctRepositoryCandidates !== canonicalCount
      || measured.manifest?.approvedCapabilities !== 0 || measured.manifest?.activeCapabilities !== 0
      || measured.manifest?.providerCalls !== 0 || measured.manifest?.rawRepositoryHits !== 243
      || measured.manifest?.duplicateRepositoryHits !== 243 - canonicalCount
      || measured.candidates?.length !== canonicalCount
      || measured.candidates.some(c => c.promotionAuthority !== 'NONE' || c.trustState !== 'UNTRUSTED_REPOSITORY_CANDIDATE'))
    return refuse('BASE_GENOME_IMPORT_DID_NOT_PASS_CONTRACT');
  return {
    ok: true, status: 'PHOENIX_243_MEASURED_REPOSITORY_CANDIDATES',
    sourceSnapshotHash: snapshotHash,
    sourceManifestHash: hash,
    totalSourceUrls: 243, canonicalSupplierIdentities: canonicalCount, caseInsensitiveDuplicateUrls: 243 - canonicalCount,
    upstreamCommitRefs: receipt.rows.map(row => ({ url: row.url, observedHead: row.head_sha, ref: row.symbolic_head })),
    corpus: measured,
    promotionAuthority: 'NONE', executionAuthority: 'NONE', externalEffects: zero()
  };
}
