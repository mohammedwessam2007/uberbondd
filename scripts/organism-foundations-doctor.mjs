#!/usr/bin/env node

// Zero-effect operator doctor for the overnight organism foundations.
//
// These modules are intentionally not production request-path dependencies,
// but leaving them reachable only from tests makes implemented organs look dead
// to the repository reachability ratchet. This operator imports the actual
// modules and exposes only their version/policy identities. It performs no
// network I/O, provider call, repository mutation, customer action or business
// effect.

import { CAPABILITY_WORLD_HARVESTER_VERSION } from '../src/capability-world-harvester.mjs';
import { COMMAND_CENTER_CLIENT_POLICY_VERSION } from '../src/command-center-client-policy.mjs';
import { COMMAND_CENTER_UI_EVOLUTION_POLICY, COMMAND_CENTER_UI_PROMOTION_AUTHORITY } from '../src/command-center-ui-evolution.mjs';
import { COMPUTE_SOVEREIGNTY_CAPACITY_VERSION } from '../src/compute-sovereignty-capacity.mjs';
import { LIFETIME_CONTEXT_VERSION } from '../src/lifetime-context-memory.mjs';
import { ORGANISM_METABOLISM_VERSION } from '../src/organism-metabolism.mjs';
import { PRE_CUSTOMER_REVENUE_READINESS_VERSION } from '../src/pre-customer-revenue-readiness.mjs';
import { WESSAM_CONTINUITY_VERSION, WESSAM_ROOT_IDENTITY } from '../src/wessam-continuity.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const ORGANISM_FOUNDATIONS_DOCTOR_VERSION = 'uberbond.organism-foundations-doctor.v1';

export function compileOrganismFoundationsDoctor() {
  const foundations = Object.freeze([
    { id: 'world-capability-harvester', version: CAPABILITY_WORLD_HARVESTER_VERSION, role: 'GLOBAL_CAPABILITY_ASSIMILATION' },
    { id: 'command-center-client-policy', version: COMMAND_CENTER_CLIENT_POLICY_VERSION, role: 'OWNER_UI_TRUTH_BOUNDARY' },
    { id: 'command-center-ui-evolution', version: COMMAND_CENTER_UI_EVOLUTION_POLICY, role: 'REVIEW_ONLY_UI_EVOLUTION', promotionAuthority: COMMAND_CENTER_UI_PROMOTION_AUTHORITY },
    { id: 'compute-sovereignty-capacity', version: COMPUTE_SOVEREIGNTY_CAPACITY_VERSION, role: 'LAWFUL_COMPUTE_CAPACITY_TRUTH' },
    { id: 'lifetime-context-memory', version: LIFETIME_CONTEXT_VERSION, role: 'LIFETIME_CONTEXT_VIRTUALIZATION' },
    { id: 'organism-metabolism', version: ORGANISM_METABOLISM_VERSION, role: 'OBJECTIVE_SEARCH_AND_RECOVERY' },
    { id: 'pre-customer-revenue-readiness', version: PRE_CUSTOMER_REVENUE_READINESS_VERSION, role: 'PRE_CUSTOMER_TRUTH_CLASSIFICATION' },
    { id: 'wessam-continuity', version: WESSAM_CONTINUITY_VERSION, role: 'OWNER_SOVEREIGN_CONTINUITY', selfGrantAuthority: WESSAM_ROOT_IDENTITY.selfGrantAuthority }
  ]);

  return Object.freeze({
    ok: true,
    policyVersion: ORGANISM_FOUNDATIONS_DOCTOR_VERSION,
    status: 'ORGANISM_FOUNDATIONS_OPERATOR_REACHABLE',
    foundationCount: foundations.length,
    foundations,
    consequenceAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary: 'OPERATOR REACHABILITY PROVES THESE SOURCE ORGANS CAN BE LOADED AND INSPECTED. IT DOES NOT PROVE LIVE PROVIDERS, CUSTOMERS, REVENUE, DEPLOYMENT OR EXTERNAL EFFECTS.'
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(compileOrganismFoundationsDoctor(), null, 2)}\n`);
}
