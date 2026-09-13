#!/usr/bin/env node
import {authorityFor,attenuate} from '../src/sovereignty-type-system.mjs';
import {compileDelegationGraph,revokeDelegationSubtree} from '../src/recursive-revocation-graph.mjs';
import {compileProofDag,inspectProofAncestry} from '../src/content-addressed-proof-dag.mjs';
import {compileInstitutionCell} from '../src/institution-cell-compiler.mjs';
import {allocateFounderExceptions} from '../src/founder-exception-market.mjs';
import {selectMinimaxRegretStrategy} from '../src/robust-minimax-strategy.mjs';
import {routeMissingProofs} from '../src/external-proof-router.mjs';
import {buildBillionCapabilityUniversePlan} from '../src/billion-capability-universe.mjs';

const now='2026-09-13T00:00:00Z';
const parent=authorityFor({action:'READ',delegation:{subject:'FOUNDER',actions:['READ'],expiresAt:'2026-09-13T01:00:00Z'},now});
const attenuation=attenuate({parent,actions:['READ'],expiresAt:'2026-09-13T00:30:00Z'});
const graph=compileDelegationGraph({grants:[{id:'root',actions:['READ'],expiresAt:'2026-09-13T01:00:00Z'},{id:'child',parentId:'root',actions:['READ'],expiresAt:'2026-09-13T00:30:00Z'}]});
const revocation=revokeDelegationSubtree({graph,revokeId:'child',revokedAt:now,reason:'doctor'});
const proofDag=compileProofDag({proofs:[{id:'p1',kind:'doctor',evidenceRef:'doctor:proof',parents:[],synthetic:false,sourceClass:'SYSTEM',observed:true}]});
const ancestry=inspectProofAncestry({dag:proofDag,proofId:'p1'});
const cell=compileInstitutionCell({task:{taskClass:'doctor',requiredCapabilities:['check']},candidates:[{id:'code',executorClass:'DETERMINISTIC_CODE',capabilities:['check'],evidenceRefs:['doctor:code'],verified:true,authority:'NONE',latencyMs:1,costUsd:0,founderMinutes:0}]});
const founder=allocateFounderExceptions({exceptions:[]});
const strategy=selectMinimaxRegretStrategy({scenarios:[{id:'base',status:'ESTIMATED'}],strategies:[{id:'hold',outcomes:{base:0},cost:0,reversible:true}]});
const external=routeMissingProofs({requirements:[{id:'source',description:'doctor source proof',proofClass:'SOURCE_INTERNAL',satisfied:true,evidenceRefs:['doctor:source']}]});
const universe=buildBillionCapabilityUniversePlan();

const result={
  ok:[parent,attenuation,graph,revocation,proofDag,ancestry,cell,founder,strategy,external,universe].every(row=>row?.ok===true),
  status:'CONSTITUTIONAL_MARKET_OPERATOR_READY',
  capabilities:{
    attenuationOnlyDelegation:parent.ok&&attenuation.ok,
    recursiveRevocation:revocation.ok,
    proofDag:proofDag.ok&&ancestry.ok,
    institutionCellCompiler:cell.ok,
    mechanismMarket:'EXISTING_GATED_FRONTIER_TASK_TOURNAMENT',
    founderExceptionMarket:founder.ok,
    minimaxRegretPlanner:strategy.ok,
    externalProofRouter:external.ok,
    billionCapabilityUniverse:universe.ok
  },
  externalEffectAuthority:'NONE',
  businessEffectAuthority:'NONE',
  truthBoundary:'READ_ONLY_OPERATOR_DOCTOR__NO_PROVIDER_CALLS_NO_EXTERNAL_EFFECTS_NO_PROMOTION_AUTHORITY__GATED_MECHANISM_MARKET_REMAINS_GATED'
};
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
process.exitCode=result.ok?0:2;
