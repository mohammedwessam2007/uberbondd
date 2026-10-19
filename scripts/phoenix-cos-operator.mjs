#!/usr/bin/env node
// PHOENIX operator bridge for Chat On Steroids Core.
// Executable claims are strictly limited to first-party, pure, zero-effect
// functions. Research entries and unconfigured third-party skills never run.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { inspectNativeCapabilityUniverse, routeNativeCapability } from '../src/native-capability-universe.mjs';
import { selectMinimaxRegretStrategy } from '../src/robust-minimax-strategy.mjs';
import { compileProofDag } from '../src/content-addressed-proof-dag.mjs';
import { allocateFounderExceptions } from '../src/founder-exception-market.mjs';
import { routeMissingProofs } from '../src/external-proof-router.mjs';
import { compileInstitutionCell } from '../src/institution-cell-compiler.mjs';
import { compileDelegationGraph, revokeDelegationSubtree } from '../src/recursive-revocation-graph.mjs';
import { simulateCounterfactualCivilization, formRealityTheories, assessCausalWitness } from '../src/genesis-scientist-deepening.mjs';
import { coevolveEvaluatorEcology, generateFutureRivals, evolveGenesisPolicies } from '../src/genesis-evolution-deepening.mjs';
import { inventBoundedLanguage, compileEconomicDsl, compileCompanyGenomeLanguage } from '../src/genesis-ontology-deepening.mjs';
import { validateExternalCapabilityRegistry } from '../src/external-capability-control-plane.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { getPhoenixWaveStatus, listPhoenixWaveProposals, compilePhoenixProposalMission } from '../src/phoenix-ten-wave-mission-compiler.mjs';
import { inspectNativeCliAuth } from '../src/phoenix-native-cli-health.mjs';
import { verifyObjectiveEscrow } from '../src/phoenix-objective-escrow.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_ARGUMENT_BYTES = 12000;
const allowedExecutors = Object.freeze({
  'proof.compile': compileProofDag,
  'proof.route-missing': routeMissingProofs,
  'founder.exception-prioritize': allocateFounderExceptions,
  'institution.compile-cell': compileInstitutionCell,
  'strategy.minimax-regret': selectMinimaxRegretStrategy,
  'authority.revoke-subtree': ({grants, revokeId, revokedAt, reason}) => {
    const graph=compileDelegationGraph({grants});
    return graph.ok ? revokeDelegationSubtree({graph, revokeId, revokedAt, reason}) : graph;
  },
  'world.simulate-counterfactual': simulateCounterfactualCivilization,
  'theory.form-evidence-bound': formRealityTheories,
  'causal.assess-witness': assessCausalWitness,
  'evaluator.coevolve': coevolveEvaluatorEcology,
  'architecture.generate-rivals': generateFutureRivals,
  'policy.evolve-generations': evolveGenesisPolicies,
  'ontology.invent-language': inventBoundedLanguage,
  'economy.compile-dsl': compileEconomicDsl,
  'company.compile-genome': compileCompanyGenomeLanguage
});
const authority = () => ({
  externalEffectAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
});
const envelope = value => ({ ...authority(), ...value });
const failure = (reason, code = 2) => ({ ...envelope({ok:false, status:'PHOENIX_COS_REFUSED', reason}), exitCode:code });

function bounded(value, max = 200) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
}
function market() {
  return inspectNativeCapabilityUniverse({rootDir:root,sourceRevision:process.env.UBERBOND_SOURCE_SHA || 'WORKTREE'});
}
function input(value) {
  if(!bounded(value, MAX_ARGUMENT_BYTES)) return null;
  try {
    const parsed = JSON.parse(value);
    if(!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch { return null; }
}
function verifyNativeCall(atomId) {
  const state = market();
  if(!state.ok) return {ok:false, reason:'NATIVE_CAPABILITY_MARKET_NOT_HEALTHY'};
  const capability = state.capabilities.find(cap => cap.atomId === atomId);
  if(!capability || capability.promotionState !== 'ACTIVE_NATIVE_ZERO_EFFECT'
    || capability.externalEffectAuthority !== 'NONE'
    || capability.verification?.sandbox?.passed !== true
    || !Array.isArray(capability.sideEffects)
    || capability.sideEffects.length !== 1
    || capability.sideEffects[0] !== 'NONE') return {ok:false,reason:'NATIVE_ATOM_NOT_APPROVED_FOR_LOCAL_EXECUTION'};
  return {ok:true, capability, state};
}
function research(query, limit) {
  const child = spawnSync(process.execPath,
    [resolve(root, 'scripts/phoenix-ten-wave-query.mjs'), query, String(limit)],
    {cwd:root,encoding:'utf8',timeout:40000,maxBuffer:2*1024*1024,
      env:{PATH:process.env.PATH || '/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}});
  if(child.status !== 0 || child.error) return failure('RESEARCH_INDEX_VERIFICATION_FAILED');
  try {
    const result = JSON.parse(child.stdout);
    if(!result.ok || result.status !== 'PHOENIX_SOURCE_LINKED_RESEARCH_ONLY'
       || result.universe !== 1560 || result.promotion_authority !== 'NONE'
       || result.external_effects !== 'NONE'
       || !Array.isArray(result.matches)) return failure('UNTRUSTED_RESEARCH_RESPONSE');
    return envelope({ok:true,status:'RESEARCH_SOURCE_LINKED_NOT_RUNNABLE',research:result});
  } catch { return failure('RESEARCH_RESPONSE_INVALID_JSON'); }
}

export function runPhoenixCosCommand(argv=[]) {
  if(!Array.isArray(argv) || argv.some(a => typeof a !== 'string')) return failure('STRING_ARGUMENTS_REQUIRED');
  const [verb, ...params] = argv;
  if(verb === 'cli-auth' && params.length===0) return inspectNativeCliAuth();
  if(verb === 'objective-escrow-verify' && params.length===1) {
    const payload=input(params[0]);
    return payload ? verifyObjectiveEscrow(payload) : failure('BOUNDED_OBJECTIVE_ESCROW_JSON_REQUIRED');
  }
  if(verb === 'waves' && params.length === 0) return getPhoenixWaveStatus();
  if(verb === 'wave' && params.length >= 1 && params.length <= 3) {
    const [waveArg,offsetArg='0',limitArg='10']=params;
    if(!/^\d+$/.test(waveArg)||!/^\d+$/.test(offsetArg)||!/^\d+$/.test(limitArg))
      return failure('INVALID_WAVE_PAGING_ARGUMENTS');
    return listPhoenixWaveProposals(Number(waveArg),{offset:Number(offsetArg),limit:Number(limitArg)});
  }
  if(verb === 'mission' && params.length===1) return compilePhoenixProposalMission(params[0]);
  if(verb === 'status' && params.length === 0) {
    const native=market();
    const external=validateExternalCapabilityRegistry(JSON.parse(readFileSync(resolve(root, 'artifacts/external-skill-plugin-registry.json'), 'utf8')));
    return envelope({ok:native.ok && external.ok,status:'COS_CAPABILITY_GATEWAY_STATUS',
      native:{active:native.state.active,failed:native.state.failed,sourceDigest:native.universeDigest,
        classification:'ACTIVE_NATIVE_ZERO_EFFECT'},
      registeredExternal:{count:external.registry?.entries?.length ?? 0,
        classification:'REGISTRY_ONLY__HOST_CALLABILITY_UNPROVEN',validated:external.ok},
      research:{count:1560,classification:'SOURCE_INDEXED_RESEARCH_ONLY__NOT_EXECUTABLE',
        verification:'USE_RESEARCH_QUERY_TO_RECHECK_SOURCE'},
      callableLocalAtoms:Object.keys(allowedExecutors), providerCalls:0,
      truthBoundary:'STATUS_AND_LOCAL_EXECUTION_ARE_NOT_VENDOR_INSTALLATION_OR_CLOUD_DEPLOYMENT'});
  }
  if(verb === 'catalog' && params.length === 0) {
    const state=market();
    return state.ok ? envelope({ok:true,status:'COS_NATIVE_CATALOG',count:state.state.active,
      capabilities:state.capabilities.map(c=>({id:c.id,atomId:c.atomId,taskClass:c.taskClass,
        sourceHash:c.sourceHash,classification:c.promotionState,
        callableThroughCos:Object.hasOwn(allowedExecutors,c.atomId)}))}) : failure('NATIVE_MARKET_DEGRADED');
  }
  if(verb === 'route' && params.length === 1 && bounded(params[0])) {
    const state=routeNativeCapability({mission:params[0],universe:market()});
    return state.ok ? envelope({ok:true,status:'COS_READ_ONLY_CAPABILITY_ROUTE',mission:params[0],
      candidates:state.results.slice(0,5).map(r=>({id:r.capability.id,atomId:r.capability.atomId,
        score:r.score,callableThroughCos:Object.hasOwn(allowedExecutors,r.capability.atomId)})),
      retrievalDigest:state.routeDigest}) : failure('NATIVE_ROUTE_UNAVAILABLE');
  }
  if(verb === 'research' && params.length >= 1 && params.length <= 2 && bounded(params[0])) {
    const limit=params.length===2?Number(params[1]):5;
    if(!Number.isSafeInteger(limit)||limit<1||limit>20) return failure('INVALID_RESEARCH_LIMIT');
    return research(params[0],limit);
  }
  if(verb === 'invoke' && params.length === 2) {
    const [atomId, json]=params;
    if(!Object.hasOwn(allowedExecutors,atomId)) return {
      ...failure('UNKNOWN_OR_UNAPPROVED_ATOM'),
      capabilityState:'MISSING_CAPABILITY',
      sourceProposalLink:'phoenix-wave9-0001'
    };
    const payload=input(json);
    if(!payload) return failure('BOUNDED_JSON_OBJECT_REQUIRED');
    // Prevent a single task from consuming unbounded CPU or overwhelming output.
    if(Object.keys(payload).length > 20
       || Object.entries(payload).some(([k,v])=>['steps','rounds','generations','maxActions'].includes(k)
            && (!Number.isSafeInteger(v)||v<0||v>12))
       || Object.values(payload).some(v=>Array.isArray(v)&&v.length>30)
       || Object.values(payload).some(v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length>100))
      return failure('INPUT_BUDGET_EXCEEDED');
    const gate=verifyNativeCall(atomId);
    if(!gate.ok) return failure(gate.reason);
    try {
      const result=allowedExecutors[atomId](payload);
      if(result?.externalEffectAuthority !== 'NONE' || result?.businessEffectAuthority !== 'NONE') return failure('EXECUTOR_EFFECT_BOUNDARY_FAILED');
      return envelope({ok:result.ok===true,status:result.ok?'COS_NATIVE_ATOM_EXECUTED':'COS_NATIVE_ATOM_VALIDATION_REFUSED',
        atomId,sourceHash:gate.capability.sourceHash,classification:'LOCAL_DETERMINISTIC_ZERO_EFFECT',
        result});
    } catch { return failure('NATIVE_EXECUTOR_THROWN'); }
  }
  return failure('UNKNOWN_COMMAND_OR_ARGUMENT_SHAPE');
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let result;
  try { result=runPhoenixCosCommand(process.argv.slice(2)); }
  catch { result=failure('BRIDGE_RUNTIME_FAILURE'); }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.ok) process.exitCode=result.exitCode || 2;
}
