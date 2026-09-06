#!/usr/bin/env node
// Zero-effect operator reachability for the overnight organism foundations.
// These modules are intentionally inspectable from an operator entry point even
// when they are not appropriate production entry points. Importing them here is
// not activation, authority, provider callability, customer truth, or promotion.

import * as capabilityWorldHarvester from '../src/capability-world-harvester.mjs';
import * as commandCenterClientPolicy from '../src/command-center-client-policy.mjs';
import * as commandCenterUiEvolution from '../src/command-center-ui-evolution.mjs';
import * as computeSovereigntyCapacity from '../src/compute-sovereignty-capacity.mjs';
import * as lifetimeContextMemory from '../src/lifetime-context-memory.mjs';
import * as organismMetabolism from '../src/organism-metabolism.mjs';
import * as preCustomerRevenueReadiness from '../src/pre-customer-revenue-readiness.mjs';
import * as wessamContinuity from '../src/wessam-continuity.mjs';

export const OVERNIGHT_FOUNDATION_DOCTOR_SCHEMA = 'uberbond.overnight-foundations-doctor.v1';

const ZERO = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const FOUNDATIONS = Object.freeze([
  ['capability-world-harvester', capabilityWorldHarvester],
  ['command-center-client-policy', commandCenterClientPolicy],
  ['command-center-ui-evolution', commandCenterUiEvolution],
  ['compute-sovereignty-capacity', computeSovereigntyCapacity],
  ['lifetime-context-memory', lifetimeContextMemory],
  ['organism-metabolism', organismMetabolism],
  ['pre-customer-revenue-readiness', preCustomerRevenueReadiness],
  ['wessam-continuity', wessamContinuity]
]);

export function inspectOvernightFoundations() {
  const modules = FOUNDATIONS.map(([id, namespace]) => {
    const exportedSymbols = Object.keys(namespace).sort();
    return {
      id,
      loadable: exportedSymbols.length > 0,
      exportedSymbolCount: exportedSymbols.length,
      exportedSymbols: exportedSymbols.slice(0, 64)
    };
  });
  const loadable = modules.every(module => module.loadable);
  return {
    ok: loadable,
    schemaVersion: OVERNIGHT_FOUNDATION_DOCTOR_SCHEMA,
    status: loadable ? 'OVERNIGHT_FOUNDATION_OPERATOR_SURFACES_LOADABLE' : 'OVERNIGHT_FOUNDATION_OPERATOR_SURFACE_BLOCKED',
    moduleCount: modules.length,
    modules,
    activationAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO },
    truthBoundary: 'LOADABILITY AND OPERATOR REACHABILITY DO NOT CLAIM PRODUCTION ACTIVATION, LIVE PROVIDER CALLABILITY, COMMERCIAL PROOF, OR CONSEQUENCE AUTHORITY.'
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = inspectOvernightFoundations();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 2;
}
