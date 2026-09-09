#!/usr/bin/env node
// Zero-effect reachability surface for pure admission / evidence / governance organs.
//
// These modules are intentionally NOT production entry points and this doctor does
// not call any of their consequence-bearing functions. Its job is narrower: make
// the contracts inspectable from an unattended operator surface, prove they can be
// loaded together, and expose their revision identities without turning capability
// or evidence into authority.

import * as capabilityScaledSecurity from '../src/capability-scaled-security.mjs';
import * as genesisSelfImprovementBridge from '../src/genesis-self-improvement-bridge.mjs';
import * as modelAdaptationAdmission from '../src/model-adaptation-admission.mjs';
import * as operationalWorldResourceAdmission from '../src/operational-world-resource-admission.mjs';
import * as portablePaypalBridge from '../src/portable-paypal-bridge.mjs';
import * as providerNeutralRuntimeAcceptance from '../src/provider-neutral-runtime-acceptance.mjs';
import * as recursiveGovernanceSecurity from '../src/recursive-governance-security.mjs';
import * as recursiveImprovementRetention from '../src/recursive-improvement-retention.mjs';
import * as runtimeEvidenceAttestation from '../src/runtime-evidence-attestation.mjs';
import * as selfImprovementCausalAdmission from '../src/self-improvement-causal-admission.mjs';
import * as systemLevelAsiEvidence from '../src/system-level-asi-evidence.mjs';
import * as worldResourceObservedValue from '../src/world-resource-observed-value.mjs';

const organs = Object.freeze([
  ['capability-scaled-security', capabilityScaledSecurity],
  ['genesis-self-improvement-bridge', genesisSelfImprovementBridge],
  ['model-adaptation-admission', modelAdaptationAdmission],
  ['operational-world-resource-admission', operationalWorldResourceAdmission],
  ['portable-paypal-bridge', portablePaypalBridge],
  ['provider-neutral-runtime-acceptance', providerNeutralRuntimeAcceptance],
  ['recursive-governance-security', recursiveGovernanceSecurity],
  ['recursive-improvement-retention', recursiveImprovementRetention],
  ['runtime-evidence-attestation', runtimeEvidenceAttestation],
  ['self-improvement-causal-admission', selfImprovementCausalAdmission],
  ['system-level-asi-evidence', systemLevelAsiEvidence],
  ['world-resource-observed-value', worldResourceObservedValue]
]);

function revisionIdentity(namespace) {
  const versions = Object.entries(namespace)
    .filter(([key, value]) => /(?:VERSION|STATUS)$/.test(key) && typeof value === 'string')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value }));
  return versions;
}

export function inspectGovernanceOrgans() {
  const rows = organs.map(([id, namespace]) => ({
    id,
    exportedBindings: Object.keys(namespace).length,
    revisionIdentity: revisionIdentity(namespace)
  }));

  const empty = rows.filter(row => row.exportedBindings === 0).map(row => row.id);
  if (empty.length) {
    return {
      ok: false,
      status: 'GOVERNANCE_ORGAN_DOCTOR_REFUSED',
      reasonCodes: ['governance-organ-export-surface-missing'],
      emptyOrgans: empty,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'GOVERNANCE_ORGANS_SOURCE_LOADABLE',
    organCount: rows.length,
    organs: rows,
    executionTruth: 'SOURCE_IMPORT_AND_REVISION_IDENTITY_ONLY',
    runtimeTruth: 'NOT_INFERRED',
    commercialTruth: 'NOT_INFERRED',
    asiTruth: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = inspectGovernanceOrgans();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
}
