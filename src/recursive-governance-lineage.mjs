import crypto from 'node:crypto';
import { verifyRecursiveGovernanceChain } from './capability-scaled-security.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const RECURSIVE_GOVERNANCE_LINEAGE_VERSION = 'uberbond.recursive-governance-lineage.v1';

const ZERO = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 500) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const fail = reasons => ({
  ok: false,
  status: 'RECURSIVE_GOVERNANCE_LINEAGE_REFUSED',
  reasonCodes: [...new Set(reasons.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectLedger: ZERO(),
  asiClaim: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'
});

export function verifyRecursiveGovernanceLineage({ generations = [] } = {}) {
  const base = verifyRecursiveGovernanceChain({ generations });
  if (!base?.ok) return fail(['base-recursive-governance-chain-required', ...(base?.reasonCodes || [])]);

  const reasons = [];
  const priorBuilders = new Set();
  const priorApprovers = new Set();
  const rows = (Array.isArray(generations) ? generations : []).map((row, index) => ({
    generationId: text(row?.generationId, 200) || `generation-${index}`,
    proposerId: text(row?.proposerId, 200),
    approverId: text(row?.approverId, 200),
    deployerId: text(row?.deployerId, 200),
    verifierId: text(row?.verifierId, 200),
    monitorId: text(row?.monitorId, 200),
    policyDigest: text(row?.policyDigest, 100)?.toLowerCase() || null,
    policyMutationApproved: row?.policyMutationApproved === true,
    policyAuthorityRef: text(row?.policyAuthorityRef, 500),
    independentPolicyVerifierId: text(row?.independentPolicyVerifierId, 200)
  }));

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (priorBuilders.has(row.verifierId)) reasons.push(`ancestor-builder-cannot-verify-descendant:${row.generationId}`);
    if (priorBuilders.has(row.monitorId)) reasons.push(`ancestor-builder-cannot-monitor-descendant:${row.generationId}`);
    if (priorApprovers.has(row.verifierId)) reasons.push(`ancestor-approver-cannot-be-sole-descendant-verifier:${row.generationId}`);

    if (index > 0) {
      const parent = rows[index - 1];
      if (row.policyDigest !== parent.policyDigest) {
        if (!row.policyMutationApproved || !row.policyAuthorityRef) reasons.push(`policy-mutation-requires-explicit-authority:${row.generationId}`);
        if (!row.independentPolicyVerifierId) reasons.push(`policy-mutation-independent-verifier-required:${row.generationId}`);
        if ([row.proposerId, row.deployerId, parent.proposerId, parent.deployerId].includes(row.independentPolicyVerifierId)) {
          reasons.push(`policy-mutation-verifier-must-be-independent-of-build-lineage:${row.generationId}`);
        }
      }
    }

    priorBuilders.add(row.proposerId);
    priorBuilders.add(row.deployerId);
    priorApprovers.add(row.approverId);
  }

  if (reasons.length) return fail(reasons);

  const lineage = {
    version: RECURSIVE_GOVERNANCE_LINEAGE_VERSION,
    generationIds: rows.map(row => row.generationId),
    policies: rows.map(row => ({ generationId: row.generationId, policyDigest: row.policyDigest })),
    rule: 'A SELF-IMPROVEMENT LINEAGE MAY NOT GRADUALLY TURN ITS BUILDERS INTO ITS OWN INDEPENDENT JUDGES OR CHANGE SECURITY POLICY WITHOUT EXPLICIT AUTHORITY AND AN INDEPENDENT VERIFIER.'
  };

  return {
    ok: true,
    status: 'RECURSIVE_GOVERNANCE_LINEAGE_STRUCTURALLY_VALID',
    baseChainDigest: base.chainDigest,
    lineage,
    lineageDigest: digest(lineage),
    runtimeProof: 'NONE__STRUCTURAL_LINEAGE_ONLY',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: ZERO(),
    asiClaim: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'
  };
}
