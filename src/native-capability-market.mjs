import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileProofDag, assertObservedProof } from './content-addressed-proof-dag.mjs';
import { routeMissingProofs } from './external-proof-router.mjs';
import { allocateFounderExceptions } from './founder-exception-market.mjs';
import { compileInstitutionCell } from './institution-cell-compiler.mjs';
import { selectMinimaxRegretStrategy } from './robust-minimax-strategy.mjs';
import { compileDelegationGraph, revokeDelegationSubtree } from './recursive-revocation-graph.mjs';

export const NATIVE_CAPABILITY_MARKET_VERSION = 'uberbond.native-capability-market.v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const stableHash = value => hash(JSON.stringify(value));
const envelope = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });

const SPECS = Object.freeze([
  { id: 'native:proof-dag', atomId: 'proof.compile', taskClass: 'PROOF_LINEAGE', sourcePath: 'src/content-addressed-proof-dag.mjs', description: 'Compile content-addressed proof ancestry and preserve synthetic lineage.', probe() { const dag=compileProofDag({proofs:[{id:'raw',kind:'measurement',evidenceRef:'receipt:raw',parents:[],synthetic:false,sourceClass:'OBSERVED',observed:true,verifierRef:'native-market'}]}); const admitted=dag.ok?assertObservedProof({dag,proofId:'raw'}):dag; return {ok:dag.ok===true&&admitted.ok===true,digest:dag.dagDigest,authority:admitted.externalEffectAuthority}; } },
  { id: 'native:external-proof-router', atomId: 'proof.route-missing', taskClass: 'PROOF_ROUTING', sourcePath: 'src/external-proof-router.mjs', description: 'Route missing proof requirements without manufacturing evidence.', probe() { const r=routeMissingProofs({requirements:[{id:'source',description:'source proof',proofClass:'SOURCE_INTERNAL',satisfied:true,evidenceRefs:['receipt:source']} ]}); return {ok:r.ok===true,digest:stableHash(r.routes||r),authority:r.externalEffectAuthority}; } },
  { id: 'native:founder-exception-market', atomId: 'founder.exception-prioritize', taskClass: 'FOUNDER_EXCEPTION_ROUTING', sourcePath: 'src/founder-exception-market.mjs', description: 'Prioritize bounded founder exceptions by leverage and urgency.', probe() { const r=allocateFounderExceptions({exceptions:[{id:'x',founderMinutes:1,expectedValue:10,urgency:1,reversibility:1,blockedMachineMinutes:100}]}); return {ok:r.ok===true,digest:stableHash(r.allocations||r),authority:r.externalEffectAuthority}; } },
  { id: 'native:institution-cell-compiler', atomId: 'institution.compile-cell', taskClass: 'INSTITUTION_COMPILATION', sourcePath: 'src/institution-cell-compiler.mjs', description: 'Compile minimum sufficient bounded institution cells from verified candidates.', probe() { const r=compileInstitutionCell({task:{taskClass:'doctor',requiredCapabilities:['check']},candidates:[{id:'code',executorClass:'DETERMINISTIC_CODE',capabilities:['check'],evidenceRefs:['receipt:code'],verified:true,authority:'NONE',latencyMs:1,costUsd:0,founderMinutes:0}]}); return {ok:r.ok===true,digest:stableHash(r.cell||r),authority:r.externalEffectAuthority}; } },
  { id: 'native:minimax-strategy', atomId: 'strategy.minimax-regret', taskClass: 'ROBUST_STRATEGY', sourcePath: 'src/robust-minimax-strategy.mjs', description: 'Select bounded strategies by minimax regret across explicit scenarios.', probe() { const r=selectMinimaxRegretStrategy({scenarios:[{id:'base',status:'ESTIMATED'}],strategies:[{id:'hold',outcomes:{base:0},cost:0,reversible:true}]}); return {ok:r.ok===true,digest:stableHash(r.selected||r),authority:r.externalEffectAuthority}; } },
  { id: 'native:recursive-revocation', atomId: 'authority.revoke-subtree', taskClass: 'AUTHORITY_REVOCATION', sourcePath: 'src/recursive-revocation-graph.mjs', description: 'Compile and recursively revoke attenuated delegation subtrees.', probe() { const graph=compileDelegationGraph({grants:[{id:'root',actions:['READ'],expiresAt:'2099-01-01T00:00:00Z'},{id:'child',parentId:'root',actions:['READ'],expiresAt:'2098-01-01T00:00:00Z'}]}); const r=graph.ok?revokeDelegationSubtree({graph,revokeId:'child',revokedAt:'2026-09-13T00:00:00Z',reason:'native-market-probe'}):graph; return {ok:graph.ok===true&&r.ok===true,digest:stableHash(r.revokedIds||r),authority:r.externalEffectAuthority}; } }
]);

function sourceIdentity(spec, rootDir) {
  const full=path.join(rootDir,spec.sourcePath);
  const bytes=fs.readFileSync(full);
  return { sourcePath: spec.sourcePath, sourceHash: hash(bytes), byteLength: bytes.length };
}

function runProbe(spec) {
  try {
    const a=spec.probe(); const b=spec.probe();
    const deterministic=a?.ok===true&&b?.ok===true&&a.digest===b.digest;
    const zeroAuthority=a?.authority==='NONE'&&b?.authority==='NONE';
    return {ok:deterministic&&zeroAuthority,deterministic,zeroAuthority,probeDigest:a?.digest||null};
  } catch (error) {
    return {ok:false,deterministic:false,zeroAuthority:false,error:String(error?.message||error)};
  }
}

export function inspectNativeCapabilityMarket({rootDir=ROOT, sourceRevision='WORKTREE', observedAt=new Date()}={}) {
  const now=new Date(observedAt); if(!Number.isFinite(now.getTime())) return envelope({ok:false,status:'NATIVE_CAPABILITY_MARKET_INVALID',reasonCodes:['valid-observed-at-required']});
  const capabilities=[]; const failures=[];
  for(const spec of SPECS){
    let source; try{source=sourceIdentity(spec,rootDir);}catch(error){failures.push({id:spec.id,reason:'source-unreadable',detail:String(error?.message||error)});continue;}
    const probe=runProbe(spec);
    if(!probe.ok){failures.push({id:spec.id,reason:'runtime-probe-failed',probe});continue;}
    const record={
      schemaVersion:'uberbond.native-capability.v1', id:spec.id, atomId:spec.atomId, taskClass:spec.taskClass,
      description:spec.description, sourceType:'NATIVE', sourceRevision:String(sourceRevision), ...source,
      maintainer:{name:'UberBond',ownershipClass:'FIRST_PARTY_REPOSITORY'}, licenseClass:'NATIVE_OWNED',
      permissions:[], credentialRequirements:[], networkRequirements:[], sideEffects:['NONE'], dataClasses:['INTERNAL_NON_SECRET','SOURCE_CODE'],
      verification:{static:{passed:true,subjectHash:source.sourceHash},semantic:{passed:probe.zeroAuthority,subjectHash:source.sourceHash},sandbox:{passed:probe.deterministic,subjectHash:source.sourceHash,probeDigest:probe.probeDigest}},
      promotionState:'ACTIVE_NATIVE_ZERO_EFFECT', lastEvaluatedAt:now.toISOString(), externalEffectAuthority:'NONE', businessEffectAuthority:'NONE'
    };
    record.capabilityDigest=stableHash(record); capabilities.push(record);
  }
  const state={total:SPECS.length,active:capabilities.length,failed:failures.length,atomIds:capabilities.map(x=>x.atomId).sort(),capabilityIds:capabilities.map(x=>x.id).sort()};
  return envelope({ok:failures.length===0,status:failures.length?'NATIVE_CAPABILITY_MARKET_DEGRADED':'NATIVE_CAPABILITY_MARKET_ACTIVE',state,capabilities,failures,marketDigest:stableHash({state,capabilities:capabilities.map(x=>({id:x.id,sourceHash:x.sourceHash,probe:x.verification.sandbox.probeDigest}))}),truthBoundary:'ACTIVE_NATIVE_ZERO_EFFECT_MEANS_EXACT_LOCAL_SOURCE_PLUS_DETERMINISTIC_ZERO_AUTHORITY_RUNTIME_PROBE. IT_DOES_NOT_APPROVE_THIRD_PARTY_SUPPLIERS, CREATE_EXTERNAL_EFFECT_AUTHORITY, OR PROVE_MARKET_VALUE.'});
}

export function retrieveNativeCapabilities({mission='',requiredAtomIds=[],market}={}){
  const snapshot=market||inspectNativeCapabilityMarket(); if(!snapshot.ok)return snapshot;
  const required=new Set((Array.isArray(requiredAtomIds)?requiredAtomIds:[]).map(String)); const words=new Set(String(mission).toLowerCase().match(/[a-z0-9-]{2,}/g)||[]);
  const ranked=snapshot.capabilities.map(cap=>{const atomHit=required.has(cap.atomId)?1:0;const text=`${cap.id} ${cap.atomId} ${cap.taskClass} ${cap.description}`.toLowerCase();let lexical=0;for(const w of words)if(text.includes(w))lexical++;return{capability:cap,score:atomHit*100+lexical};}).filter(row=>required.size===0||required.has(row.capability.atomId)).sort((a,b)=>b.score-a.score||a.capability.id.localeCompare(b.capability.id));
  const covered=new Set(ranked.map(r=>r.capability.atomId)); const missing=[...required].filter(id=>!covered.has(id)).sort();
  return envelope({ok:missing.length===0,status:missing.length?'NATIVE_CAPABILITY_GAP_REMAINS':'NATIVE_CAPABILITY_ROUTE_READY',results:ranked,missingAtomIds:missing,retrievalDigest:stableHash(ranked.map(r=>[r.capability.id,r.capability.sourceHash,r.score]))});
}
