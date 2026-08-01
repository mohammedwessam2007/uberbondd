// Premerge audit P1-004 (evidence independence). A raw count of sourceEvidence rows is
// insufficient to prove three materially independent sources -- three mirrors of one vendor's
// press release, or three pages crawled from one syndication network, can otherwise fake a
// three-source gate. Every sourceEvidence row now carries (migrations/008_canon_v3_integration.sql)
// a sourceFamily (the publishing organization's own stable identity -- e.g. its normalized root
// domain, or an explicit vendor/publisher id when evidence is syndicated under multiple domains)
// and a claimOrigin (the underlying claim's own identity, so two pages restating the exact same
// claim -- e.g. two syndicated copies of one press release -- never count as two independent
// observations of two different things).
import { normalizeDomain } from './utils.mjs';

/** Falls back to the evidence's own source domain when sourceFamily is not explicitly set --
 * strictly more conservative than V3's independentEvidenceCount (which fell back the same way but
 * had no claimOrigin dimension at all, so re-crawls of the same claim from the same family could
 * still inflate the count). */
function familyOf(evidence) {
  return String(evidence.sourceFamily || normalizeDomain(evidence.sourceUrl || evidence.organizationDomain || '') || '').trim().toLowerCase();
}

function claimOf(evidence) {
  return String(evidence.claimOrigin || evidence.contentHash || '').trim().toLowerCase();
}

/** Counts materially independent evidence: distinct (sourceFamily, claimOrigin) pairs collapsed by
 * sourceFamily alone (two different claims from the same family are still only one family's worth
 * of independence -- the P0/P1 concern here is about who is vouching for the claim, not how many
 * claims one publisher makes). */
export function independentSourceFamilies(evidence = []) {
  const families = new Set();
  for (const item of evidence) {
    const family = familyOf(item);
    if (family) families.add(family);
  }
  return families;
}

export function assessEvidenceIndependence(evidence = [], { minimumIndependentFamilies = 3 } = {}) {
  const families = independentSourceFamilies(evidence);
  const claims = new Set(evidence.map(claimOf).filter(Boolean));
  return {
    independentFamilyCount: families.size,
    distinctClaimCount: claims.size,
    materiallyIndependent: families.size >= minimumIndependentFamilies,
    families: [...families]
  };
}
