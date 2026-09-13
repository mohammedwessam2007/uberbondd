#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GENESIS_IMPLEMENTATION_EVIDENCE} from '../src/genesis-implementation-evidence-v2.mjs';
import {routeFrontierCapabilityClosures} from '../src/frontier-capability-closure-router.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const receiptPath=path.join(root,'artifacts/capability-genome/genesis-partial-runtime-proof-2026-09-13.json');
let runtimeEvidenceCapabilityIds=[];let runtimeReceiptDigest=null;
if(fs.existsSync(receiptPath)){
  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  if(receipt?.ok===true&&receipt?.status==='GENESIS_PARTIAL_RUNTIME_PROOF_PASSED'&&Array.isArray(receipt.capabilityIds)){
    runtimeEvidenceCapabilityIds=receipt.capabilityIds.map(String);
    runtimeReceiptDigest=receipt.receiptDigest||null;
  }
}
const entries=Object.entries(GENESIS_IMPLEMENTATION_EVIDENCE).map(([id,value])=>({id,...value}));
const partial=entries.filter(row=>row.maturity==='PARTIAL_PRIMITIVE');
const routed=routeFrontierCapabilityClosures({entries:partial,runtimeEvidenceCapabilityIds});
const output={
  ok:routed.ok===true,
  status:routed.ok?'FRONTIER_CAPABILITY_CLOSURE_STATUS_READY':'FRONTIER_CAPABILITY_CLOSURE_STATUS_BLOCKED',
  partialCapabilityCount:partial.length,
  independentRuntimeEvidenceCount:routed.independentRuntimeEvidenceCount,
  runtimeReceiptDigest,
  nextClosureCounts:routed.counts,
  ultimateBoundaryCounts:routed.ultimateCounts,
  internalRuntimeEvidenceIds:routed.queues.internalRuntimeEvidence.map(row=>row.id),
  internalDeepeningIds:routed.queues.internalDeepening.map(row=>row.id),
  intentionallyGatedIds:routed.queues.intentionallyGated.map(row=>row.id),
  externalOrOwnerOnlyIds:routed.queues.externalOrOwnerOnly.map(row=>row.id),
  internallySatisfiedIds:routed.queues.internallySatisfied.map(row=>row.id),
  queuesDigest:routed.queuesDigest,
  externalEffectAuthority:'NONE',
  businessEffectAuthority:'NONE',
  truthBoundary:'READ_ONLY_HEURISTIC_CLOSURE_ROUTER__INDEPENDENT_RUNTIME RECEIPTS DO NOT MUTATE CANONICAL MATURITY, CREATE EXTERNAL PROOF, OR GRANT EFFECT AUTHORITY'
};
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
if(!output.ok)process.exitCode=2;
