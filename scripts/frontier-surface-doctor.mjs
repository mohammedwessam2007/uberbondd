#!/usr/bin/env node
// Operator-only reachability surface for internally safe, already operator-eligible
// planning organs. Activation-gated Genome/Open-Model/Frontier modules are
// intentionally not imported here: merely inventorying them must not release the
// reachability gates that protect their meaningful execution paths.

import * as domainPurposePlan from '../src/domain-purpose-plan.mjs';
import * as firstCashCanaryGuard from '../src/first-cash-canary-guard.mjs';
import * as firstCashCanaryPacket from '../src/first-cash-canary-packet.mjs';
import * as founderAbsenceBlockerDoctor from '../src/founder-absence-blocker-doctor.mjs';
import * as leadPathSprintFulfillment from '../src/lead-path-sprint-fulfillment.mjs';
import * as modelProviderDoctor from '../src/model-provider-doctor.mjs';

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const SURFACES = Object.freeze([
  ['domain-purpose-plan', domainPurposePlan],
  ['first-cash-canary-guard', firstCashCanaryGuard],
  ['first-cash-canary-packet', firstCashCanaryPacket],
  ['founder-absence-blocker-doctor', founderAbsenceBlockerDoctor],
  ['lead-path-sprint-fulfillment', leadPathSprintFulfillment],
  ['model-provider-doctor', modelProviderDoctor]
]);

function publicContract(namespace) {
  const exports = Object.keys(namespace).sort();
  return {
    exports,
    functions: exports.filter(name => typeof namespace[name] === 'function'),
    versions: exports.filter(name => /_VERSION$/.test(name)).map(name => ({ name, value: String(namespace[name]) }))
  };
}

export function inspectFrontierSurface() {
  const surfaces = SURFACES.map(([id, namespace]) => ({ id, ...publicContract(namespace) }));
  const invalid = surfaces.filter(surface => surface.exports.length === 0 || surface.functions.length === 0);
  return {
    ok: invalid.length === 0,
    status: invalid.length ? 'FRONTIER_SURFACE_INCOMPLETE' : 'FRONTIER_SURFACE_OPERATOR_REACHABLE',
    surfaceCount: surfaces.length,
    surfaces,
    invalid: invalid.map(item => item.id),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    truthBoundary: 'OPERATOR_IMPORTABILITY_AND_CONTRACT_INVENTORY_ONLY; ACTIVATION_GATED_FRONTIER_GENOME_AND_OPEN_MODEL_MODULES_REMAIN_GATED; NOT_ACTIVATION_PROVIDER_READINESS_CUSTOMER_PROOF_OR_PRODUCTION_AUTHORITY'
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = inspectFrontierSurface();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
