#!/usr/bin/env node
// Operator-only reachability surface for internally safe frontier/planning organs.
//
// Reachability is not activation and importability is not consequence authority.
// This doctor deliberately performs no public reads, provider calls, messages,
// payment work, deployment, customer mutation, or model execution. It proves
// that the provider-neutral planning/verification contracts are callable by an
// operator entry point instead of living only in tests.

import * as capabilityExecutionAdmission from '../src/capability-genome-execution-admission.mjs';
import * as domainPurposePlan from '../src/domain-purpose-plan.mjs';
import * as firstCashCanaryGuard from '../src/first-cash-canary-guard.mjs';
import * as firstCashCanaryPacket from '../src/first-cash-canary-packet.mjs';
import * as founderAbsenceBlockerDoctor from '../src/founder-absence-blocker-doctor.mjs';
import * as frontierAbsorptionEngine from '../src/frontier-absorption-engine.mjs';
import * as frontierArtifactVerifier from '../src/frontier-artifact-verifier.mjs';
import * as frontierCapabilityHarvest from '../src/frontier-capability-harvest.mjs';
import * as frontierContextSpine from '../src/frontier-context-spine.mjs';
import * as frontierOperator from '../src/frontier-operator.mjs';
import * as frontierSourceCoverage from '../src/frontier-source-coverage.mjs';
import * as frontierWorkerCompiler from '../src/frontier-worker-compiler.mjs';
import * as leadPathSprintFulfillment from '../src/lead-path-sprint-fulfillment.mjs';
import * as modelProviderDoctor from '../src/model-provider-doctor.mjs';
import * as openModelFoundry from '../src/open-model-foundry.mjs';
import * as openModelRegistryCrawler from '../src/open-model-registry-crawler.mjs';
import * as openModelSourceCoverage from '../src/open-model-source-coverage.mjs';
import * as openModelUniverse from '../src/open-model-universe.mjs';
import * as proposalAcceptanceEngine from '../src/proposal-acceptance-engine.mjs';

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
  ['capability-genome-execution-admission', capabilityExecutionAdmission],
  ['domain-purpose-plan', domainPurposePlan],
  ['first-cash-canary-guard', firstCashCanaryGuard],
  ['first-cash-canary-packet', firstCashCanaryPacket],
  ['founder-absence-blocker-doctor', founderAbsenceBlockerDoctor],
  ['frontier-absorption-engine', frontierAbsorptionEngine],
  ['frontier-artifact-verifier', frontierArtifactVerifier],
  ['frontier-capability-harvest', frontierCapabilityHarvest],
  ['frontier-context-spine', frontierContextSpine],
  ['frontier-operator', frontierOperator],
  ['frontier-source-coverage', frontierSourceCoverage],
  ['frontier-worker-compiler', frontierWorkerCompiler],
  ['lead-path-sprint-fulfillment', leadPathSprintFulfillment],
  ['model-provider-doctor', modelProviderDoctor],
  ['open-model-foundry', openModelFoundry],
  ['open-model-registry-crawler', openModelRegistryCrawler],
  ['open-model-source-coverage', openModelSourceCoverage],
  ['open-model-universe', openModelUniverse],
  ['proposal-acceptance-engine', proposalAcceptanceEngine]
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
    truthBoundary: 'OPERATOR_IMPORTABILITY_AND_CONTRACT_INVENTORY_ONLY; NOT_ACTIVATION_PROVIDER_READINESS_CUSTOMER_PROOF_OR_PRODUCTION_AUTHORITY'
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = inspectFrontierSurface();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
