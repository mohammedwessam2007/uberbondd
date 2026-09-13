#!/usr/bin/env node
import {GENESIS_IMPLEMENTATION_EVIDENCE} from '../src/genesis-implementation-evidence-v2.mjs';
import {routeFrontierCapabilityClosures} from '../src/frontier-capability-closure-router.mjs';

const entries=Object.entries(GENESIS_IMPLEMENTATION_EVIDENCE).map(([id,value])=>({id,...value}));
const partial=entries.filter(row=>row.maturity==='PARTIAL_PRIMITIVE');
const routed=routeFrontierCapabilityClosures({entries:partial});
const output={
  ok:routed.ok===true,
  status:routed.ok?'FRONTIER_CAPABILITY_CLOSURE_STATUS_READY':'FRONTIER_CAPABILITY_CLOSURE_STATUS_BLOCKED',
  partialCapabilityCount:partial.length,
  nextClosureCounts:routed.counts,
  ultimateBoundaryCounts:routed.ultimateCounts,
  internalRuntimeEvidenceIds:routed.queues.internalRuntimeEvidence.map(row=>row.id),
  internalDeepeningIds:routed.queues.internalDeepening.map(row=>row.id),
  intentionallyGatedIds:routed.queues.intentionallyGated.map(row=>row.id),
  externalOrOwnerOnlyIds:routed.queues.externalOrOwnerOnly.map(row=>row.id),
  queuesDigest:routed.queuesDigest,
  externalEffectAuthority:'NONE',
  businessEffectAuthority:'NONE',
  truthBoundary:'READ_ONLY_HEURISTIC_CLOSURE_ROUTER__NO_MATURITY_PROMOTION_NO_EXTERNAL_PROOF_CREATION_NO_EFFECT_AUTHORITY'
};
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
if(!output.ok)process.exitCode=2;
