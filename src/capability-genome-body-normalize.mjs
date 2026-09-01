// Turns an imported skill body into a canonical capability record.
//
// This is the link the corpus never had. `normalizePublicSkillBody` observes
// bytes and pins them; `normalizeCapability` validates a capability record;
// `admitCapability` and `transitionCapability` govern promotion. A grep for
// normalizeCapability across src/ found it called only by the admission and
// runtime modules on records a caller had already hand-built. Nothing turned an
// imported body into one, so the corpus reported `capabilityRecordsNormalized:
// 0` not as a backlog but as an absence of any path at all.
//
// Everything here is deterministic and reads an untrusted document. The body is
// a third party's prose about itself, so the design question throughout is not
// "what does this skill do" but "what is this skill claiming, and which of those
// claims are we allowed to act on". The answer is: almost none of them.
//
// Four things the body is never allowed to decide:
//
//   1. Which atoms exist. Atom IDs come from the taxonomy, and a phrase maps to
//      one only through the reviewed evidence table. A body cannot introduce an
//      atom, and prose that matches nothing stays unmapped rather than becoming
//      a new one. Wallbreaker canon states this directly: a semantic capability
//      label is not a Genome atom ID and the mapping is never guessed.
//   2. Its own blast radius. sideEffectClass is read from the taxonomy entry for
//      the matched atom, never from the body. This is the sharpest of the four:
//      admitCapability gates on `sideEffects`, so a body that could declare
//      `messaging.send-authorized-email` as NONE would present itself to the
//      admission layer as harmless.
//   3. Its license. A licence is recognised only from an explicit SPDX
//      identifier. "Complete terms in LICENSE.txt" is a pointer to a licence,
//      not a licence, and resolves to UNKNOWN -- which evaluateLicense maps to
//      REFERENCE_ONLY, blocking exactly the copying that a wrong guess enables.
//   4. Its promotion state. The record is built at DISCOVERED and walked to
//      NORMALIZED through transitionCapability, so the state has a real history
//      entry behind it rather than a literal. The corpus builder then refuses
//      any record not sitting at NORMALIZED, which catches the other direction:
//      a record promoted onward and fed back in as though it were fresh.
//
// What normalization is worth is therefore small and specific: the record now
// exists, is bound to exact bytes, and carries one layer of security evidence.
// STATIC is emitted alone and never alongside SEMANTIC or SANDBOX. admitCapability
// requires all three, so a single regex pass cannot make anything eligible.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizeCapability, normalizeCapabilityAtom, canonicalCapabilityIdentity } from './capability-genome-schema.mjs';
import { transitionCapability } from './capability-genome-admission.mjs';
import { verifyRefetchedSkillBody } from './capability-genome-body-import.mjs';

export const CAPABILITY_GENOME_BODY_NORMALIZE_VERSION = 'capability-genome-body-normalize-1.0.0';
export const ATOM_EVIDENCE_TERMS_SCHEMA = 'uberbond.capability-genome.atom-evidence-terms.v1';

// Only identifiers we can actually read off a declaration. Anything else is
// UNKNOWN, which is a real answer and not a missing one.
const SPDX = Object.freeze({
  MIT: /^mit(?:\s+licen[cs]e)?$/i,
  'APACHE-2.0': /^apache(?:\s+licen[cs]e)?[\s,-]*(?:version\s*)?2(?:\.0)?$/i,
  'BSD-2-CLAUSE': /^bsd[\s-]*2[\s-]*clause$/i,
  'BSD-3-CLAUSE': /^bsd[\s-]*3[\s-]*clause$/i,
  ISC: /^isc(?:\s+licen[cs]e)?$/i,
  'GPL-3.0': /^gpl[\s-]*(?:v)?3(?:\.0)?(?:[\s-]*only)?$/i,
  'AGPL-3.0': /^agpl[\s-]*(?:v)?3(?:\.0)?(?:[\s-]*only)?$/i,
  'CC-BY-4.0': /^cc[\s-]*by[\s-]*4(?:\.0)?$/i
});

const clone = value => structuredClone(value);
const zeroEffects = () => clone(ZERO_EXTERNAL_EFFECTS);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    status: 'CAPABILITY_BODY_NORMALIZATION_DENIED',
    normalizeVersion: CAPABILITY_GENOME_BODY_NORMALIZE_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

/**
 * Read a licence identifier out of a declaration, or admit we cannot.
 *
 * The failure this exists to prevent is a pointer being read as a grant. A hint
 * of "Complete terms in LICENSE.txt" names a file; concluding MIT from it would
 * clear the vendoring gate on a licence nobody has read.
 */
export function resolveDeclaredLicense(declaredLicenseHint) {
  const hint = clean(declaredLicenseHint, 500);
  if (!hint) return { license: 'UNKNOWN', licenseConfidence: 0, basis: 'NO_DECLARATION' };
  for (const [id, pattern] of Object.entries(SPDX)) {
    if (pattern.test(hint)) return { license: id, licenseConfidence: 0.6, basis: 'DECLARED_SPDX_IDENTIFIER', declaredHint: hint };
  }
  return { license: 'UNKNOWN', licenseConfidence: 0, basis: 'DECLARATION_NOT_AN_SPDX_IDENTIFIER', declaredHint: hint };
}

function loadEvidenceTerms(table) {
  if (!table || typeof table !== 'object' || Array.isArray(table)) return { ok: false, reasonCodes: ['atom-evidence-terms-object-required'] };
  if (table.schemaVersion !== ATOM_EVIDENCE_TERMS_SCHEMA) return { ok: false, reasonCodes: ['recognized-atom-evidence-terms-schema-required'] };
  const terms = table.terms;
  if (!terms || typeof terms !== 'object' || Array.isArray(terms)) return { ok: false, reasonCodes: ['atom-evidence-terms-map-required'] };
  const loaded = new Map();
  for (const [atomId, phrases] of Object.entries(terms)) {
    if (!Array.isArray(phrases) || phrases.length === 0) return { ok: false, reasonCodes: ['atom-evidence-phrases-required'] };
    const normalized = [];
    for (const phrase of phrases) {
      const value = clean(phrase, 160).toLowerCase();
      // Enforced, not merely stated in the table's own prose. A single common
      // verb -- "search", "send", "route" -- appears in almost any document, so
      // a one-word phrase would mint atoms out of ordinary vocabulary.
      if (!value || value.split(/\s+/).filter(Boolean).length < 2) {
        return { ok: false, reasonCodes: ['multi-word-atom-evidence-phrase-required'], offendingAtomId: atomId, offendingPhrase: value };
      }
      normalized.push(value);
    }
    loaded.set(String(atomId).toLowerCase(), [...new Set(normalized)]);
  }
  return { ok: true, terms: loaded };
}

/**
 * Find which taxonomy atoms an untrusted body claims, and record why.
 *
 * Returns claims, not capabilities. A match means the document contains a
 * reviewed phrase, which is evidence about the text and nothing more. Each match
 * carries the phrase and its offset so the claim can be checked against the
 * bytes by hand.
 */
export function extractClaimedAtoms({ content = '', atoms = [], evidenceTerms = null } = {}) {
  if (typeof content !== 'string' || !content.trim()) return fail(['body-content-required']);
  if (!Array.isArray(atoms) || atoms.length === 0) return fail(['capability-atom-taxonomy-required']);
  const table = loadEvidenceTerms(evidenceTerms);
  if (!table.ok) return fail(table.reasonCodes, { offendingAtomId: table.offendingAtomId, offendingPhrase: table.offendingPhrase });

  const taxonomy = new Map();
  for (const raw of atoms) {
    const result = normalizeCapabilityAtom({ ...raw, inputs: raw?.inputs || [], outputs: raw?.outputs || [] });
    if (!result.ok) return fail(['valid-atom-taxonomy-required'], { offendingAtomId: clean(raw?.id, 200) });
    taxonomy.set(result.atom.id, result.atom);
  }
  // A phrase pointing at an atom the taxonomy does not define is the exact
  // label-to-atom invention the canon forbids, so it fails the whole extraction
  // rather than being skipped quietly.
  for (const atomId of table.terms.keys()) {
    if (!taxonomy.has(atomId)) return fail(['evidence-term-references-unknown-atom'], { offendingAtomId: atomId });
  }

  const haystack = content.toLowerCase();
  const claimed = [];
  for (const [atomId, phrases] of table.terms) {
    const matches = [];
    for (const phrase of phrases) {
      const offset = haystack.indexOf(phrase);
      if (offset !== -1) matches.push({ phrase, offset });
    }
    if (!matches.length) continue;
    const atom = taxonomy.get(atomId);
    claimed.push({
      // Copied from the taxonomy entry, never rebuilt from the body. In
      // particular sideEffectClass: a body cannot describe itself as quieter
      // than the atom it is claiming.
      atom: clone(atom),
      evidence: matches.sort((a, b) => a.offset - b.offset).slice(0, 8),
      claimClass: 'CLAIMED_BY_UNTRUSTED_BODY_NOT_VERIFIED'
    });
  }
  claimed.sort((a, b) => a.atom.id.localeCompare(b.atom.id));
  return {
    ok: true,
    status: claimed.length ? 'ATOM_CLAIMS_EXTRACTED' : 'NO_TAXONOMY_ATOM_MATCHED',
    claimedAtoms: claimed,
    matchedAtomIds: claimed.map(item => item.atom.id),
    // Zero matches is a result, not an error. It says the taxonomy has no
    // vocabulary for this body, which is worth knowing precisely because the
    // alternative -- inventing one -- is what the canon forbids.
    taxonomyCoverage: claimed.length ? 'PARTIAL_OR_FULL_MATCH' : 'NO_TAXONOMY_ATOM_MATCHED',
    extractionDigest: digest({ ids: claimed.map(item => item.atom.id), contentDigest: digest(content) }),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

/**
 * Build the canonical capability record for one verified skill body.
 *
 * @param {object} options
 * @param {object} options.bodyEvidence        from normalizePublicSkillBody
 * @param {string} options.content             the exact bytes the evidence pins
 * @param {Array}  options.atoms               the taxonomy
 * @param {object} options.evidenceTerms       the reviewed phrase table
 * @param {Array} [options.declaredUnmappedNeeds] reviewed prose for capability the taxonomy cannot express
 */
export function normalizeSkillBodyIntoCapability({
  bodyEvidence,
  content,
  atoms = [],
  evidenceTerms = null,
  declaredUnmappedNeeds = [],
  now = new Date()
} = {}) {
  if (!bodyEvidence || typeof bodyEvidence !== 'object') return fail(['body-evidence-required']);
  // A record built from bytes the evidence does not pin would attach a
  // capability, a hash and a security decision to a document nobody screened.
  const verified = verifyRefetchedSkillBody({ bodyEvidence, content, gitBlobSha: bodyEvidence.gitBlobSha });
  if (!verified.ok) return fail(['body-content-must-match-pinned-identity', ...(verified.reasonCodes || [])]);

  const screening = bodyEvidence.securityScreening;
  if (!screening?.decision || screening.screenedContentSha256 !== bodyEvidence.contentSha256) {
    return fail(['revision-bound-security-screening-required']);
  }
  if (bodyEvidence.trustState !== 'UNTRUSTED_DISCOVERED' || bodyEvidence.promotionAuthority !== 'NONE') {
    return fail(['untrusted-zero-authority-body-evidence-required']);
  }

  const extraction = extractClaimedAtoms({ content, atoms, evidenceTerms });
  if (!extraction.ok) return fail(extraction.reasonCodes, { offendingAtomId: extraction.offendingAtomId, offendingPhrase: extraction.offendingPhrase });

  const taxonomyIds = new Set(atoms.map(atom => clean(atom?.id, 200).toLowerCase()));
  const unmappedNeeds = [];
  for (const need of Array.isArray(declaredUnmappedNeeds) ? declaredUnmappedNeeds : []) {
    const value = clean(need, 300);
    if (!value) return fail(['nonempty-unmapped-need-required']);
    // A "need" naming an atom that exists is not unmapped -- it is a mapping
    // that was skipped, and letting it through would hide a real atom behind
    // free text where nothing can select on it.
    if (taxonomyIds.has(value.toLowerCase())) return fail(['unmapped-need-names-an-existing-atom'], { offendingNeed: value });
    unmappedNeeds.push(value);
  }

  const claimedAtoms = extraction.claimedAtoms.map(item => item.atom);
  const sideEffects = [...new Set(claimedAtoms.map(atom => atom.sideEffectClass))];
  const licenseResult = resolveDeclaredLicense(bodyEvidence.declaredLicenseHint);
  const [owner] = String(bodyEvidence.repositoryFullName || '').split('/');
  const observedAt = new Date(now);
  if (!Number.isFinite(observedAt.getTime())) return fail(['valid-now-required']);

  const canonicalIdentity = canonicalCapabilityIdentity({
    sourceType: 'SKILL',
    sourceNamespace: bodyEvidence.repositoryFullName,
    sourceName: bodyEvidence.skillPath,
    atomIds: claimedAtoms.map(atom => atom.id)
  });
  if (!canonicalIdentity) return fail(['canonical-identity-derivation-failed']);

  const draft = {
    id: `capability:skill:${String(bodyEvidence.repositoryFullName).toLowerCase()}:${String(bodyEvidence.skillPath).toLowerCase()}`,
    canonicalIdentity,
    aliases: [bodyEvidence.artifactIdentity].filter(Boolean),
    source: { url: bodyEvidence.sourceUrl, repositoryFullName: bodyEvidence.repositoryFullName, skillPath: bodyEvidence.skillPath },
    sourceType: 'SKILL',
    sourceRevision: bodyEvidence.sourceCommit,
    // The bytes themselves, so admitCapability's subjectHash check binds
    // security evidence to this revision and no other.
    sourceHash: bodyEvidence.contentSha256,
    maintainer: { name: owner || bodyEvidence.repositoryFullName, source: 'GITHUB_REPOSITORY_OWNER', identityVerified: false },
    license: licenseResult.license,
    licenseConfidence: licenseResult.licenseConfidence,
    capabilityAtoms: claimedAtoms,
    taskClasses: [],
    inputs: [],
    outputs: [],
    sideEffects: sideEffects.length ? sideEffects : ['NONE'],
    dataClasses: ['PUBLIC'],
    permissions: [],
    credentialRequirements: [],
    networkRequirements: [],
    dependencies: [],
    executionEnvironment: {
      // Named rather than left to be read off the empty lists above. Empty
      // credentialRequirements would otherwise say "needs no credentials",
      // which is a claim nothing here has tested.
      assessment: 'NOT_PERFORMED_AT_NORMALIZATION',
      credentialAndNetworkRequirements: 'UNASSESSED'
    },
    supportedAgents: [],
    supportedModels: [],
    supportedProviders: [],
    knownVulnerabilities: screening.findings?.map(finding => `${finding.code}:${finding.severity}`) || [],
    knownConflicts: [],
    compatibilityEdges: [],
    substitutes: [],
    // STATIC alone, deliberately. admitCapability requires STATIC, SEMANTIC and
    // SANDBOX; emitting three layers from one regex pass would make a body
    // eligible on the strength of a scan that never ran it.
    securityEvidence: [{
      layer: 'STATIC',
      passed: screening.decision === 'STATIC_CLEAR',
      decision: screening.decision,
      findings: clone(screening.findings || []),
      artifactRef: bodyEvidence.artifactIdentity,
      subjectHash: bodyEvidence.contentSha256,
      observedAt: observedAt.toISOString(),
      caveat: screening.caveat
    }],
    promotionState: 'DISCOVERED',
    lastEvaluatedAt: observedAt.toISOString(),
    evidencePointers: [{
      type: 'PINNED_SKILL_BODY',
      ref: bodyEvidence.sourceUrl,
      observedAt: bodyEvidence.observedAt || observedAt.toISOString(),
      digest: bodyEvidence.contentSha256,
      claimClass: 'SOURCE_EVIDENCE'
    }]
  };

  const normalized = normalizeCapability(draft);
  if (!normalized.ok) return fail(['capability-record-normalization-failed', ...(normalized.reasonCodes || [])]);

  // Through the ladder, not around it. transitionCapability writes the history
  // entry, so the record's NORMALIZED state has a transition behind it rather
  // than a literal in this file.
  const promoted = transitionCapability(normalized.capability, 'NORMALIZED', {
    reasonCodes: ['skill-body-normalized-from-pinned-source'],
    evidenceRefs: [bodyEvidence.artifactIdentity],
    now: observedAt
  });
  if (!promoted.ok) return fail(['normalized-state-transition-failed', ...(promoted.reasonCodes || [])]);

  return {
    ok: true,
    status: 'SKILL_BODY_NORMALIZED_INTO_CAPABILITY_RECORD',
    normalizeVersion: CAPABILITY_GENOME_BODY_NORMALIZE_VERSION,
    capability: promoted.capability,
    capabilityDigest: digest(promoted.capability),
    atomClaims: extraction.claimedAtoms,
    taxonomyCoverage: extraction.taxonomyCoverage,
    unmappedCapabilityNeeds: unmappedNeeds,
    license: licenseResult,
    securityScreeningDecision: screening.decision,
    truthBoundary: 'NORMALIZED_MEANS_THE_RECORD_EXISTS_AND_IS_BOUND_TO_EXACT_BYTES__ATOMS_ARE_CLAIMS_NOT_VERIFIED_CAPABILITY__STATIC_SCREENING_IS_NOT_SAFETY__NOT_DEDUPED_NOT_SECURITY_REVIEWED_NOT_ELIGIBLE_NOT_APPROVED_NOT_ACTIVE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

/**
 * Normalize a set of bodies and report what the corpus now actually holds.
 *
 * The counters stay separate for the reason the harvest law gives: a single
 * "normalized" total would let a reader infer approval from a number that only
 * ever meant a record exists.
 */
export function buildNormalizedCapabilityCorpus({ normalizations = [], observedAt = new Date() } = {}) {
  if (!Array.isArray(normalizations) || normalizations.length === 0) return fail(['normalizations-required']);
  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) return fail(['valid-observed-at-required']);
  const byIdentity = new Map();
  for (const item of normalizations) {
    if (!item?.ok || !item?.capability?.canonicalIdentity) return fail(['successful-normalization-required']);
    if (item.capability.promotionState !== 'NORMALIZED') return fail(['normalized-promotion-state-required'], { offendingState: item.capability.promotionState });
    if (byIdentity.has(item.capability.id)) return fail(['duplicate-capability-id-in-corpus'], { offendingId: item.capability.id });
    byIdentity.set(item.capability.id, item);
  }
  const records = [...byIdentity.values()].sort((a, b) => a.capability.id.localeCompare(b.capability.id));
  const atomsCovered = new Set(records.flatMap(item => item.capability.capabilityAtoms.map(atom => atom.id)));
  return {
    ok: true,
    status: 'NORMALIZED_CAPABILITY_CORPUS_BUILT',
    normalizeVersion: CAPABILITY_GENOME_BODY_NORMALIZE_VERSION,
    observedAt: observed.toISOString(),
    capabilityRecordsNormalized: records.length,
    recordsWithNoTaxonomyAtomMatch: records.filter(item => item.taxonomyCoverage === 'NO_TAXONOMY_ATOM_MATCHED').length,
    distinctClaimedAtomIds: [...atomsCovered].sort(),
    unmappedCapabilityNeeds: [...new Set(records.flatMap(item => item.unmappedCapabilityNeeds))].sort(),
    securityQuarantinedRecords: records.filter(item => item.securityScreeningDecision === 'QUARANTINE').length,
    securityReviewRecords: records.filter(item => item.securityScreeningDecision === 'REVIEW').length,
    securityStaticClearRecords: records.filter(item => item.securityScreeningDecision === 'STATIC_CLEAR').length,
    licenseUnknownRecords: records.filter(item => item.capability.license === 'UNKNOWN').length,
    dedupedCapabilities: 0,
    securityReviewedCapabilities: 0,
    eligibleCapabilities: 0,
    approvedCapabilities: 0,
    activeCapabilities: 0,
    capabilities: records.map(item => clone(item.capability)),
    corpusDigest: digest(records.map(item => [item.capability.id, item.capability.sourceHash, item.capability.capabilityAtoms.map(atom => atom.id)])),
    truthBoundary: 'A_NORMALIZED_RECORD_IS_A_TYPED_DESCRIPTION_OF_AN_UNTRUSTED_PUBLIC_DOCUMENT__IT_IS_NOT_DEDUPED_SECURITY_REVIEWED_ELIGIBLE_APPROVED_ACTIVE_INSTALLED_OR_ECONOMICALLY_PROVEN',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
