// Whether the committed constitution still describes the tree it claims to.
//
// artifacts/constitution/directives.json is where the Constitution Doctor's
// headline numbers come from and what the review record is read against, and
// nothing verified it was current. It merged stale once: the artifact committed
// alongside the precedence work was generated before that same change added its
// tests and guards, so it recorded 464 mutation anchors against a tree holding
// 469, and named a test file that no longer existed.
//
// A stale artifact is not merely old. It answers "which rules are enforced?"
// about a tree that has since changed, in the present tense.
//
// This lives in src/ rather than inside the test because a comparison only a
// test performs is a comparison no mutation can be pointed at.

export const CONSTITUTION_ARTIFACT_FRESHNESS_VERSION = 'uberbond.constitution-artifact-freshness.v1';

// Provenance moves on every run by design. Every other field is a claim about
// the source tree and has to match it.
//
// Deliberately exactly two keys. Widening this set is how a freshness check
// stops checking: strip enough and any two artifacts compare equal.
export const PROVENANCE_KEYS = Object.freeze(['sourceSha', 'generatedAt']);

export function stableForComparison(artifact) {
  const provenance = new Set(PROVENANCE_KEYS);
  return JSON.stringify(artifact, (key, value) => (provenance.has(key) ? undefined : value));
}

// Checked before the whole-document comparison, because "469 !== 464" is a
// usable failure message and a diff of 262 directive objects is not.
const HEADLINE_COUNTS = Object.freeze([
  ['mutationAnchorsAvailable', 'the artifact counts a different number of mutation anchors than the tree has'],
  ['directives', 'the artifact counts a different number of directives than the tree compiles'],
  ['withMutationGuard', 'the artifact reports a different guard-backed count than the tree produces'],
  ['externalEffectWithMutationGuard', 'the artifact reports a different guarded external-effect count than the tree produces']
]);

export function compareConstitutionArtifacts(committed, fresh) {
  const differences = [];
  for (const [key, message] of HEADLINE_COUNTS) {
    const a = committed?.counts?.[key];
    const b = fresh?.counts?.[key];
    if (a !== b) differences.push({ field: `counts.${key}`, committed: a, fresh: b, message });
  }
  const documentsMatch = stableForComparison(committed) === stableForComparison(fresh);
  if (!documentsMatch && !differences.length) {
    differences.push({
      field: 'document',
      message: 'the committed constitution differs from what the current tree compiles to, beyond the headline counts'
    });
  }
  return {
    fresh: documentsMatch && differences.length === 0,
    differences,
    remedy: 'Regenerate with npm run constitution:doctor, never by hand.'
  };
}
