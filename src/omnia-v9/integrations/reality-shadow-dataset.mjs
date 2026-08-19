import { buildReplayScenarios } from './replay-scenarios.mjs';

export const DATASET_LABELS = Object.freeze(['REAL_OPERATIONAL', 'HISTORICAL_OPERATIONAL', 'SYNTHETIC', 'ADVERSARIAL']);

const ADVERSARIAL_ID_PREFIXES = ['forged-signature-', 'mutated-after-signing-', 'evidence-tamper-', 'inconsistent-evidence-'];

/**
 * A scenario is ADVERSARIAL only if it exists to probe deliberate forgery or
 * tampering (a signature from an untrusted key, content mutated after
 * signing, a forged external-evidence reference, evidence mutated after its
 * digest was computed). Everything else in the 188-scenario replay set is a
 * SYNTHETIC edge-case/failure-mode probe, not an attack -- expiry boundaries,
 * tenant mismatches, missing evidence, and the like are ordinary operational
 * situations, not adversaries. This distinction must never be blurred: an
 * inflated adversarial count reads as more security testing than occurred,
 * and an inflated synthetic count hides how much of the suite is genuinely
 * hostile-input testing.
 */
export function classifyDatasetLabel(scenarioId) {
  return ADVERSARIAL_ID_PREFIXES.some(prefix => scenarioId.startsWith(prefix)) ? 'ADVERSARIAL' : 'SYNTHETIC';
}

const CEDAR_INELIGIBLE_CATEGORIES = new Set(['policy', 'constitution', 'unavailable-cedar']);

/**
 * 'policy' scenarios deliberately stub policyAuthorizer to return DENY/REVIEW
 * or a blank policyDigest, to test admitAction's own gating around the
 * authorizer call -- that is a kernel-logic test, not a Cedar test, and
 * substituting the real Cedar authority would silently replace the exact
 * behavior the scenario exists to exercise. 'constitution' scenarios
 * similarly test the blank-constitutionDigest gate. 'unavailable-cedar'
 * scenarios deliberately make policyAuthorizer throw to simulate a real
 * Cedar outage -- substituting a working Cedar authority there would erase
 * the one thing the scenario tests. Every other category uses a plain
 * `() => ({ decision: 'ALLOW' })` stub with real digests, which is safe and
 * meaningful to replace with genuine Cedar evaluation.
 */
export function isCedarSubstitutionEligible(category) {
  return !CEDAR_INELIGIBLE_CATEGORIES.has(category);
}

/**
 * Builds the labeled reality-shadow candidate set from the existing
 * 188-scenario offline replay (src/omnia-v9/integrations/replay-scenarios.mjs),
 * unchanged in shape and count, substituting the real closure-verified Cedar
 * authority (src/omnia-v9/integrations/reality-shadow-cedar.mjs) for every
 * scenario where that substitution doesn't erase the scenario's own point.
 * This is real Cedar wired into shadow/compare admission, per this mission's
 * mandate -- not a mock, and not a duplicate parser.
 */
export function buildLabeledCandidates({ cedarAuthority } = {}) {
  return buildReplayScenarios().map(scenario => {
    const datasetLabel = classifyDatasetLabel(scenario.id);
    const eligible = Boolean(cedarAuthority) && isCedarSubstitutionEligible(scenario.category);
    const build = () => {
      const built = scenario.build();
      if (!eligible) return { ...built, cedarSubstituted: false };
      return {
        context: built.context,
        admissionOptions: {
          ...built.admissionOptions,
          policyAuthorizer: cedarAuthority.policyAuthorizer,
          policyDigest: cedarAuthority.policyDigest,
          constitutionDigest: cedarAuthority.constitutionDigest
        },
        cedarSubstituted: true
      };
    };
    return { id: scenario.id, category: scenario.category, description: scenario.description, legacyEligible: scenario.legacyEligible, datasetLabel, cedarEligible: eligible, build };
  });
}

/**
 * This environment's real UberBond operational store (data/db.sample.json)
 * contains zero prospects, campaigns, reservations, or audit history --
 * verified directly, not assumed (see docs/omnia-v9/V9_REALITY_SHADOW_REPORT.md,
 * "Data availability"). These constants are the true, measured count of
 * resolvable real/historical reality-shadow candidates in this environment.
 * They must never be raised by fabricating leads, creating synthetic
 * prospects labeled as real, or contacting anyone to "increase sample size" --
 * this mission's explicit instruction is to use existing operational
 * artifacts only, and there are none to use here.
 */
export const REAL_OPERATIONAL_SAMPLE_COUNT = 0;
export const HISTORICAL_OPERATIONAL_SAMPLE_COUNT = 0;
export const ZERO_REAL_DATA_REASON = 'data/db.sample.json (this environment\'s only operational data source) has zero prospects, campaigns, reservations, leads, or audit-log entries; there is no real or historical UberBond outbound activity to resolve reality-shadow candidates from.';
