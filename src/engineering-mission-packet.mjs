// The artifact UberBond hands to a coding agent to commission engineering
// safely -- this is how Prometheus proposes work without ever writing
// production code itself outside a governed mission. Only compiles for a
// BUILD or ADAPT decision; every other decision has nothing to commission.
export const ENGINEERING_MISSION_PACKET_POLICY_VERSION = 'engineering-mission-packet-1.0.0';

// lite/ is always forbidden -- this is a hardcoded, non-overridable
// invariant matching every other wave's boundary in this repository, not
// a configurable default a caller could accidentally loosen.
const ALWAYS_FORBIDDEN_PATHS = Object.freeze(['lite/', '.env', '.env.*', 'node_modules/']);

export function compileEngineeringMissionPacket({ upgradeProposal, repositoryContext = {}, date = new Date() } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const timestamp = referenceDate.toISOString();
  if (!upgradeProposal?.ok) {
    return { ok: false, reason: 'malformed-input-upgradeProposal', policyVersion: ENGINEERING_MISSION_PACKET_POLICY_VERSION, timestamp };
  }
  if (!['BUILD', 'ADAPT'].includes(upgradeProposal.decision)) {
    return { ok: false, reason: `not-applicable-for-decision:${upgradeProposal.decision}`, policyVersion: ENGINEERING_MISSION_PACKET_POLICY_VERSION, timestamp };
  }

  return {
    ok: true, policyVersion: ENGINEERING_MISSION_PACKET_POLICY_VERSION, timestamp,
    repositoryContext: { repo: repositoryContext.repo || 'unknown', branch: repositoryContext.branch || 'unknown', headSha: repositoryContext.headSha || 'unknown' },
    missingCapability: upgradeProposal.proposedCapability,
    economicRationale: upgradeProposal.economicRationale,
    expectedFiles: repositoryContext.expectedFiles || [],
    forbiddenPaths: [...new Set([...ALWAYS_FORBIDDEN_PATHS, ...(repositoryContext.additionalForbiddenPaths || [])])],
    tests: upgradeProposal.testPlan,
    rollback: 'Revert the commit(s); no migration or irreversible state change is authorized by this packet alone.',
    proofRequirements: [
      'node --check on every changed/new file.',
      'The full existing deterministic test suite must still pass (zero regressions).',
      'New hostile tests for the changed/new capability.',
      'No new external network call, spend, or credential use without a separate, explicit owner authorization.'
    ],
    successCriteria: [
      `${upgradeProposal.proposedCapability} moves from its current missing/partial status to TEST_VERIFIED in the capability graph.`,
      'All proof requirements above are met.'
    ],
    decision: upgradeProposal.decision,
    buildDistance: upgradeProposal.buildDistance
  };
}
